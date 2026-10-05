import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { MediaMap } from './serialize.ts';
import type { ModelCapability } from './config.ts';
/** One anthropic content block (the subset this face emits). */
type AnthropicBlock = {
    type: 'text';
    text: string;
} | {
    type: 'image';
    source: {
        type: 'base64';
        media_type: string;
        data: string;
    };
} | {
    type: 'tool_use';
    id: string;
    name: string;
    input: unknown;
} | {
    type: 'tool_result';
    tool_use_id: string;
    content: string;
};
/** One anthropic wire message. */
export interface AnthropicMessage {
    role: 'user' | 'assistant';
    content: AnthropicBlock[];
}
/** The serialized anthropic-messages request body. */
export interface AnthropicRequest {
    model: string;
    stream: true;
    messages: AnthropicMessage[];
    max_tokens: number;
    thinking: {
        type: 'enabled' | 'disabled';
    };
    system?: string;
    temperature?: number;
    stop_sequences?: string[];
    tools?: Array<{
        name: string;
        description: string;
        input_schema: unknown;
    }>;
}
/**
 * Serialize the full anthropic-messages request.
 * @param options - the harness request (prompt-source already applied).
 * @param capability - the model's capability (maxTokens ceiling for the fallback chain).
 * @param media - pre-collected media blobs keyed by attachment id.
 * @returns the wire body plus the endpoint path segment.
 */
export declare function serializeAnthropic(options: GenerateOptions, capability: ModelCapability, media: MediaMap): AnthropicRequest;
/**
 * Consume anthropic SSE payloads and yield StreamChunks. Block lifecycle:
 * `content_block_start` opens text/thinking/tool_use blocks,
 * `content_block_delta` feeds them, `content_block_stop` closes each,
 * `message_delta` carries the finish reason and output usage,
 * `message_stop` ends the stream. thinking blocks become reasoning chunks;
 * `signature_delta` is ignored (the harness reasoning block has no field
 * for it — see the module note on replay).
 */
export declare function translateAnthropic(payloads: AsyncIterable<string>): AsyncGenerator<StreamChunk>;
export {};
