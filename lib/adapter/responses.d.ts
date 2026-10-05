import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { MediaMap } from './serialize.ts';
import type { ModelCapability } from './config.ts';
/** One input item (the subset this face emits). */
type InputItem = {
    type: 'message';
    role: 'user' | 'assistant';
    content: Array<Record<string, unknown>>;
} | {
    type: 'function_call';
    call_id: string;
    name: string;
    arguments: string;
} | {
    type: 'function_call_output';
    call_id: string;
    output: string;
};
/** The serialized openai-responses request body. */
export interface ResponsesRequest {
    model: string;
    stream: true;
    instructions?: string;
    input: InputItem[];
    max_output_tokens?: number;
    reasoning?: {
        effort: 'minimal' | 'low' | 'medium' | 'high';
    };
    temperature?: number;
    tools?: Array<{
        type: 'function';
        name: string;
        description: string;
        parameters: unknown;
        strict: boolean;
    }>;
}
/** Map a harness effort tier onto the Responses vocabulary (omit on/off). */
export declare function effortFor(effort: unknown): 'minimal' | 'low' | 'medium' | 'high' | undefined;
/**
 * Serialize the full openai-responses request.
 * @param options - the harness request (prompt-source already applied).
 * @param capability - the model's capability (unused for the ceiling chain here
 *   beyond symmetry; Responses takes max_output_tokens from the request).
 * @param media - pre-collected media blobs keyed by attachment id.
 */
export declare function serializeResponses(options: GenerateOptions, capability: ModelCapability, media: MediaMap): ResponsesRequest;
/**
 * Consume Responses SSE payloads and yield StreamChunks. Item lifecycle:
 * `response.output_item.added` opens message/reasoning/function_call items,
 * `response.output_text.delta` / `response.reasoning_summary_text.delta` /
 * `response.function_call_arguments.delta` feed them,
 * `response.completed` closes everything with usage, `response.failed` /
 * `error` are loud failures.
 */
export declare function translateResponses(payloads: AsyncIterable<string>): AsyncGenerator<StreamChunk>;
export {};
