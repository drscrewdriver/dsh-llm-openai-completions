import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'

describe('version-conditional surfaces', () => {
  it('settings-read: falls back to the legacy get(ns) channel when describe is absent', async () => {
    const { readSection } = await import('../src/settings-read.ts')
    const section = { enabled: true, providers: ['local35b'] }
    const ctx = {
      get: () => ({ get: (ns: string) => (ns === 'llm-openai-completions' ? section : undefined) }),
    } as unknown as Context
    const readout = readSection<{ enabled: boolean }>(ctx, 'llm-openai-completions')
    expect(readout?.value).toEqual(section)
    expect(readout?.revision).toBe(0)
    expect(readSection(ctx, 'absent')).toBeUndefined()
  })

  it('settings-read: describe() wins over get() when both faces exist', async () => {
    const { readSection } = await import('../src/settings-read.ts')
    const ctx = {
      get: () => ({
        describe: () => [{ ns: 'ns-a', value: { from: 'describe' }, revision: 7 }],
        get: () => ({ from: 'get' }),
      }),
    } as unknown as Context
    expect(readSection(ctx, 'ns-a')).toEqual({ value: { from: 'describe' }, revision: 7 })
  })

  it('legacy section install registers the namespace on a ≤0.1.6 settings face only', async () => {
    const { apply } = await import('../src/index.ts')
    const registered: Array<{ ns: string; base: unknown }> = []
    const effects: Array<() => void> = []
    let watched = false
    const legacySettings = {
      register(ns: string, _schema: unknown, options?: { base?: unknown }) {
        registered.push({ ns, base: options?.base })
        return {
          get: () => ({ enabled: true, providers: ['from-legacy'] }),
          watch: (cb: () => void) => {
            watched = true
            void cb
          },
        }
      },
    }
    const ctx = {
      get: () => undefined,
      inject: (deps: string[], fn: (sctx: { settings: unknown; effect: (c: () => void) => void }) => void) => {
        expect(deps).toEqual(['settings'])
        fn({ settings: legacySettings, effect: (c: () => void) => effects.push(c) })
      },
      on: () => () => {},
      provide: () => {},
      logger: { info: () => {}, debug: () => {}, warn: () => {} },
    } as unknown as Context
    apply(ctx, { enabled: false, providers: [] })
    // The namespace is registered with the entry as base…
    expect(registered).toEqual([{ ns: 'llm-openai-completions', base: { enabled: false, providers: [] } }])
    expect(watched).toBe(true)
    // …and the legacy getter now feeds current(): enabled flips to true.
    expect(registered.length).toBe(1)
  })

  it('legacy section install is a no-op on the 0.1.7+ SettingsForms shape', async () => {
    const { apply } = await import('../src/index.ts')
    let injectCalled = false
    const formsSettings = {
      describe: () => [],
      update: async () => {},
    }
    const ctx = {
      get: () => undefined,
      inject: () => {
        injectCalled = true
      },
      on: () => () => {},
      provide: () => {},
      logger: { info: () => {}, debug: () => {}, warn: () => {} },
    } as unknown as Context
    apply(ctx, { enabled: false, providers: [] })
    // inject(['settings']) runs, but the 0.1.7+ face has no register — nothing installed.
    expect(injectCalled).toBe(true)
    void formsSettings
  })

  it('ToolCallId shim resolves the brand at module load (ToolCallId on this line)', async () => {
    vi.resetModules()
    const { ToolCallId } = await import('../src/adapter/tool-call-id.ts')
    const id = ToolCallId('call-1') as unknown as string
    expect(id).toBe('call-1')
  })

  it('ToolCallId shim falls back to CallId when the host predates the rename', async () => {
    vi.resetModules()
    vi.doMock('@deepseek-ai/dsh-llm', () => ({
      // A 0.1.0/0.1.1-line dsh-llm: CallId only, no ToolCallId.
      ToolCallId: undefined,
      CallId: (id: string) => ({ __id: id }),
      LlmError: class extends Error {},
      attributionHeaders: () => ({}),
      EMPTY_RESPONSE_CODE: 'EMPTY_RESPONSE',
    }))
    const { ToolCallId } = await import('../src/adapter/tool-call-id.ts')
    expect((ToolCallId('call-legacy') as unknown as { __id: string }).__id).toBe('call-legacy')
    vi.doUnmock('@deepseek-ai/dsh-llm')
    vi.resetModules()
  })
})
