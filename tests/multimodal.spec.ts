import { describe, expect, it } from 'vitest'
import { serializeRequest, enforceModalities, mediaTypeFromName } from '../src/adapter/serialize.ts'
import type { MediaMap } from '../src/adapter/serialize.ts'
import type { ModelCapability } from '../src/adapter/config.ts'

const capability = (over: Partial<ModelCapability> = {}): ModelCapability => ({
  thinkingFormat: 'qwen',
  supportsReasoningEffort: false,
  reasoningEfforts: {},
  input: ['text'],
  vision: false,
  ...over,
})

/** A duck-typed file block (verbatim attachment ref). */
const fileBlock = (attachmentId: string, name: string) => ({
  type: 'file',
  attachment: { attachmentId, name },
})

const userMessage = (blocks: unknown[]) => ({
  role: 'user',
  content: blocks,
}) as never

const mediaMapFrom = (entries: Array<[string, { mediaType: string; text: string }]>): MediaMap => {
  const map: MediaMap = new Map()
  for (const [id, { mediaType, text }] of entries) {
    map.set(id, { mediaType, data: Buffer.from(text, 'utf8') })
  }
  return map
}

describe('mediaTypeFromName', () => {
  it('maps the recognized extension set', () => {
    expect(mediaTypeFromName('clip.MP4')).toBe('video/mp4')
    expect(mediaTypeFromName('note.mp3')).toBe('audio/mpeg')
    expect(mediaTypeFromName('doc.pdf')).toBe('application/pdf')
    expect(mediaTypeFromName('archive.zip')).toBeUndefined()
    expect(mediaTypeFromName('noext')).toBeUndefined()
  })
})

describe('enforceModalities — the hard gate', () => {
  it('passes a text-only history regardless of declaration', () => {
    const options = { model: 'm', messages: [userMessage([{ type: 'text', text: 'hi' }])] } as never
    expect(() => enforceModalities(options, capability())).not.toThrow()
  })

  it('rejects an undeclared video with a message naming the modality', () => {
    const options = {
      model: 'm',
      messages: [userMessage([fileBlock('v1', 'clip.mp4')])],
    } as never
    expect(() => enforceModalities(options, capability()))
      .toThrow(/does not declare "video" input/)
  })

  it('passes each modality the model declares', () => {
    const options = {
      model: 'm',
      messages: [userMessage([
        fileBlock('v1', 'clip.mp4'),
        fileBlock('a1', 'note.mp3'),
        fileBlock('p1', 'doc.pdf'),
      ])],
    } as never
    expect(() => enforceModalities(options, capability({ input: ['text', 'video', 'audio', 'pdf'] }))).not.toThrow()
  })

  it('rejects undeclared images too (unified with the vision gate)', () => {
    const options = {
      model: 'm',
      messages: [userMessage([{ type: 'image', attachment: { attachmentId: 'i1', mediaType: 'image/png' } }])],
    } as never
    expect(() => enforceModalities(options, capability())).toThrow(/does not declare "image" input/)
  })
})

describe('multimodal serialization (chat face)', () => {
  it('audio file → input_audio part with base64 data and format', async () => {
    const media = mediaMapFrom([['a1', { mediaType: 'audio/mpeg', text: 'abc' }]])
    const request = await serializeRequest({
      model: 'm', messages: [userMessage([fileBlock('a1', 'note.mp3')])],
    } as never, capability({ input: ['text', 'audio'] }), undefined, media)
    const content = (request.messages[0] as { content: Array<Record<string, unknown>> }).content
    expect(content[0]).toEqual({
      type: 'input_audio',
      input_audio: { data: Buffer.from('abc', 'utf8').toString('base64'), format: 'mpeg' },
    })
  })

  it('video file → video_url part with a data URI', async () => {
    const media = mediaMapFrom([['v1', { mediaType: 'video/mp4', text: 'abc' }]])
    const request = await serializeRequest({
      model: 'm', messages: [userMessage([fileBlock('v1', 'clip.mp4')])],
    } as never, capability({ input: ['text', 'video'] }), undefined, media)
    const content = (request.messages[0] as { content: Array<Record<string, unknown>> }).content
    expect(content[0]).toEqual({
      type: 'video_url',
      video_url: { url: `data:video/mp4;base64,${Buffer.from('abc', 'utf8').toString('base64')}` },
    })
  })

  it('PDF file → OpenAI file part with a data URI', async () => {
    const media = mediaMapFrom([['p1', { mediaType: 'application/pdf', text: 'pdf' }]])
    const request = await serializeRequest({
      model: 'm', messages: [userMessage([fileBlock('p1', 'doc.pdf')])],
    } as never, capability({ input: ['text', 'pdf'] }), undefined, media)
    const content = (request.messages[0] as { content: Array<Record<string, unknown>> }).content
    expect(content[0]).toEqual({
      type: 'file',
      file: { filename: 'doc.pdf', file_data: `data:application/pdf;base64,${Buffer.from('pdf', 'utf8').toString('base64')}` },
    })
  })

  it('media and text parts interleave in source-block order', async () => {
    const media = mediaMapFrom([['a1', { mediaType: 'audio/wav', text: 'x' }]])
    const request = await serializeRequest({
      model: 'm',
      messages: [userMessage([
        { type: 'text', text: 'listen:' },
        fileBlock('a1', 'note.wav'),
        { type: 'text', text: 'then reply' },
      ])],
    } as never, capability({ input: ['text', 'audio'] }), undefined, media)
    const content = (request.messages[0] as { content: Array<Record<string, unknown>> }).content
    expect(content.map((part) => part.type)).toEqual(['text', 'input_audio', 'text'])
  })

  it('a missing media blob is a loud INVALID_REQUEST, never a silent drop', async () => {
    await expect(serializeRequest({
      model: 'm', messages: [userMessage([fileBlock('a1', 'note.mp3')])],
    } as never, capability({ input: ['text', 'audio'] }), undefined, new Map()))
      .rejects.toThrow(/missing bytes for file "note\.mp3"/)
  })
})

describe('session-title one-shots strip media', () => {
  it('media blocks and thinking fields are stripped from title calls', async () => {
    const media = mediaMapFrom([['a1', { mediaType: 'audio/wav', text: 'x' }]])
    const request = await serializeRequest({
      model: 'm',
      purpose: 'session-title',
      messages: [
        { role: 'system', content: [{ type: 'text', text: 'summarize' }] },
        userMessage([
          { type: 'text', text: 'about this audio' },
          fileBlock('a1', 'note.wav'),
        ]),
      ],
    } as never, capability({ input: ['text', 'audio'] }), undefined, media)
    // The user message lost its media and kept only text...
    const user = request.messages[1] as { role: string; content: string }
    expect(user.content).toBe('about this audio')
    // ...and a toggle model sends thinking OFF for the title call.
    expect(request.chat_template_kwargs).toEqual({ enable_thinking: false, preserve_thinking: true })
  })

  it('a media-only user message disappears from the title call', async () => {
    const request = await serializeRequest({
      model: 'm',
      purpose: 'session-title',
      messages: [userMessage([fileBlock('v1', 'clip.mp4')])],
    } as never, capability({ input: ['text', 'video'] }), undefined, new Map())
    expect(request.messages).toEqual([])
  })
})
