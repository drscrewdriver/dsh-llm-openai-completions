import { describe, expect, it } from 'vitest'
import { translate } from '../src/adapter/translate.ts'

/** Collect chunks from payload strings. */
async function run(payloads: string[]): Promise<Array<Record<string, unknown>>> {
  const events: Array<Record<string, unknown>> = []
  async function* feed(): AsyncGenerator<string> {
    for (const payload of payloads) yield payload
  }
  for await (const chunk of translate(feed())) {
    events.push(chunk as unknown as Record<string, unknown>)
  }
  return events
}

describe('translate — Qwen3-style </think> split', () => {
  it('splits thinking before the lone </think> into a reasoning block', async () => {
    const events = await run([
      JSON.stringify({ choices: [{ delta: { content: 'Let me think' } }] }),
      JSON.stringify({ choices: [{ delta: { content: ' step by step.</think>' } }] }),
      JSON.stringify({ choices: [{ delta: { content: '9.8 is larger.' } }] }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
      '[DONE]',
    ])
    const thinking = events.filter(e => e.type === 'reasoning-delta').map(e => e.text).join('')
    const text = events.filter(e => e.type === 'text-delta').map(e => e.text).join('')
    expect(thinking).toBe('Let me think step by step.')
    expect(text).toBe('9.8 is larger.')
    const blocks = events.filter(e => e.type === 'block-end').map(e => e.block) as Array<{ type: string; text: string }>
    expect(blocks).toEqual([
      { type: 'reasoning', text: 'Let me think step by step.' },
      { type: 'text', text: '9.8 is larger.' },
    ])
  })

  it('no </think> tag: buffered content flushes as plain text', async () => {
    const events = await run([
      JSON.stringify({ choices: [{ delta: { content: 'plain answer' } }] }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
      '[DONE]',
    ])
    const text = events.filter(e => e.type === 'text-delta').map(e => e.text).join('')
    expect(text).toBe('plain answer')
  })
})

describe('translate — reasoning fields and tool calls', () => {
  it('reads reasoning from reasoning_content / reasoning / reasoning_text', async () => {
    const events = await run([
      JSON.stringify({ choices: [{ delta: { reasoning_content: 'r1' } }] }),
      JSON.stringify({ choices: [{ delta: { reasoning: 'r2' } }] }),
      JSON.stringify({ choices: [{ delta: { content: 'answer' } }] }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
      '[DONE]',
    ])
    const thinking = events.filter(e => e.type === 'reasoning-delta').map(e => e.text).join('')
    expect(thinking).toBe('r1r2')
  })

  it('assembles tool-call deltas into a tool-call block', async () => {
    const events = await run([
      JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'bash', arguments: '{"a"' } }] } }] }),
      JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '}}' } }] } }] }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
      '[DONE]',
    ])
    const block = events.find(e => e.type === 'block-end')?.block as { type: string; id: string; name: string; arguments: string }
    expect(block.type).toBe('tool-call')
    expect(block.id).toBe('c1')
    expect(block.name).toBe('bash')
    expect(block.arguments).toBe('{"a"}}')
  })
})

describe('translate — usage and finish', () => {
  it('defers usage/finish to the [DONE] sentinel and maps finish reason', async () => {
    const events = await run([
      JSON.stringify({ choices: [{ delta: { content: 'x' } }] }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
      '[DONE]',
    ])
    const usage = events.find(e => e.type === 'usage')?.usage as { inputTokens: number; outputTokens: number }
    expect(usage.inputTokens).toBe(10)
    expect(usage.outputTokens).toBe(5)
    expect(events.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
  })

  it('maps an empty stop response to EMPTY_RESPONSE', async () => {
    const events = await run([
      JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
      '[DONE]',
    ])
    expect(events.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error', failure: { code: 'EMPTY_RESPONSE' } } })
  })
})
