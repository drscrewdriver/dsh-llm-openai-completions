/**
 * Serialize harness messages into an OpenAI-compatible chat-completions body
 * for custom gateways (vLLM / LM Studio / self-hosted OpenAI proxies).
 *
 * Deliberately minimal versus pi-ai: `system` is ALWAYS `role: "system"` (a
 * custom gateway must never receive `developer`), and thinking is driven by
 * the model's `compat.thinkingFormat`:
 * - `qwen`              → top-level `enable_thinking: boolean`
 * - `qwen-chat-template`→ `chat_template_kwargs.enable_thinking` (+ preserve)
 * - effort-capable      → `reasoning_effort` passthrough (Qwen3.8-style)
 * - anything else       → thinking off unless an effort is set
 *
 * No `thinking_budget` is sent (user decision: avoid truncation surprises).
 * @module dsh-thinking-levels/adapter/serialize
 */

import { LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import type { ModelCapability } from './config.ts'

/** One wire chat-completions message. */
export type WireMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: WireToolCall[]; reasoning_content?: string }
  | { role: 'tool'; tool_call_id: string; content: string }

/** One wire tool call. */
export interface WireToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/** One wire tool definition. */
export interface WireTool {
  type: 'function'
  function: { name: string; description: string; parameters: unknown }
}

/** The serialized chat-completions request body. */
export interface WireRequest {
  model: string
  messages: WireMessage[]
  stream: true
  stream_options: { include_usage: true }
  enable_thinking?: boolean
  chat_template_kwargs?: { enable_thinking: boolean; preserve_thinking: boolean }
  reasoning_effort?: string
  tools?: WireTool[]
  temperature?: number
  max_tokens?: number
  stop?: string[]
}

/** Join the text blocks of a message (used for user/tool-result content). */
function flattenText(blocks: readonly ContentBlock[]): string {
  return blocks
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}

/** Serialize one assistant message: text, optional reasoning, tool calls. */
function serializeAssistant(message: Message): WireMessage {
  const text = flattenText(message.content)
  const reasoning = message.content
    .filter(block => block.type === 'reasoning')
    .map(block => block.text)
    .join('')
  const toolCalls = message.content
    .filter(block => block.type === 'tool-call')
    .map((block): WireToolCall => ({
      id: block.id,
      type: 'function',
      function: { name: block.name, arguments: block.arguments },
    }))
  return {
    role: 'assistant',
    // Text-less turns send "" — never null (gateways reject null).
    content: text,
    // Reasoning is passed back only on tool-call turns (thinking passback).
    ...toolCalls.length > 0 && reasoning.length > 0 ? { reasoning_content: reasoning } : {},
    ...toolCalls.length > 0 ? { tool_calls: toolCalls } : {},
  }
}

/**
 * Serialize the conversation. `tool-result` blocks become standalone
 * `{role: 'tool'}` messages; a mixed user message contributes its text first
 * and its tool results as separate wire messages after.
 * @param messages - the harness conversation, in order.
 * @returns the wire messages; order preserved, tool results expanded.
 */
export function serializeMessages(messages: readonly Message[]): WireMessage[] {
  const wire: WireMessage[] = []
  for (const message of messages) {
    if (message.role === 'system') {
      wire.push({ role: 'system', content: flattenText(message.content) })
      continue
    }
    if (message.role === 'assistant') {
      wire.push(serializeAssistant(message))
      continue
    }
    const toolResults = message.content.filter(block => block.type === 'tool-result')
    const text = flattenText(message.content)
    // Image blocks are attachment references (bytes live in the attachment
    // service); this text-first adapter rejects them loudly instead of
    // silently erasing content, like the official deepseek adapter.
    if (message.content.some(block => block.type === 'image')) {
      throw new LlmError(
        'The openai-completions adapter does not support image content.',
        'UNSUPPORTED_CONTENT',
      )
    }
    if (text.length > 0 || toolResults.length === 0) {
      wire.push({ role: 'user', content: text })
    }
    for (const result of toolResults) {
      wire.push({
        role: 'tool',
        tool_call_id: result.toolCallId,
        // Empty tool output still needs SOME content on the wire.
        content: flattenText(result.content) || '(no output)',
      })
    }
  }
  return wire
}

/**
 * Resolve the thinking wire fields from the request effort + model capability.
 *
 * A model that does not take reasoning_effort (supportsReasoningEffort: false
 * — Qwen3.6 / mimo-v2.5 style) is a toggle: thinking is ON unless an explicit
 * `off` effort arrives, and the wire carries enable_thinking only — no
 * reasoning_effort, no effort value is required (the harness strips the On
 * toggle to no effort at all). An effort-capable model passes its level
 * through as reasoning_effort.
 */
function resolveThinking(
  options: GenerateOptions,
  capability: ModelCapability,
): Pick<WireRequest, 'enable_thinking' | 'chat_template_kwargs' | 'reasoning_effort'> {
  const effort = options.reasoningEffort
  // Toggle models think by default: any state other than an explicit `off` is
  // thinking on. Effort-capable models need a concrete level to send one.
  const thinkingOn = effort !== 'off'
  const format = capability.thinkingFormat ?? 'openai'
  if (format === 'qwen') {
    // Qwen3.6-style: the wire carries enable_thinking only — never
    // reasoning_effort, never a budget.
    return { enable_thinking: thinkingOn }
  }
  if (format === 'qwen-chat-template') {
    return { chat_template_kwargs: { enable_thinking: thinkingOn, preserve_thinking: true } }
  }
  // openai / deepseek / zai / … effort-capable models: pass the effort through
  // (Qwen3.8-style), or omit it when thinking is off.
  return thinkingOn && capability.supportsReasoningEffort && typeof effort === 'string'
    ? { reasoning_effort: effort }
    : {}
}

/**
 * Build the full wire request. Always streaming with usage reporting.
 * @param options - the harness request (model, history, system, tools, sampling).
 * @param capability - the model's capability config (thinking format, effort).
 * @returns the chat-completions request body.
 */
export function serializeRequest(
  options: GenerateOptions,
  capability: ModelCapability,
): WireRequest {
  const messages: WireMessage[] = []
  if (options.system !== undefined) {
    messages.push({ role: 'system', content: options.system })
  }
  messages.push(...serializeMessages(options.messages))

  const tools: WireTool[] | undefined = options.tools?.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))

  return {
    model: options.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    ...resolveThinking(options, capability),
    ...tools !== undefined && tools.length > 0 ? { tools } : {},
    ...options.temperature !== undefined ? { temperature: options.temperature } : {},
    ...options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens },
    ...options.stop !== undefined ? { stop: options.stop } : {},
  }
}
