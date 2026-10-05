import { describe, expect, it } from 'vitest'
import { serializeAnthropic, translateAnthropic } from '../src/adapter/anthropic.ts'
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
  provider: 'mimo-anthropic',
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

/** Collect an SSE async-iterable into chunks. */
async function collect(payloads: unknown[]) {
  const chunks = []
  for await (const chunk of translateAnthropic(payloads as never)) chunks.push(chunk)
  return chunks
}

describe('serializeAnthropic — body matrix', () => {
  it('extracts the leading system message into the top-level system parameter and strips it from messages (F2)', () => {
    const body = serializeAnthropic(request(), capability(), new Map())
    expect(body.system).toBe('base system prompt')
    expect(body.messages).toHaveLength(1)
    expect(body.messages[0]?.role).toBe('user')
    expect(body.messages.some((m) => (m as { role: string }).role === 'system')).toBe(false)
  })

  it('prefers options.system over the leading message, still stripping it', () => {
    const body = serializeAnthropic(request({ system: 'one-shot system' }), capability(), new Map())
    expect(body.system).toBe('one-shot system')
    expect(JSON.stringify(body.messages)).not.toContain('base system prompt')
  })

  it('F1: options.maxTokens wins over the model row, which wins over the fallback', () => {
    expect(serializeAnthropic(request({ maxTokens: 777 }), capability({ maxTokens: 99_000 }), new Map()).max_tokens).toBe(777)
    expect(serializeAnthropic(request(), capability({ maxTokens: 99_000 }), new Map()).max_tokens).toBe(99_000)
    expect(serializeAnthropic(request(), capability(), new Map()).max_tokens).toBe(8192)
  })

  it('thinking maps: off → disabled, session-title → disabled, else enabled', () => {
    expect(serializeAnthropic(request({ reasoningEffort: 'off' }), capability(), new Map()).thinking.type).toBe('disabled')
    expect(serializeAnthropic(request({ purpose: 'session-title' }), capability(), new Map()).thinking.type).toBe('disabled')
    expect(serializeAnthropic(request({ reasoningEffort: 'high' }), capability(), new Map()).thinking.type).toBe('enabled')
    expect(serializeAnthropic(request(), capability(), new Map()).thinking.type).toBe('enabled')
  })

  it('tools serialize as name/description/input_schema', () => {
    const body = serializeAnthropic(request({
      tools: [{ name: 'bash', description: 'run', parameters: { type: 'object' } }],
    }) as never, capability(), new Map())
    expect(body.tools).toEqual([{ name: 'bash', description: 'run', input_schema: { type: 'object' } }])
  })

  it('stop becomes stop_sequences; temperature passes through', () => {
    const body = serializeAnthropic(request({ stop: ['END'], temperature: 0.3 }) as never, capability(), new Map())
    expect(body.stop_sequences).toEqual(['END'])
    expect(body.temperature).toBe(0.3)
  })

  it('image blocks render as base64 source blocks from collected media', () => {
    const body = serializeAnthropic(request({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'image', attachment: { attachmentId: 'i1', mediaType: 'image/png' } }] }],
    }) as never, capability(), media([['i1', { mediaType: 'image/png', text: 'PNG' }]]))
    const content = body.messages[0]!.content
    expect(content[1]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: Buffer.from('PNG', 'utf8').toString('base64') } })
  })

  it('assistant history replays text + tool_use, never reasoning (D3)', () => {
    const body = serializeAnthropic(request({
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'list files' }] },
        { role: 'assistant', content: [
          { type: 'reasoning', text: 'thinking about it' },
          { type: 'text', text: 'sure' },
          { type: 'tool-call', id: 't1', name: 'ls', arguments: '{}' },
        ] },
        { role: 'user', content: [{ type: 'tool-result', toolCallId: 't1', content: [{ type: 'text', text: 'a.txt' }] }] },
      ],
    }) as never, capability(), new Map())
    const assistant = body.messages[1]!
    expect(assistant.role).toBe('assistant')
    expect(assistant.content.map((b) => b.type)).toEqual(['text', 'tool_use'])
    expect(JSON.stringify(body.messages)).not.toContain('thinking about it')
    const result = body.messages[2]!.content[0]
    expect(result).toMatchObject({ type: 'tool_result', tool_use_id: 't1', content: 'a.txt' })
  })

  it('0.1.x embedded tool-result blocks become tool_result content in the same user turn', () => {
    const body = serializeAnthropic(request({
      messages: [
        { role: 'assistant', content: [{ type: 'tool-call', id: 't9', name: 'ls', arguments: '{}' }] },
        { role: 'user', content: [{ type: 'tool-result', toolCallId: 't9', content: [{ type: 'text', text: 'ok' }] }, { type: 'text', text: 'and then' }] },
      ],
    }) as never, capability(), new Map())
    const user = body.messages[1]!
    expect(user.role).toBe('user')
    expect(user.content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 't9' })
    expect(user.content[1]).toMatchObject({ type: 'text', text: 'and then' })
  })

  it('0.2.0 role:"tool" messages become user turns carrying one tool_result', () => {
    const body = serializeAnthropic(request({
      messages: [
        { role: 'assistant', content: [{ type: 'tool-call', id: 't2', name: 'ls', arguments: '{}' }] },
        { role: 'tool', toolCallId: 't2', content: [{ type: 'text', text: 'out' }] },
      ],
    }) as never, capability(), new Map())
    expect(body.messages[1]).toMatchObject({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 't2', content: 'out' }] })
  })

  it('broken tool pairing is a loud INVALID_REQUEST', () => {
    expect(() => serializeAnthropic(request({
      messages: [{ role: 'user', content: [{ type: 'tool-result', toolCallId: 'ghost', content: [] }] }],
    }) as never, capability(), new Map())).toThrow(/no matching tool call/)
    expect(() => serializeAnthropic(request({
      messages: [{ role: 'assistant', content: [{ type: 'tool-call', id: 't1', name: 'ls', arguments: '{}' }] }],
    }) as never, capability(), new Map())).toThrow(/unresolved tool calls/)
  })
})

describe('translateAnthropic — SSE event family', () => {
  it('text block lifecycle: start → deltas → block-end → finish', async () => {
    const chunks = await collect([
      JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text' } }),
      JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'he' } }),
      JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'llo' } }),
      JSON.stringify({ type: 'content_block_stop', index: 0 }),
      JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } }),
      JSON.stringify({ type: 'message_stop' }),
    ])
    expect(chunks[0]).toMatchObject({ type: 'block-start', index: 0, blockType: 'text' })
    expect(chunks[1]).toMatchObject({ type: 'text-delta', text: 'he' })
    expect(chunks.at(-3)).toMatchObject({ type: 'block-end', block: { type: 'text', text: 'hello' } })
    expect(chunks.at(-2)).toMatchObject({ type: 'usage', usage: { inputTokens: 0, outputTokens: 2 } })
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
  })

  it('thinking deltas become reasoning deltas; signature_delta is ignored', async () => {
    const chunks = await collect([
      JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'thinking' } }),
      JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'hmm' } }),
      JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig==' } }),
      JSON.stringify({ type: 'content_block_stop', index: 0 }),
      JSON.stringify({ type: 'message_stop' }),
    ])
    expect(chunks[0]).toMatchObject({ type: 'block-start', blockType: 'reasoning' })
    expect(chunks[1]).toMatchObject({ type: 'reasoning-delta', text: 'hmm' })
    expect(chunks.filter((c) => c.type === 'reasoning-delta')).toHaveLength(1)
    expect(chunks.at(-2)).toMatchObject({ type: 'block-end', block: { type: 'reasoning', text: 'hmm' } })
  })

  it('tool_use blocks assemble from input_json_delta with name from start', async () => {
    const chunks = await collect([
      JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'call1', name: 'ls' } }),
      JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"p"' } }),
      JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: ':1}' } }),
      JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'tool_use' } }),
      JSON.stringify({ type: 'message_stop' }),
    ])
    expect(chunks[0]).toMatchObject({ type: 'block-start', blockType: 'tool-call' })
    expect(chunks[1]).toMatchObject({ type: 'tool-call-delta', name: 'ls', argumentsDelta: '{"p"' })
    expect(chunks.at(-2)).toMatchObject({ type: 'block-end', block: { type: 'tool-call', name: 'ls', arguments: '{"p":1}' } })
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'tool-calls' } })
  })

  it('usage rides message_start (input) and message_delta (output); max_tokens maps', async () => {
    const chunks = await collect([
      JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 10 } } }),
      JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text' } }),
      JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'x' } }),
      JSON.stringify({ type: 'content_block_stop', index: 0 }),
      JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'max_tokens' }, usage: { output_tokens: 3 } }),
      JSON.stringify({ type: 'message_stop' }),
    ])
    const usageChunk = chunks.find((c) => c.type === 'usage')
    expect(usageChunk).toMatchObject({ usage: { inputTokens: 10, outputTokens: 3 } })
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'max-tokens' } })
  })

  it('an error event throws SERVER', async () => {
    await expect(collect([JSON.stringify({ type: 'error', error: { message: 'boom' } })])).rejects.toThrow(/stream error/)
  })
})
