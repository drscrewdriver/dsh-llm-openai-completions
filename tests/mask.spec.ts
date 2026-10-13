import { describe, expect, it } from 'vitest'
import { maskUncarriableMedia, withExtraInputs } from '../src/adapter/mask.ts'
import type { ModelCapability } from '../src/adapter/config.ts'
import type { WireableMessage } from '../src/adapter/serialize.ts'

const capability = (over: Partial<ModelCapability> = {}): ModelCapability => ({
  thinkingFormat: undefined,
  supportsReasoningEffort: false,
  reasoningEfforts: {},
  input: ['text', 'image'],
  vision: true,
  ...over,
})

const videoMessage = (): WireableMessage => ({
  role: 'user',
  content: [
    { type: 'text', text: 'watch this' },
    { type: 'file', attachment: { attachmentId: 'v1', name: 'clip.mp4', bytes: 12.5 * 1024 * 1024 } },
  ],
} as never)

const textOf = (block: unknown): string => (block as { type: string; text?: string }).text ?? ''

describe('withExtraInputs', () => {
  it('unions extra modalities without duplicates', () => {
    const out = withExtraInputs(capability({ input: ['text', 'image'] }), ['video', 'audio'])
    expect(out.input).toEqual(['text', 'image', 'video', 'audio'])
  })

  it('returns the same capability when nothing is declared', () => {
    const base = capability()
    expect(withExtraInputs(base, undefined)).toBe(base)
    expect(withExtraInputs(base, [])).toBe(base)
  })
})

describe('maskUncarriableMedia', () => {
  it('masks an undeclared video with a deterministic placeholder naming size and model', () => {
    const { messages, records } = maskUncarriableMedia(
      [videoMessage()], capability({ input: ['text', 'image'] }), 'openai-completions', 'mimo-v2.5')
    expect(records).toEqual([{ messageIndex: 0, blockIndex: 1, modality: 'video', name: 'clip.mp4' }])
    const content = messages[0]!.content!
    expect(content).toHaveLength(2)
    expect(content[0]).toEqual({ type: 'text', text: 'watch this' })
    const placeholder = textOf(content[1])
    expect(placeholder).toContain('[Media omitted — video]')
    expect(placeholder).toContain('clip.mp4')
    expect(placeholder).toContain('12.5 MB')
    expect(placeholder).toContain('mimo-v2.5')
    expect(placeholder).toContain('switch back to a video-capable model')
  })

  it('keeps the input array identity when nothing needs masking (zero-copy fast path)', () => {
    const messages = [videoMessage()]
    const out = maskUncarriableMedia(messages, capability({ input: ['text', 'image', 'video'] }), 'openai-completions', 'm')
    expect(out.messages).toBe(messages)
    expect(out.records).toEqual([])
  })

  it('keeps a video the model declares on the face', () => {
    const { messages, records } = maskUncarriableMedia(
      [videoMessage()], capability({ input: ['text', 'image', 'video'], vision: true }), 'openai-completions', 'm')
    expect(records).toEqual([])
    expect((messages[0]!.content![1] as { type: string }).type).toBe('file')
  })

  it('masks a declared video on a face that cannot carry it (anthropic face intersection)', () => {
    const { records } = maskUncarriableMedia(
      [videoMessage()], capability({ input: ['text', 'image', 'video'] }), 'anthropic-messages', 'mimo')
    // MiMo's anthropic face silently drops video — the face gate must mask it
    // even though the model declares the modality.
    expect(records).toEqual([{ messageIndex: 0, blockIndex: 1, modality: 'video', name: 'clip.mp4' }])
  })

  it('masks an image only when the model is not vision-capable', () => {
    const imageMessage = (): WireableMessage => ({
      role: 'user',
      content: [{ type: 'image', attachment: { attachmentId: 'i1', mediaType: 'image/png', bytes: 1024, width: 1, height: 1 } }],
    } as never)
    const masked = maskUncarriableMedia(
      [imageMessage()], capability({ input: ['text'], vision: false }), 'openai-completions', 'text-model')
    expect(masked.records).toEqual([{ messageIndex: 0, blockIndex: 0, modality: 'image' }])
    const kept = maskUncarriableMedia(
      [imageMessage()], capability({ input: ['text', 'image'], vision: true }), 'openai-completions', 'vision-model')
    expect(kept.records).toEqual([])
    expect((kept.messages[0]!.content![0] as { type: string }).type).toBe('image')
  })

  it('masks audio and pdf blocks under the same table', () => {
    const mixed = (): WireableMessage => ({
      role: 'user',
      content: [
        { type: 'file', attachment: { attachmentId: 'a1', name: 'song.mp3', bytes: 3 * 1024 * 1024 } },
        { type: 'file', attachment: { attachmentId: 'p1', name: 'doc.pdf', bytes: 2048 } },
      ],
    } as never)
    const { records } = maskUncarriableMedia(
      [mixed()], capability({ input: ['text', 'image'] }), 'openai-completions', 'm')
    expect(records.map((r) => r.modality)).toEqual(['audio', 'pdf'])
  })

  it('leaves tool and other message roles intact while copying only masked messages', () => {
    const toolMessage = (): WireableMessage => ({
      role: 'tool',
      toolCallId: 't1',
      content: [{ type: 'text', text: 'result' }],
    } as never)
    const messages = [toolMessage(), videoMessage()]
    const { messages: out } = maskUncarriableMedia(
      messages, capability({ input: ['text', 'image'] }), 'openai-completions', 'm')
    expect(out[0]).toBe(messages[0])
    expect(out[1]).not.toBe(messages[1])
  })
})
