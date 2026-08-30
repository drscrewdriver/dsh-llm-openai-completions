import { describe, expect, it } from 'vitest'
import { serializeMessages, serializeRequest } from '../src/adapter/serialize.ts'
import type { ImageSource } from '../src/adapter/serialize.ts'
import type { ModelCapability } from '../src/adapter/config.ts'

const capability = (over: Partial<ModelCapability> = {}): ModelCapability => ({
  thinkingFormat: 'qwen',
  supportsReasoningEffort: false,
  reasoningEfforts: {},
  vision: false,
  ...over,
})

/** An image block attached to a user message (duck-typed attachment ref). */
const imageBlock = (attachmentId = 'a') => ({
  type: 'image',
  attachment: { attachmentId, mediaType: 'image/png', bytes: 1, width: 1, height: 1 },
})

/**
 * A stub image source; UTF-8 "ABC" base64-encodes to "QUJD"
 * (Uint8Array([65, 66, 67]).toString() === "QUJD").
 */
const base64Uri = 'data:image/png;base64,QUJD'
const imageSource: ImageSource = {
  readImage: async () => ({ mediaType: 'image/png', base64: 'QUJD' }),
}

describe('serializeRequest — system role', () => {
  it('always uses role "system" for the system prompt (never developer)', async () => {
    const body = await serializeRequest({
      provider: 'local-35b', model: 'Qwen3.6-35B-A3B', messages: [],
      system: 'you are a helper', reasoningEffort: 'high',
    } as never, capability(), undefined)
    expect(body.messages[0]).toEqual({ role: 'system', content: 'you are a helper' })
  })
})

describe('serializeRequest — thinking fields', () => {
  it('toggle model (no effort): chat_template_kwargs.enable_thinking, never reasoning_effort', async () => {
    // A toggle model (supportsReasoningEffort:false — Qwen3.6 / mimo) always
    // uses the chat-template wire: vLLM Qwen3 honors
    // chat_template_kwargs.enable_thinking; top-level enable_thinking and
    // reasoning_effort are ignored/rejected. The configured thinkingFormat
    // must not matter (llm-pi-ai withholds qwen-chat-template anyway).
    for (const format of ['openai', 'qwen', 'qwen-chat-template', undefined]) {
      const body = await serializeRequest({
        provider: 'local-35b', model: 'Qwen3.6-35B-A3B', messages: [], reasoningEffort: 'high',
      } as never, capability({ thinkingFormat: format }), undefined)
      expect(body.chat_template_kwargs).toEqual({ enable_thinking: true, preserve_thinking: true })
      expect(body.enable_thinking).toBeUndefined()
      expect(body.reasoning_effort).toBeUndefined()
    }
  })

  it('toggle model no effort: thinking on by default (chat_template_kwargs true)', async () => {
    const body = await serializeRequest({
      provider: 'local-35b', model: 'Qwen3.6-35B-A3B', messages: [],
    } as never, capability(), undefined)
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: true, preserve_thinking: true })
  })

  it('toggle model explicit off: chat_template_kwargs.enable_thinking false', async () => {
    const body = await serializeRequest({
      provider: 'local-35b', model: 'Qwen3.6-35B-A3B', messages: [], reasoningEffort: 'off',
    } as never, capability(), undefined)
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false, preserve_thinking: true })
    expect(body.reasoning_effort).toBeUndefined()
  })

  it('effort-capable qwen-chat-template format: chat_template_kwargs.enable_thinking', async () => {
    const body = await serializeRequest({
      provider: 'local-35b', model: 'Qwen3.8-27B', messages: [], reasoningEffort: 'high',
    } as never, capability({ thinkingFormat: 'qwen-chat-template', supportsReasoningEffort: true }), undefined)
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: true, preserve_thinking: true })
  })

  it('effort-capable model: reasoning_effort passthrough', async () => {
    const body = await serializeRequest({
      provider: 'local-35b', model: 'Qwen3.8-27B', messages: [], reasoningEffort: 'max',
    } as never, capability({ thinkingFormat: 'openai', supportsReasoningEffort: true }), undefined)
    expect(body.reasoning_effort).toBe('max')
  })

  it('no effort on an effort-capable model: no thinking fields at all', async () => {
    const body = await serializeRequest({
      provider: 'local-35b', model: 'Qwen3.8-27B', messages: [],
    } as never, capability({ thinkingFormat: 'openai', supportsReasoningEffort: true }), undefined)
    expect(body.enable_thinking).toBeUndefined()
    expect(body.reasoning_effort).toBeUndefined()
  })
})

describe('serializeMessages', () => {
  it('expands tool results into role "tool" messages', async () => {
    const wire = await serializeMessages([
      { role: 'user', content: [{ type: 'tool-result', toolCallId: 'call_1', content: [{ type: 'text', text: 'ok' }] }] },
    ] as never, undefined)
    expect(wire).toEqual([{ role: 'tool', tool_call_id: 'call_1', content: 'ok' }])
  })
})

describe('image serialization', () => {
  it('single image on a vision model → one image_url data-URI content part', async () => {
    const wire = await serializeMessages([
      { role: 'user', content: [imageBlock('a1')] },
    ] as never, imageSource)
    expect(wire).toEqual([{ role: 'user', content: [{ type: 'image_url', image_url: { url: base64Uri } }] }])
  })

  it('multiple images interleaved with text keep source order and count', async () => {
    const wire = await serializeMessages([
      { role: 'user', content: [
        { type: 'text', text: 'look at these' },
        imageBlock('a1'),
        { type: 'text', text: 'then this' },
        imageBlock('a2'),
      ] },
    ] as never, imageSource)
    const content = (wire[0] as { content: unknown[] }).content
    expect(content).toHaveLength(4)
    expect(content).toEqual([
      { type: 'text', text: 'look at these' },
      { type: 'image_url', image_url: { url: base64Uri } },
      { type: 'text', text: 'then this' },
      { type: 'image_url', image_url: { url: base64Uri } },
    ])
  })

  it('pure-text vision-model message keeps a string content', async () => {
    const body = await serializeRequest({
      provider: 'local-35b', model: 'vision', messages: [
        { role: 'user', content: [{ type: 'text', text: 'hello' }] },
      ],
    } as never, capability({ vision: true }), undefined)
    expect(body.messages[0]).toEqual({ role: 'user', content: 'hello' })
  })

  it('non-vision model + image → rejects loudly', async () => {
    await expect(serializeMessages([
      { role: 'user', content: [imageBlock()] },
    ] as never, undefined)).rejects.toThrow(/does not support image content/)
  })

  it('vision model + image but image source undefined → throws UNSUPPORTED_CONTENT', async () => {
    // The adapter supplies an image source only for vision models; without it,
    // the vision serialization path must still reject the image block.
    await expect(serializeRequest({
      provider: 'local-35b', model: 'vision', messages: [
        { role: 'user', content: [imageBlock()] },
      ],
    } as never, capability({ vision: true }), undefined)).rejects.toThrow(/does not support image content/)
  })
})