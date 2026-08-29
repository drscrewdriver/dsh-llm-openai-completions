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
export const DONE = '[DONE]'

/**
 * Decode an SSE byte stream into event `data` payloads, `[DONE]` last.
 * @param stream - raw SSE bytes; reads may split anywhere, including mid-UTF-8.
 * @returns each event's data payload in arrival order, then `[DONE]`.
 * @throws when the stream ends without the `[DONE]` sentinel (truncated).
 */
export async function* parseSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder()
  const reader = stream.getReader()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
      // Split on blank-line-terminated events; a trailing partial event stays
      // buffered until its terminator (spec-strict: no flush at EOF without one).
      let sep: number
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        const data = eventData(event)
        if (data !== undefined) {
          yield data
          if (data === DONE) return
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
  // An unterminated tail at EOF is truncation, not a flushable event.
  throw new Error('SSE stream ended without [DONE]')
}

/**
 * Extract the joined `data:` field of one SSE event (before the blank line).
 * `\r\n` line endings are tolerated; comment lines (`:`) are skipped; other
 * fields are ignored. An event with no data yields `undefined`.
 */
function eventData(event: string): string | undefined {
  const lines = event.split(/\r?\n/)
  const data: string[] = []
  for (const line of lines) {
    if (line.startsWith(':')) continue // comment
    if (line.startsWith('data:')) {
      // `data:` with a leading space strips it; bare `data:` contributes "".
      data.push(line.slice(5).replace(/^ /, ''))
    }
  }
  if (data.length === 0) return undefined
  return data.join('\n')
}
