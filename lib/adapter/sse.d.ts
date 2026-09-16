/**
 * Minimal SSE decoding for openai-completions responses.
 *
 * The wire is line-based events separated by blank lines; only `data:` fields
 * matter here (OpenAI sends no `event:`/`id:` on chat-completions streams).
 * Multi-line `data:` values join with a newline, matching the EventSource
 * spec. The literal `[DONE]` sentinel is yielded last so the caller owns
 * final flushing; EOF before it is truncation and throws.
 *
 * Kept dependency-free (a ~40-line implementation) so the adapter adds no
 * runtime dependencies.
 * @module dsh-thinking-levels/adapter/sse
 */
/** The terminal payload OpenAI-compatible servers send after the last chunk. */
export declare const DONE = "[DONE]";
/**
 * Decode an SSE byte stream into event `data` payloads, `[DONE]` last.
 * @param stream - raw SSE bytes; reads may split anywhere, including mid-UTF-8.
 * @returns each event's data payload in arrival order, then `[DONE]`.
 * @throws when the stream ends without the `[DONE]` sentinel (truncated).
 */
export declare function parseSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<string>;
