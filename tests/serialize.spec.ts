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
  it('toggle model (no effort): chat_template_kwargs.enable_thinking, never reasoning_effort', () => {
    // A toggle model (supportsReasoningEffort:false — Qwen3.6 / mimo) always
    // uses the chat-template wire: vLLM Qwen3 honors
    // chat_template_kwargs.enable_thinking; top-level enable_thinking and
    // reasoning_effort are ignored/rejected. The configured thinkingFormat
    // must not matter (llm-pi-ai withholds qwen-chat-template anyway).
    for (const format of ['openai', 'qwen', 'qwen-chat-template', undefined]) {
      const body = serializeRequest({
        provider: 'local-35b', model: 'Qwen3.6-35B-A3B', messages: [], reasoningEffort: 'high',
      } as never, capability({ thinkingFormat: format }))
      expect(body.chat_template_kwargs).toEqual({ enable_thinking: true, preserve_thinking: true })
      expect(body.enable_thinking).toBeUndefined()
      expect(body.reasoning_effort).toBeUndefined()
    }
  })

  it('toggle model no effort: thinking on by default (chat_template_kwargs true)', () => {
    const body = serializeRequest({
      provider: 'local-35b', model: 'Qwen3.6-35B-A3B', messages: [],
    } as never, capability())
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: true, preserve_thinking: true })
  })

  it('toggle model explicit off: chat_template_kwargs.enable_thinking false', () => {
    const body = serializeRequest({
      provider: 'local-35b', model: 'Qwen3.6-35B-A3B', messages: [], reasoningEffort: 'off',
    } as never, capability())
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false, preserve_thinking: true })
    expect(body.reasoning_effort).toBeUndefined()
  })

  it('effort-capable qwen-chat-template format: chat_template_kwargs.enable_thinking', () => {
    const body = serializeRequest({
      provider: 'local-35b', model: 'Qwen3.8-27B', messages: [], reasoningEffort: 'high',
    } as never, capability({ thinkingFormat: 'qwen-chat-template', supportsReasoningEffort: true }))
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: true, preserve_thinking: true })
  })

  it('effort-capable model: reasoning_effort passthrough', () => {
    const body = serializeRequest({
      provider: 'local-35b', model: 'Qwen3.8-27B', messages: [], reasoningEffort: 'max',
    } as never, capability({ thinkingFormat: 'openai', supportsReasoningEffort: true }))
    expect(body.reasoning_effort).toBe('max')
  })

  it('no effort on an effort-capable model: no thinking fields at all', () => {
    const body = serializeRequest({
      provider: 'local-35b', model: 'Qwen3.8-27B', messages: [],
    } as never, capability({ thinkingFormat: 'openai', supportsReasoningEffort: true }))
    expect(body.enable_thinking).toBeUndefined()
    expect(body.reasoning_effort).toBeUndefined()
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
