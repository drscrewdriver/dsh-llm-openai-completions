import { describe, expect, it } from 'vitest'
import {
  declaresThinking,
  identifyTakeoverProviders,
  isCustomOpenAiGateway,
  takeoverRouteSet,
  type PiAiSection,
} from '../src/adapter/identify.ts'

const customThinkingProvider = {
  local35b: {
    api: 'openai-completions',
    baseURL: 'http://192.168.100.242:8200/v1',
    models: [
      { id: 'Qwen3.6-35B-A3B', reasoningEfforts: { off: null, high: 'high' } },
    ],
  },
}

describe('isCustomOpenAiGateway', () => {
  it('explicit api: openai-completions is custom', () => {
    expect(isCustomOpenAiGateway({ api: 'openai-completions', baseURL: 'http://x/v1' })).toBe(true)
  })

  it('a non-official baseURL without api field is custom', () => {
    expect(isCustomOpenAiGateway({ baseURL: 'http://192.168.100.242:8200/v1' })).toBe(true)
  })

  it('official hosts are not custom', () => {
    expect(isCustomOpenAiGateway({ baseURL: 'https://api.openai.com/v1' })).toBe(false)
    expect(isCustomOpenAiGateway({ baseURL: 'https://api.deepseek.com/v1' })).toBe(false)
    expect(isCustomOpenAiGateway({ baseURL: 'https://openrouter.ai/api/v1' })).toBe(false)
  })

  it('a route with neither api nor baseURL is not custom (catalog route)', () => {
    expect(isCustomOpenAiGateway({ models: [] })).toBe(false)
    expect(isCustomOpenAiGateway(undefined)).toBe(false)
  })
})

describe('declaresThinking', () => {
  it('true when a model carries a reasoningEfforts table', () => {
    expect(declaresThinking(customThinkingProvider.local35b)).toBe(true)
  })

  it('false when reasoningEfforts is false (thinking off)', () => {
    expect(declaresThinking({ models: [{ id: 'm', reasoningEfforts: false }] })).toBe(false)
  })

  it('false when no models or no table', () => {
    expect(declaresThinking({ models: [{ id: 'm' }] })).toBe(false)
    expect(declaresThinking({ models: [] })).toBe(false)
    expect(declaresThinking(undefined)).toBe(false)
  })
})

describe('identifyTakeoverProviders', () => {
  it('finds custom + thinking providers only', () => {
    const section: PiAiSection = {
      providers: {
        ...customThinkingProvider,
        xiaomi: { apiKeyEnv: 'XIAOMI_API_KEY', models: [{ id: 'mimo-v2.5' }] },
        official: { baseURL: 'https://api.deepseek.com/v1', models: [{ id: 'm', reasoningEfforts: { high: 'high' } }] },
        customNoThink: { api: 'openai-completions', baseURL: 'http://y/v1', models: [{ id: 'm' }] },
      },
    }
    expect(identifyTakeoverProviders(section)).toEqual(['local35b'])
  })

  it('scans modelOverrides for thinking declaration', () => {
    const section: PiAiSection = {
      providers: {
        overridesOnly: {
          api: 'openai-completions',
          baseURL: 'http://z/v1',
          modelOverrides: { m: { reasoningEfforts: { high: 'high' } } },
        },
      },
    }
    expect(identifyTakeoverProviders(section)).toEqual(['overridesOnly'])
  })

  it('empty when the section is absent or has no providers', () => {
    expect(identifyTakeoverProviders(undefined)).toEqual([])
    expect(identifyTakeoverProviders({})).toEqual([])
  })
})

describe('takeoverRouteSet — the dispatch judgment', () => {
  const piAi: PiAiSection = { providers: { ...customThinkingProvider } }

  it('disabled switch takes over nothing (null)', () => {
    expect(takeoverRouteSet(false, ['local35b'], piAi)).toBeNull()
  })

  it('enabled unions the manual list with the identified routes', () => {
    expect(takeoverRouteSet(true, ['manual-route'], piAi)).toEqual(new Set(['manual-route', 'local35b']))
  })

  it('manual entries cover routes outside the auto criteria', () => {
    expect(takeoverRouteSet(true, ['customNoThink'], piAi)).toEqual(new Set(['customNoThink', 'local35b']))
  })

  it('works without an llm-pi-ai section (manual only)', () => {
    expect(takeoverRouteSet(true, ['a'], undefined)).toEqual(new Set(['a']))
  })
})
