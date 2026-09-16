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
import { LlmError } from '@deepseek-ai/dsh-llm';
/** Join the text blocks of a message (used for user/tool-result content). */
function flattenText(blocks) {
    return blocks
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('');
}
/** Serialize one assistant message: text, optional reasoning, tool calls. */
function serializeAssistant(message) {
    const text = flattenText(message.content);
    const reasoning = message.content
        .filter(block => block.type === 'reasoning')
        .map(block => block.text)
        .join('');
    const toolCalls = message.content
        .filter(block => block.type === 'tool-call')
        .map((block) => ({
        id: block.id,
        type: 'function',
        function: { name: block.name, arguments: block.arguments },
    }));
    return {
        role: 'assistant',
        // Text-less turns send "" — never null (gateways reject null).
        content: text,
        // Reasoning is passed back only on tool-call turns (thinking passback).
        ...toolCalls.length > 0 && reasoning.length > 0 ? { reasoning_content: reasoning } : {},
        ...toolCalls.length > 0 ? { tool_calls: toolCalls } : {},
    };
}
/**
 * Walk a user message's text/image blocks into OpenAI-compatible wire parts.
 * Text and image parts stay interleaved in the source-block order; bytes are
 * resolved through the image source (an attachment store) into data URIs.
 * @param blocks - the user message content blocks, in order.
 * @param image - the attachment-aware image source (vision-capable only).
 * @returns the ordered wire content parts.
 */
async function serializeUserParts(blocks, image) {
    const parts = [];
    for (const block of blocks) {
        if (block.type === 'text') {
            if (block.text.length > 0)
                parts.push({ type: 'text', text: block.text });
        }
        else if (block.type === 'image') {
            const { mediaType, base64 } = await image.readImage(block.attachment);
            parts.push({ type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } });
        }
    }
    return parts;
}
/**
 * Serialize the conversation. `tool-result` blocks become standalone
 * `{role: 'tool'}` messages; a mixed user message contributes its content
 * first and its tool results as separate wire messages after.
 *
 * When a user message carries `image` blocks:
 * - with a vision-capable model, `image` is supplied (see adapter) and the
 *   blocks render as interleaved text/image wire parts in original order;
 * - otherwise (`image` undefined) the adapter rejects them loudly instead of
 *   silently erasing content, like the official deepseek adapter.
 * @param messages - the harness conversation, in order.
 * @param image - the attachment-aware image source, or undefined for text-only.
 * @returns the wire messages; order preserved, tool results expanded.
 */
export async function serializeMessages(messages, image) {
    const wire = [];
    for (const message of messages) {
        if (message.role === 'system') {
            wire.push({ role: 'system', content: flattenText(message.content) });
            continue;
        }
        if (message.role === 'assistant') {
            wire.push(serializeAssistant(message));
            continue;
        }
        // Image gating applies only to top-level user content (bytes live in the
        // attachment service); nested tool-result images are not expanded, matching
        // the existing text-first behavior for tool results.
        if (message.content.some(block => block.type === 'image')) {
            if (image === undefined) {
                throw new LlmError('The openai-completions adapter does not support image content.', 'UNSUPPORTED_CONTENT');
            }
            wire.push({ role: 'user', content: await serializeUserParts(message.content, image) });
            continue;
        }
        const toolResults = message.content.filter(block => block.type === 'tool-result');
        const text = flattenText(message.content);
        if (text.length > 0 || toolResults.length === 0) {
            wire.push({ role: 'user', content: text });
        }
        for (const result of toolResults) {
            wire.push({
                role: 'tool',
                tool_call_id: result.toolCallId,
                // Empty tool output still needs SOME content on the wire.
                content: flattenText(result.content) || '(no output)',
            });
        }
    }
    return wire;
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
function resolveThinking(options, capability) {
    const effort = options.reasoningEffort;
    // Toggle models think by default: any state other than an explicit `off` is
    // thinking on. Effort-capable models need a concrete level to send one.
    const thinkingOn = effort !== 'off';
    if (!capability.supportsReasoningEffort) {
        // Toggle model: always the chat-template wire (vLLM Qwen3 honors
        // chat_template_kwargs.enable_thinking; top-level enable_thinking and
        // reasoning_effort are both ignored/rejected by such gateways).
        return { chat_template_kwargs: { enable_thinking: thinkingOn, preserve_thinking: true } };
    }
    const format = capability.thinkingFormat ?? 'openai';
    if (format === 'qwen') {
        // Qwen3-style: the wire carries enable_thinking only — never
        // reasoning_effort, never a budget.
        return { enable_thinking: thinkingOn };
    }
    if (format === 'qwen-chat-template') {
        return { chat_template_kwargs: { enable_thinking: thinkingOn, preserve_thinking: true } };
    }
    // openai / deepseek / zai / … effort-capable models: pass the effort through
    // (Qwen3.8-style), or omit it when thinking is off.
    return thinkingOn && typeof effort === 'string'
        ? { reasoning_effort: effort }
        : {};
}
/**
 * Build the full wire request. Always streaming with usage reporting.
 * @param options - the harness request (model, history, system, tools, sampling).
 * @param capability - the model's capability config (thinking format, effort, vision).
 * @param image - the attachment-aware image source; only honored when the
 *   model is vision-capable (non-vision models keep rejecting images loudly).
 * @returns the chat-completions request body.
 */
export async function serializeRequest(options, capability, image) {
    const messages = [];
    if (options.system !== undefined) {
        messages.push({ role: 'system', content: options.system });
    }
    messages.push(...await serializeMessages(options.messages, capability.vision ? image : undefined));
    const tools = options.tools?.map(tool => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
        },
    }));
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
    };
}
