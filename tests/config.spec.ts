import { describe, expect, it } from 'vitest'
import { providerResolverOf } from '../src/adapter/config.ts'

/** A settings-service stub returning one canned section per namespace. */
const settingsOf = (sections: Record<string, unknown>) => ({
  get: (ns: string) => sections[ns],
})

describe('providerResolverOf — model capability resolution', () => {
  it('resolves baseURL and models from the llm-pi-ai section', () => {
    const settings = settingsOf({
      'llm-pi-ai': {
        providers: {
          'local-35b': {
            baseURL: 'http://192.168.100.242:8200/v1',
            models: [{ id: 'Qwen3.6-35B-A3B', input: ['text', 'image'] }],
          },
        },
      },
    })
    const info = providerResolverOf(settings)('local-35b')
    expect(info?.baseURL).toBe('http://192.168.100.242:8200/v1')
    expect(info?.models['Qwen3.6-35B-A3B']?.vision).toBe(true)
  })

  it('unknown provider resolves to undefined', () => {
    const settings = settingsOf({ 'llm-pi-ai': { providers: {} } })
    expect(providerResolverOf(settings)('nope')).toBeUndefined()
  })

  it('missing settings service resolves to undefined', () => {
    expect(providerResolverOf(undefined)('local-35b')).toBeUndefined()
  })

  it('a bare reasoningEfforts table is NOT effort-capable (Qwen3.6 toggle-only)', () => {
    const settings = settingsOf({
      'llm-pi-ai': {
        providers: {
          'local-35b': {
            baseURL: 'http://host/v1',
            models: [{
              id: 'Qwen3.6-35B-A3B',
              reasoningEfforts: { off: null, high: 'high' },
              compat: { thinkingFormat: 'qwen' },
            }],
          },
        },
      },
    })
    const model = providerResolverOf(settings)('local-35b')?.models['Qwen3.6-35B-A3B']
    expect(model?.supportsReasoningEffort).toBe(false)
    expect(model?.thinkingFormat).toBe('qwen')
    expect(model?.reasoningEfforts).toEqual({ off: null, high: 'high' })
  })

  it('explicit compat.supportsReasoningEffort marks an effort-capable model (Qwen3.8)', () => {
    const settings = settingsOf({
      'llm-pi-ai': {
        providers: {
          'local-35b': {
            baseURL: 'http://host/v1',
            models: [{
              id: 'Qwen3.8-27B',
              reasoningEfforts: { off: null, high: 'high', max: 'max' },
              compat: { supportsReasoningEffort: true, thinkingFormat: 'openai' },
            }],
          },
        },
      },
    })
    const model = providerResolverOf(settings)('local-35b')?.models['Qwen3.8-27B']
    expect(model?.supportsReasoningEffort).toBe(true)
  })

  it('model without input inherits the route defaultInput (vision gateway, pi-ai fallback)', () => {
    const settings = settingsOf({
      'llm-pi-ai': {
        providers: {
          'local-35b': {
            baseURL: 'http://host/v1',
            defaultInput: ['text', 'image'],
            models: [{ id: 'Qwen3.6-35B-A3B' }],
          },
        },
      },
    })
    const model = providerResolverOf(settings)('local-35b')?.models['Qwen3.6-35B-A3B']
    expect(model?.vision).toBe(true)
  })

  it('model with an explicit text-only input overrides a vision defaultInput', () => {
    const settings = settingsOf({
      'llm-pi-ai': {
        providers: {
          'local-35b': {
            baseURL: 'http://host/v1',
            defaultInput: ['text', 'image'],
            models: [{ id: 'Qwen3.6-35B-A3B', input: ['text'] }],
          },
        },
      },
    })
    const model = providerResolverOf(settings)('local-35b')?.models['Qwen3.6-35B-A3B']
    expect(model?.vision).toBe(false)
  })

  it('model without compat inherits the route compat (thinkingFormat)', () => {
    const settings = settingsOf({
      'llm-pi-ai': {
        providers: {
          'local-35b': {
            baseURL: 'http://host/v1',
            compat: { thinkingFormat: 'qwen', supportsReasoningEffort: false },
            models: [{ id: 'Qwen3.6-35B-A3B' }],
          },
        },
      },
    })
    const model = providerResolverOf(settings)('local-35b')?.models['Qwen3.6-35B-A3B']
    expect(model?.thinkingFormat).toBe('qwen')
    expect(model?.supportsReasoningEffort).toBe(false)
  })
})
