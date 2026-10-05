import { describe, expect, it } from 'vitest'
import { FACE_MODALITY, faceOf, rootFor } from '../src/adapter/face.ts'

describe('faceOf — per-route wire face', () => {
  it('selects each of the three pi-ai protocols', () => {
    expect(faceOf({ api: 'openai-completions' })).toBe('openai-completions')
    expect(faceOf({ api: 'openai-responses' })).toBe('openai-responses')
    expect(faceOf({ api: 'anthropic-messages' })).toBe('anthropic-messages')
  })

  it('falls back to openai-completions when absent or unrecognized', () => {
    expect(faceOf({})).toBe('openai-completions')
    expect(faceOf(undefined)).toBe('openai-completions')
    expect(faceOf({ api: 'mistral-conversations' })).toBe('openai-completions')
  })
})

describe('FACE_MODALITY — per-face honest modality sets', () => {
  it('carries the full inline set on the openai faces', () => {
    expect(FACE_MODALITY['openai-completions']).toEqual(['image', 'audio', 'video', 'pdf'])
    expect(FACE_MODALITY['openai-responses']).toEqual(['image', 'audio', 'video', 'pdf'])
  })

  it('restricts the anthropic face to image (MiMo silently drops the rest)', () => {
    expect(FACE_MODALITY['anthropic-messages']).toEqual(['image'])
  })
})

describe('rootFor — per-face wire root', () => {
  it('appends /v1 for the anthropic face when missing', () => {
    expect(rootFor('http://host:8200', 'anthropic-messages')).toBe('http://host:8200/v1')
    expect(rootFor('http://host:8200/', 'anthropic-messages')).toBe('http://host:8200/v1')
    expect(rootFor('http://host:8200/v1', 'anthropic-messages')).toBe('http://host:8200/v1')
  })

  it('leaves openai faces bare (the user already configured /v1)', () => {
    expect(rootFor('http://host:8200/v1/', 'openai-completions')).toBe('http://host:8200/v1')
    expect(rootFor('http://host:8200/v1', 'openai-responses')).toBe('http://host:8200/v1')
  })
})
