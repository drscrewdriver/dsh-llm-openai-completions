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
 *
 * Multimodal true-send: because the short-circuit consumes the llm/stream
 * waterfall BEFORE the host projects file blocks to text handles, image /
 * audio / video / PDF blocks arrive structural and are encoded for the wire
 * (`image_url` / `input_audio` / `video_url` / OpenAI `file` parts). The
 * modality gate (enforceModalities) rejects any modality the model's llm-pi-ai
 * `input` declaration does not name BEFORE anything is sent — silent loss is
 * replaced by a loud refusal. One-shot calls (`purpose: 'session-title'`)
 * strip media blocks entirely.
 * @module dsh-llm-openai-completions/adapter/serialize
 */

import { LlmError } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import type { ModelCapability } from './config.ts'

/**
 * Duck-typed message/block faces spanning both supported host lines: 0.1.x
 * carries tool results as blocks inside user messages, 0.2.0 as first-class
 * `role: 'tool'` messages. The serializer handles both at runtime; the local
 * faces avoid importing a union that only exists on one line.
 */
export interface WireableBlock {
  type: string
  text?: string
  id?: string
  name?: string
  arguments?: string
  toolCallId?: string
  attachment?: { attachmentId?: string; mediaType?: string; name?: unknown }
}

export interface WireableMessage {
  role: string
  content?: readonly WireableBlock[]
  toolCallId?: string
}

/** One wire chat-completions message. */
export type WireMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | WireContentPart[] }
  | { role: 'assistant'; content: string; tool_calls?: WireToolCall[]; reasoning_content?: string }
  | { role: 'tool'; tool_call_id: string; content: string }

/**
 * One wire content part rendered on a user turn. Text, image URLs, and the
 * structural media parts are interleaved in the order of the source blocks.
 */
export type WireContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'input_audio'; input_audio: { data: string; format: string } }
  | { type: 'video_url'; video_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } }

/** Minimal durable image-reference shape (duck-typed against the attachment service). */
export interface ImageRef {
  attachmentId: string
  mediaType: string
  bytes: number
  width: number
  height: number
}

/** Resolves durable image refs to inline data-URI parts for vision requests. */
export interface ImageSource {
  readImage(ref: ImageRef, signal?: AbortSignal): Promise<{ mediaType: string; base64: string }>
}

/** One collected media blob, keyed by attachment id. */
export interface MediaBlob {
  mediaType: string
  data: Uint8Array
}

/** Media blobs available to the serializer, keyed by attachment id. */
export type MediaMap = Map<string, MediaBlob>

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

/** Media types by file extension (the subset that inlines structurally). */
const MEDIA_TYPES_BY_EXTENSION: Record<string, string> = {
  'pdf': 'application/pdf',
  'wav': 'audio/wav', 'mp3': 'audio/mpeg', 'm4a': 'audio/mp4', 'aac': 'audio/aac', 'ogg': 'audio/ogg', 'flac': 'audio/flac',
  'mp4': 'video/mp4', 'webm': 'video/webm', 'mov': 'video/quicktime', 'mkv': 'video/x-matroska',
}

/** Infer a file attachment's media type from its name. */
export function mediaTypeFromName(name: unknown): string | undefined {
  const dot = typeof name === 'string' ? name.lastIndexOf('.') : -1
  if (dot < 0) return undefined
  return MEDIA_TYPES_BY_EXTENSION[(name as string).slice(dot + 1).toLowerCase()]
}

const MODALITY_LABELS: Record<string, string> = { image: 'image', pdf: 'PDF document', video: 'video', audio: 'audio' }

/** The modality one content block requires, when it carries media at all. */
export function requiredModality(block: WireableBlock): string | undefined {
  if (block.type === 'image') return 'image'
  if (block.type === 'file') {
    const media = mediaTypeFromName((block.attachment as { name?: unknown } | undefined)?.name)
    if (media === 'application/pdf') return 'pdf'
    if (media?.startsWith('video/')) return 'video'
    if (media?.startsWith('audio/')) return 'audio'
  }
  return undefined
}

/**
 * Modality gate: reject the request when the message history carries a
 * modality the model's `input` declaration does not name. Runs over the FULL
 * history (the first send after a model switch naturally carries it all), so
 * an undeclared attachment is refused loudly instead of silently degraded.
 * @param options - the harness request.
 * @param capability - the target model's capability (its `input` declaration).
 * @throws LlmError naming the first missing modality and the two ways out.
 */
export function enforceModalities(options: GenerateOptions, capability: ModelCapability): void {
  const allowed = capability.input.length > 0 ? capability.input : ['text']
  const seen = new Set<string>()
  for (const message of options.messages as readonly WireableMessage[]) {
    for (const block of message.content ?? []) {
      const modality = requiredModality(block)
      if (modality === undefined || seen.has(modality)) continue
      seen.add(modality)
      if (!allowed.includes(modality)) {
        const label = MODALITY_LABELS[modality] ?? modality
        throw new LlmError(
          `model "${String(options.model)}" does not declare "${label}" input, but this session includes a ${label} attachment or history; switch to a model with ${label} input, or start a new session`,
          'INVALID_REQUEST',
        )
      }
    }
  }
}

/** Join the text blocks of a message (used for user/tool-result content). */
function flattenText(blocks: readonly WireableBlock[]): string {
  return blocks
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}

/** Serialize one assistant message: text, optional reasoning, tool calls. */
function serializeAssistant(message: WireableMessage): WireMessage {
  const content = message.content ?? []
  const text = flattenText(content)
  const reasoning = content
    .filter(block => block.type === 'reasoning')
    .map(block => block.text ?? '')
    .join('')
  const toolCalls = content
    .filter(block => block.type === 'tool-call')
    .map((block): WireToolCall => ({
      id: String(block.id ?? ''),
      type: 'function',
      function: { name: String(block.name ?? ''), arguments: String(block.arguments ?? '') },
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

/** Render one collected media blob to a base64 string. */
function base64Of(media: MediaBlob): string {
  return Buffer.from(media.data).toString('base64')
}

/**
 * Encode one file block for the wire from its collected bytes: PDF → OpenAI
 * `file` part, audio → `input_audio`, video → `video_url`, anything else → a
 * text placeholder (non-media attachments have no cross-gateway wire shape;
 * their content is reachable through the file tools instead).
 */
function serializeFilePart(name: string, media: MediaBlob): WireContentPart {
  const base64 = base64Of(media)
  if (media.mediaType === 'application/pdf') {
    return { type: 'file', file: { filename: name, file_data: `data:application/pdf;base64,${base64}` } }
  }
  if (media.mediaType.startsWith('audio/')) {
    return { type: 'input_audio', input_audio: { data: base64, format: media.mediaType.slice('audio/'.length) } }
  }
  if (media.mediaType.startsWith('video/')) {
    return { type: 'video_url', video_url: { url: `data:${media.mediaType};base64,${base64}` } }
  }
  // Unreachable when the modality gate passed and collection only fetched
  // recognized types; kept as a loud guard rather than a silent text handle.
  throw new LlmError(`openai-completions adapter cannot inline file "${name}" (${media.mediaType})`, 'UNSUPPORTED_CONTENT')
}

/**
 * Walk a user message's text/image/file blocks into OpenAI-compatible wire
 * parts, interleaved in the source-block order.
 * @param blocks - the user message content blocks, in order.
 * @param image - the attachment-aware image source (vision-capable only).
 * @param media - pre-collected media blobs keyed by attachment id.
 * @returns the ordered wire content parts.
 */
async function serializeUserParts(
  blocks: readonly WireableBlock[],
  image: ImageSource | undefined,
  media: MediaMap,
): Promise<WireContentPart[]> {
  const parts: WireContentPart[] = []
  for (const block of blocks) {
    if (block.type === 'text') {
      if ((block.text ?? '').length > 0) parts.push({ type: 'text', text: String(block.text) })
    } else if (block.type === 'image') {
      const attachment = block.attachment ?? {}
      const blob = media.get(String(attachment.attachmentId ?? ''))
      if (blob === undefined) {
        // Vision gate passed but bytes never arrived — fail loudly, never
        // submit a request that silently drops an image the user attached.
        if (image === undefined) {
          throw new LlmError('The openai-completions adapter does not support image content.', 'UNSUPPORTED_CONTENT')
        }
        const { mediaType, base64 } = await image.readImage(attachment as never)
        parts.push({ type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } })
        continue
      }
      parts.push({ type: 'image_url', image_url: { url: `data:${blob.mediaType};base64,${base64Of(blob)}` } })
    } else if (block.type === 'file') {
      const attachment = block.attachment ?? {}
      const name = String(attachment.name ?? 'attachment')
      const blob = media.get(String(attachment.attachmentId ?? ''))
      if (blob === undefined) {
        throw new LlmError(`openai-completions adapter is missing bytes for file "${name}"`, 'INVALID_REQUEST')
      }
      parts.push(serializeFilePart(name, blob))
    }
  }
  return parts
}

/**
 * Serialize the conversation. `tool-result` blocks become standalone
 * `{role: 'tool'}` messages; a mixed user message contributes its content
 * first and its tool results as separate wire messages after.
 *
 * Media blocks render only when the model declares the modality (the gate in
 * enforceModalities already refused undeclared ones) and their bytes were
 * collected.
 * @param messages - the harness conversation, in order.
 * @param image - the attachment-aware image source, or undefined for text-only.
 * @param media - pre-collected media blobs keyed by attachment id.
 * @returns the wire messages; order preserved, tool results expanded.
 */
export async function serializeMessages(
  messages: readonly WireableMessage[],
  image: ImageSource | undefined,
  media: MediaMap = new Map(),
): Promise<WireMessage[]> {
  const wire: WireMessage[] = []
  for (const message of messages) {
    if (message.role === 'system') {
      wire.push({ role: 'system', content: flattenText(message.content ?? []) })
      continue
    }
    if (message.role === 'tool') {
      // 0.2.0 shape: a first-class tool-role message.
      wire.push({
        role: 'tool',
        tool_call_id: String(message.toolCallId ?? ''),
        // Empty tool output still needs SOME content on the wire.
        content: flattenText(message.content ?? []) || '(no output)',
      })
      continue
    }
    if (message.role === 'assistant') {
      wire.push(serializeAssistant(message))
      continue
    }
    if (message.role === 'developer') {
      // Tool-update bookkeeping (additions/removals) — the host projects these
      // per route; raw blocks must not leak into the wire as user text.
      continue
    }
    const content = message.content ?? []
    // Media gating applies only to top-level user content (bytes live in the
    // attachment service); nested tool-result media is not expanded, matching
    // the text-first behavior for tool results. Image blocks need the lazy
    // image source; file blocks render from the pre-collected media map.
    if (content.some(block => block.type === 'image') && image === undefined) {
      throw new LlmError(
        'The openai-completions adapter does not support image content.',
        'UNSUPPORTED_CONTENT',
      )
    }
    if (content.some(block => block.type === 'image' || block.type === 'file')) {
      wire.push({ role: 'user', content: await serializeUserParts(content, image, media) })
      continue
    }
    // 0.1.x shape: tool results embedded in user messages as blocks.
    const toolResults = content.filter(block => block.type === 'tool-result')
    const text = flattenText(content)
    if (text.length > 0 || toolResults.length === 0) {
      wire.push({ role: 'user', content: text })
    }
    for (const result of toolResults) {
      wire.push({
        role: 'tool',
        tool_call_id: String(result.toolCallId ?? ''),
        // Empty tool output still needs SOME content on the wire.
        content: flattenText((result as WireableBlock & { content?: readonly WireableBlock[] }).content ?? []) || '(no output)',
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
 * `off` effort arrives. Its wire ALWAYS goes through `chat_template_kwargs.
 * enable_thinking` — that is the parameter vLLM's Qwen3 chat-template models
 * actually honor (top-level `enable_thinking` is ignored; llm-pi-ai's schema
 * withholds `qwen-chat-template` as a configurable format, so this adapter
 * must not depend on the configured thinkingFormat for toggle models). An
 * effort-capable model passes its level through as reasoning_effort per its
 * configured thinkingFormat.
 */
function resolveThinking(
  options: GenerateOptions,
  capability: ModelCapability,
): Pick<WireRequest, 'enable_thinking' | 'chat_template_kwargs' | 'reasoning_effort'> {
  const effort = options.reasoningEffort
  // One-shot calls (session title) never think: no effort, no toggle.
  const thinkingOn = options.purpose === 'session-title' ? false : effort !== 'off'
  if (!capability.supportsReasoningEffort) {
    // Toggle model: always the chat-template wire (vLLM Qwen3 honors
    // chat_template_kwargs.enable_thinking; top-level enable_thinking and
    // reasoning_effort are both ignored/rejected by such gateways).
    return { chat_template_kwargs: { enable_thinking: thinkingOn, preserve_thinking: true } }
  }
  const format = capability.thinkingFormat ?? 'openai'
  if (format === 'qwen') {
    // Qwen3-style: the wire carries enable_thinking only — never
    // reasoning_effort, never a budget.
    return { enable_thinking: thinkingOn }
  }
  if (format === 'qwen-chat-template') {
    return { chat_template_kwargs: { enable_thinking: thinkingOn, preserve_thinking: true } }
  }
  // openai / deepseek / zai / … effort-capable models: pass the effort through
  // (Qwen3.8-style), or omit it when thinking is off.
  return thinkingOn && typeof effort === 'string'
    ? { reasoning_effort: effort }
    : {}
}

/**
 * Strip media blocks for one-shot calls (`purpose: 'session-title'`): a title
 * call must not pay the bytes of a session's attachments. A user message left
 * without text or tool results is dropped entirely.
 */
function stripMedia(messages: readonly WireableMessage[]): WireableMessage[] {
  const next: WireableMessage[] = []
  for (const message of messages) {
    if (message.role !== 'user') {
      next.push(message)
      continue
    }
    const content = message.content ?? []
    const kept = content.filter((block) => requiredModality(block) === undefined)
    const toolResults = kept.filter((block) => block.type === 'tool-result')
    const text = flattenText(kept)
    if (text.length === 0 && toolResults.length === 0 && kept.length !== content.length) continue
    next.push(kept.length === content.length ? message : { ...message, content: kept })
  }
  return next
}

/**
 * Build the full wire request. Always streaming with usage reporting.
 * @param options - the harness request (model, history, system, tools, sampling).
 * @param capability - the model's capability config (thinking format, effort, modalities).
 * @param image - the attachment-aware image source; only honored when the
 *   model is vision-capable (non-vision models keep rejecting images loudly).
 * @param media - pre-collected media blobs keyed by attachment id.
 * @returns the chat-completions request body.
 */
export async function serializeRequest(
  options: GenerateOptions,
  capability: ModelCapability,
  image: ImageSource | undefined,
  media: MediaMap = new Map(),
): Promise<WireRequest> {
  if (options.purpose === 'session-title') options = { ...options, messages: stripMedia(options.messages as readonly WireableMessage[]) as never }

  const messages: WireMessage[] = []
  if (options.system !== undefined) {
    messages.push({ role: 'system', content: options.system })
  }
  messages.push(...await serializeMessages(options.messages as readonly WireableMessage[], capability.vision ? image : undefined, media))

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
