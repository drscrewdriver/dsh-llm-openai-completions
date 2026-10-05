import { describe, expect, it } from 'vitest'
import { serializeResponses, translateResponses, effortFor } from '../src/adapter/responses.ts'
import type { ModelCapability } from '../src/adapter/config.ts'

const capability = (over: Partial<ModelCapability> = {}): ModelCapability => ({
  thinkingFormat: 'qwen',
  supportsReasoningEffort: false,
  reasoningEfforts: {},
  input: ['text', 'image'],
  vision: true,
  ...over,
})

const request = (over: Record<string, unknown> = {}) => ({
  provider: 'mimo-responses',
  model: 'mimo-v2.6',
  system: undefined as string | undefined,
  messages: [
    { role: 'system', content: [{ type: 'text', text: 'base system prompt' }] },
    { role: 'user', content: [{ type: 'text', text: 'hi' }] },
  ],
  ...over,
}) as never

const media = (entries: Array<[string, { mediaType: string; text: string }]> = []) => {
  const map = new Map()
  for (const [id, { mediaType, text }] of entries) map.set(id, { mediaType, data: Buffer.from(text, 'utf8') })
  return map
}

async function collect(payloads: unknown[]) {
  const chunks = []
  for await (const chunk of translateResponses(payloads as never)) chunks.push(chunk)
  return chunks
}

describe('effortFor — honest Responses vocabulary mapping', () => {
  it('passes the four native tiers through', () => {
    expect(effortFor('minimal')).toBe('minimal')
    expect(effortFor('low')).toBe('low')
    expect(effortFor('medium')).toBe('medium')
    expect(effortFor('high')).toBe('high')
  })

  it('folds xhigh/max into high; on/off/absent omit the field', () => {
    expect(effortFor('xhigh')).toBe('high')
    expect(effortFor('max')).toBe('high')
    expect(effortFor('on')).toBeUndefined()
    expect(effortFor('off')).toBeUndefined()
    expect(effortFor(undefined)).toBeUndefined()
  })
})

describe('serializeResponses — body matrix', () => {
  it('extracts the leading system message into instructions and strips it from input (F2)', () => {
    const body = serializeResponses(request(), capability(), new Map())
    expect(body.instructions).toBe('base system prompt')
    expect(body.input).toHaveLength(1)
    expect(body.input[0]).toMatchObject({ type: 'message', role: 'user' })
    expect(JSON.stringify(body.input)).not.toContain('base system prompt')
  })

  it('F1 symmetry: options.maxTokens wins, then the model row; absent omits the field', () => {
    expect(serializeResponses(request({ maxTokens: 555 }), capability({ maxTokens: 88_000 }), new Map()).max_output_tokens).toBe(555)
    expect(serializeResponses(request(), capability({ maxTokens: 88_000 }), new Map()).max_output_tokens).toBe(88_000)
    expect(serializeResponses(request(), capability(), new Map()).max_output_tokens).toBeUndefined()
  })

  it('reasoning.effort follows the request tier; off omits the field', () => {
    expect(serializeResponses(request({ reasoningEffort: 'xhigh' }), capability(), new Map()).reasoning).toEqual({ effort: 'high' })
    expect(serializeResponses(request({ reasoningEffort: 'off' }), capability(), new Map()).reasoning).toBeUndefined()
  })

  it('tools serialize as flat function definitions with strict:false', () => {
    const body = serializeResponses(request({
      tools: [{ name: 'bash', description: 'run', parameters: { type: 'object' } }],
    }) as never, capability(), new Map())
    expect(body.tools).toEqual([{ type: 'function', name: 'bash', description: 'run', parameters: { type: 'object' }, strict: false }])
  })

  it('image parts render as input_image data URIs; pdf as input_file', () => {
    const body = serializeResponses(request({
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'see' },
        { type: 'image', attachment: { attachmentId: 'i1', mediaType: 'image/png' } },
        { type: 'file', attachment: { attachmentId: 'p1', name: 'doc.pdf' } },
      ] }],
    }) as never, capability(), media([
      ['i1', { mediaType: 'image/png', text: 'PNG' }],
      ['p1', { mediaType: 'application/pdf', text: 'PDF' }],
    ]))
    const content = (body.input[0] as { content: Array<Record<string, unknown>> }).content
    expect(content[1]).toEqual({ type: 'input_image', image_url: `data:image/png;base64,${Buffer.from('PNG').toString('base64')}` })
    expect(content[2]).toEqual({ type: 'input_file', filename: 'doc.pdf', file_data: `data:application/pdf;base64,${Buffer.from('PDF').toString('base64')}` })
  })

  it('assistant tool-call history becomes function_call items; 0.2.0 role:"tool" becomes function_call_output', () => {
    const body = serializeResponses(request({
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'list' }] },
        { role: 'assistant', content: [
          { type: 'text', text: 'sure' },
          { type: 'tool-call', id: 'c1', name: 'ls', arguments: '{}' },
        ] },
        { role: 'tool', toolCallId: 'c1', content: [{ type: 'text', text: 'a.txt' }] },
      ],
    }) as never, capability(), new Map())
    expect(body.input[1]).toEqual({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'sure' }] })
    expect(body.input[2]).toEqual({ type: 'function_call', call_id: 'c1', name: 'ls', arguments: '{}' })
    expect(body.input[3]).toEqual({ type: 'function_call_output', call_id: 'c1', output: 'a.txt' })
  })

  it('0.1.x embedded tool-result blocks become function_call_output items', () => {
    const body = serializeResponses(request({
      messages: [
        { role: 'assistant', content: [{ type: 'tool-call', id: 'c9', name: 'ls', arguments: '{}' }] },
        { role: 'user', content: [{ type: 'tool-result', toolCallId: 'c9', content: [{ type: 'text', text: 'ok' }] }, { type: 'text', text: 'go on' }] },
      ],
    }) as never, capability(), new Map())
    expect(body.input[1]).toEqual({ type: 'function_call_output', call_id: 'c9', output: 'ok' })
    expect(body.input[2]).toMatchObject({ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'go on' }] })
  })
})

describe('translateResponses — SSE event family', () => {
  it('message item lifecycle: added → text deltas → completed with usage and finish', async () => {
    const chunks = await collect([
      JSON.stringify({ type: 'response.output_item.added', output_index: 0, item: { type: 'message', role: 'assistant' } }),
      JSON.stringify({ type: 'response.output_text.delta', output_index: 0, delta: 'he' }),
      JSON.stringify({ type: 'response.output_text.delta', output_index: 0, delta: 'llo' }),
      JSON.stringify({ type: 'response.completed', response: { usage: { input_tokens: 7, output_tokens: 2, output_tokens_details: { reasoning_tokens: 0 } } } }),
    ])
    expect(chunks[0]).toMatchObject({ type: 'block-start', index: 0, blockType: 'text' })
    expect(chunks[1]).toMatchObject({ type: 'text-delta', text: 'he' })
    expect(chunks.at(-3)).toMatchObject({ type: 'block-end', block: { type: 'text', text: 'hello' } })
    expect(chunks.at(-2)).toMatchObject({ type: 'usage', usage: { inputTokens: 7, outputTokens: 2 } })
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
  })

  it('function_call items assemble name + arguments and finish as tool-calls', async () => {
    const chunks = await collect([
      JSON.stringify({ type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', call_id: 'cc1', name: 'ls' } }),
      JSON.stringify({ type: 'response.function_call_arguments.delta', output_index: 0, delta: '{}' }),
      JSON.stringify({ type: 'response.completed', response: { usage: { input_tokens: 5, output_tokens: 1 } } }),
    ])
    expect(chunks[0]).toMatchObject({ type: 'block-start', blockType: 'tool-call' })
    expect(chunks[1]).toMatchObject({ type: 'tool-call-delta', name: 'ls', argumentsDelta: '{}' })
    expect(chunks.at(-3)).toMatchObject({ type: 'block-end', block: { type: 'tool-call', name: 'ls', arguments: '{}' } })
    expect(chunks.at(-2)).toMatchObject({ type: 'usage', usage: { inputTokens: 5, outputTokens: 1 } })
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'tool-calls' } })
  })

  it('reasoning items feed reasoning deltas', async () => {
    const chunks = await collect([
      JSON.stringify({ type: 'response.output_item.added', output_index: 0, item: { type: 'reasoning' } }),
      JSON.stringify({ type: 'response.reasoning_summary_text.delta', output_index: 0, delta: 'thinking' }),
      JSON.stringify({ type: 'response.completed', response: { usage: { input_tokens: 3, output_tokens: 1 } } }),
    ])
    expect(chunks[0]).toMatchObject({ type: 'block-start', blockType: 'reasoning' })
    expect(chunks[1]).toMatchObject({ type: 'reasoning-delta', text: 'thinking' })
  })

  it('response.failed is a loud SERVER error; truncation without completed throws', async () => {
    await expect(collect([JSON.stringify({ type: 'response.failed', error: { message: 'boom' } })])).rejects.toThrow(/stream failed/)
    await expect(collect([
      JSON.stringify({ type: 'response.output_item.added', output_index: 0, item: { type: 'message' } }),
    ])).rejects.toThrow(/without response\.completed/)
  })
})
