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
import type { GenerateOptions, Message } from '@deepseek-ai/dsh-llm';
import type { ModelCapability } from './config.ts';
/** One wire chat-completions message. */
export type WireMessage = {
    role: 'system';
    content: string;
} | {
    role: 'user';
    content: string | WireContentPart[];
} | {
    role: 'assistant';
    content: string;
    tool_calls?: WireToolCall[];
    reasoning_content?: string;
} | {
    role: 'tool';
    tool_call_id: string;
    content: string;
};
/**
 * One wire content part rendered on a user turn. Text and image URLs are
 * interleaved in the order of the source blocks; gateways require the
 * OpenAI-compatible `image_url` shape for vision requests.
 */
export type WireContentPart = {
    type: 'text';
    text: string;
} | {
    type: 'image_url';
    image_url: {
        url: string;
    };
};
/** Minimal durable image-reference shape (duck-typed against the attachment service). */
export interface ImageRef {
    attachmentId: string;
    mediaType: string;
    bytes: number;
    width: number;
    height: number;
}
/** Resolves durable image refs to inline data-URI parts for vision requests. */
export interface ImageSource {
    readImage(ref: ImageRef, signal?: AbortSignal): Promise<{
        mediaType: string;
        base64: string;
    }>;
}
/** One wire tool call. */
export interface WireToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}
/** One wire tool definition. */
export interface WireTool {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: unknown;
    };
}
/** The serialized chat-completions request body. */
export interface WireRequest {
    model: string;
    messages: WireMessage[];
    stream: true;
    stream_options: {
        include_usage: true;
    };
    enable_thinking?: boolean;
    chat_template_kwargs?: {
        enable_thinking: boolean;
        preserve_thinking: boolean;
    };
    reasoning_effort?: string;
    tools?: WireTool[];
    temperature?: number;
    max_tokens?: number;
    stop?: string[];
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
export declare function serializeMessages(messages: readonly Message[], image: ImageSource | undefined): Promise<WireMessage[]>;
/**
 * Build the full wire request. Always streaming with usage reporting.
 * @param options - the harness request (model, history, system, tools, sampling).
 * @param capability - the model's capability config (thinking format, effort, vision).
 * @param image - the attachment-aware image source; only honored when the
 *   model is vision-capable (non-vision models keep rejecting images loudly).
 * @returns the chat-completions request body.
 */
export declare function serializeRequest(options: GenerateOptions, capability: ModelCapability, image: ImageSource | undefined): Promise<WireRequest>;
