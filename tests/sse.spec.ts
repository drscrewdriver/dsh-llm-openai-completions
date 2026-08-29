import { describe, expect, it } from 'vitest'
import { parseSse } from '../src/adapter/sse.ts'

/** Build an SSE byte stream from string chunks (split anywhere, like the wire). */
function sseStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  })
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const out: string[] = []
  for await (const payload of parseSse(stream)) out.push(payload)
  return out
}

describe('parseSse', () => {
  it('yields data payloads and the [DONE] sentinel', async () => {
    const payloads = await collect(sseStream(
      'data: {"a":1}\n\ndata: {"b":2}\n\ndata: [DONE]\n\n',
    ))
    expect(payloads).toEqual(['{"a":1}', '{"b":2}', '[DONE]'])
  })

  it('joins multi-line data fields with a newline', async () => {
    const payloads = await collect(sseStream('data: line1\ndata: line2\n\ndata: [DONE]\n\n'))
    expect(payloads).toEqual(['line1\nline2', '[DONE]'])
  })

  it('skips comment lines and non-data fields', async () => {
    const payloads = await collect(sseStream(
      ': keepalive\nid: 5\ndata: {"ok":true}\n\ndata: [DONE]\n\n',
    ))
    expect(payloads).toEqual(['{"ok":true}', '[DONE]'])
  })

  it('tolerates \\r\\n line endings', async () => {
    const payloads = await collect(sseStream('data: {"x":1}\r\n\r\ndata: [DONE]\r\n\r\n'))
    expect(payloads).toEqual(['{"x":1}', '[DONE]'])
  })

  it('buffers events split across reads', async () => {
    // Split the byte stream mid-payload to simulate chunked transport.
    const full = 'data: {"hello":"world"}\n\ndata: [DONE]\n\n'
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const bytes = new TextEncoder().encode(full)
        controller.enqueue(bytes.slice(0, 17))
        controller.enqueue(bytes.slice(17))
        controller.close()
      },
    })
    const payloads = await collect(stream)
    expect(payloads).toEqual(['{"hello":"world"}', '[DONE]'])
  })

  it('throws when the stream ends without [DONE]', async () => {
    await expect(collect(sseStream('data: {"a":1}\n\n'))).rejects.toThrow(/without \[DONE\]/)
  })
})
