/**
 * Translate openai-completions SSE payloads into the harness StreamChunk
 * protocol, with one stateful block per content/reasoning/tool-call index.
 *
 * Reasoning is read from any of the fields OpenAI-compatible servers use
 * (`reasoning_content` / `reasoning` / `reasoning_text`); vLLM's Qwen3
 * deployment additionally renders thinking into `content` terminated by a
 * lone `</think>` tag, which is split here: the segment before the tag feeds
 * a reasoning block, the remainder text. Block-end, usage, and finish are
 * deferred to the `[DONE]` sentinel, so no chunk follows `finish`.
 * @module dsh-thinking-levels/adapter/translate
 */
import type { FinishReason, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm';
/** One wire delta chunk (the subset of chat-completions this adapter reads). */
interface WireChunk {
    choices?: Array<{
        delta?: {
            role?: string;
            content?: string | null;
            reasoning_content?: string | null;
            reasoning?: string | null;
            reasoning_text?: string | null;
            tool_calls?: Array<{
                index?: number;
                id?: string;
                function?: {
                    name?: string;
                    arguments?: string;
                };
            }>;
        };
        finish_reason?: string | null;
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        prompt_tokens_details?: {
            cached_tokens?: number;
        };
        completion_tokens_details?: {
            reasoning_tokens?: number;
        };
    };
}
/** Map the wire finish_reason vocabulary to the harness FinishReason. */
export declare function mapFinishReason(reason: string): FinishReason;
/** Map wire usage to disjoint harness counts. */
export declare function mapUsage(usage: NonNullable<WireChunk['usage']>): TokenUsage;
/**
 * Consume SSE data payloads (ending with `[DONE]`) and yield StreamChunks.
 * @param payloads - SSE data payloads from {@link parseSse}, `[DONE]`-terminated.
 * @returns deltas as they arrive; `block-end`s, `usage`, and `finish` deferred
 *   to the `[DONE]` sentinel. A stop with no blocks maps to EMPTY_RESPONSE.
 */
export declare function translate(payloads: AsyncIterable<string>): AsyncGenerator<StreamChunk>;
export {};
