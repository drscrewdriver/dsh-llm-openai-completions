import { describe, expect, it } from 'vitest'
import { serializeMessages, serializeRequest } from '../src/adapter/serialize.ts'
import type { ModelCapability } from '../src/adapter/config.ts'

const capability = (over: Partial<ModelCapability> = {}): ModelCapability => ({
  thinkingFormat: 'qwen',
  supportsReasoningEffort: false,
  reasoningEfforts: {},
  vision: false,
  ...over,
})

describe('serializeRequest — system role', () => {
  it('always uses role "system" for the system prompt (never developer)', () => {
    const body = serializeRequest({
      provider: 'local-35b', model: 'Qwen3.6-35B-A3B', messages: [],
      system: 'you are a helper', reasoningEffort: 'high',
    } as never, capability())
    expect(body.messages[0]).toEqual({ role: 'system', content: 'you are a helper' })
  })
})

describe('serializeRequest — thinking fields', () => {
  it('qwen format: enable_thinking from the effort, never reasoning_effort', () => {
    const body = serializeRequest({
      provider: 'local-35b', model: 'Qwen3.6-35B-A3B', messages: [], reasoningEffort: 'high',
    } as never, capability({ thinkingFormat: 'qwen' }))
    expect(body.enable_thinking).toBe(true)
    expect(body.reasoning_effort).toBeUndefined()
    expect(body.chat_template_kwargs).toBeUndefined()
  })

  it('qwen-chat-template format: chat_template_kwargs.enable_thinking', () => {
    const body = serializeRequest({
      provider: 'local-35b', model: 'Qwen3.8-27B', messages: [], reasoningEffort: 'high',
    } as never, capability({ thinkingFormat: 'qwen-chat-template' }))
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: true, preserve_thinking: true })
  })

  it('effort-capable model: reasoning_effort passthrough', () => {
    const body = serializeRequest({
      provider: 'local-35b', model: 'Qwen3.8-27B', messages: [], reasoningEffort: 'max',
    } as never, capability({ thinkingFormat: 'openai', supportsReasoningEffort: true }))
    expect(body.reasoning_effort).toBe('max')
  })

  it('no effort: thinking off (no enable_thinking / effort fields)', () => {
    const body = serializeRequest({
      provider: 'local-35b', model: 'Qwen3.6-35B-A3B', messages: [],
    } as never, capability({ thinkingFormat: 'qwen' }))
    expect(body.enable_thinking).toBe(false)
  })
})

describe('serializeMessages', () => {
  it('expands tool results into role "tool" messages', () => {
    const wire = serializeMessages([
      { role: 'user', content: [{ type: 'tool-result', toolCallId: 'call_1', content: [{ type: 'text', text: 'ok' }] }] },
    ] as never)
    expect(wire).toEqual([{ role: 'tool', tool_call_id: 'call_1', content: 'ok' }])
  })

  it('rejects image content loudly (attachment refs need the attachment service)', () => {
    expect(() => serializeMessages([
      { role: 'user', content: [{ type: 'image', attachment: { attachmentId: 'a', mediaType: 'image/png', bytes: 1, width: 1, height: 1 } }] },
    ] as never)).toThrow(/does not support image content/)
  })
})
