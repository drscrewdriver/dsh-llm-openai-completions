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
import type { GenerateOptions } from '@deepseek-ai/dsh-llm';
import type { ModelCapability } from './config.ts';
/**
 * Duck-typed message/block faces spanning both supported host lines: 0.1.x
 * carries tool results as blocks inside user messages, 0.2.0 as first-class
 * `role: 'tool'` messages. The serializer handles both at runtime; the local
 * faces avoid importing a union that only exists on one line.
 */
export interface WireableBlock {
    type: string;
    text?: string;
    id?: string;
    name?: string;
    arguments?: string;
    toolCallId?: string;
    attachment?: {
        attachmentId?: string;
        mediaType?: string;
        name?: unknown;
    };
}
export interface WireableMessage {
    role: string;
    content?: readonly WireableBlock[];
    toolCallId?: string;
}
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
 * One wire content part rendered on a user turn. Text, image URLs, and the
 * structural media parts are interleaved in the order of the source blocks.
 */
export type WireContentPart = {
    type: 'text';
    text: string;
} | {
    type: 'image_url';
    image_url: {
        url: string;
    };
} | {
    type: 'input_audio';
    input_audio: {
        data: string;
        format: string;
    };
} | {
    type: 'video_url';
    video_url: {
        url: string;
    };
} | {
    type: 'file';
    file: {
        filename: string;
        file_data: string;
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
/** One collected media blob, keyed by attachment id. */
export interface MediaBlob {
    mediaType: string;
    data: Uint8Array;
}
/** Media blobs available to the serializer, keyed by attachment id. */
export type MediaMap = Map<string, MediaBlob>;
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
/** Infer a file attachment's media type from its name. */
export declare function mediaTypeFromName(name: unknown): string | undefined;
/** The modality one content block requires, when it carries media at all. */
export declare function requiredModality(block: WireableBlock): string | undefined;
/**
 * Modality gate: reject the request when the message history carries a
 * modality the model's `input` declaration does not name. Runs over the FULL
 * history (the first send after a model switch naturally carries it all), so
 * an undeclared attachment is refused loudly instead of silently degraded.
 * @param options - the harness request.
 * @param capability - the target model's capability (its `input` declaration).
 * @throws LlmError naming the first missing modality and the two ways out.
 */
export declare function enforceModalities(options: GenerateOptions, capability: ModelCapability): void;
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
export declare function serializeMessages(messages: readonly WireableMessage[], image: ImageSource | undefined, media?: MediaMap): Promise<WireMessage[]>;
/**
 * Build the full wire request. Always streaming with usage reporting.
 * @param options - the harness request (model, history, system, tools, sampling).
 * @param capability - the model's capability config (thinking format, effort, modalities).
 * @param image - the attachment-aware image source; only honored when the
 *   model is vision-capable (non-vision models keep rejecting images loudly).
 * @param media - pre-collected media blobs keyed by attachment id.
 * @returns the chat-completions request body.
 */
export declare function serializeRequest(options: GenerateOptions, capability: ModelCapability, image: ImageSource | undefined, media?: MediaMap): Promise<WireRequest>;
