/**
 * dsh-llm-openai-completions — host plugin.
 *
 * Replaces the stream implementation of selected custom-provider routes
 * (vLLM / LM Studio / self-hosted OpenAI proxies) with an openai-completions
 * adapter that never guesses: `system` is always `role: "system"`, thinking is
 * driven by the model's `compat.thinkingFormat`, and the receive side splits
 * Qwen3-style `</think>` content. Configuration lives in the llm-pi-ai
 * section (baseURL / models / reasoningEfforts / compat), so a user edits
 * Settings → Models as usual; this plugin only swaps the wire behavior.
 *
 * Registration: the routes are already owned by llm-pi-ai, so instead of
 * `registerAdapter` (which would throw DUPLICATE_ADAPTER) the plugin wraps the
 * registered adapter instance's `stream` method, preserving its resolveModel /
 * retry policy. `llm/adapters-updated` re-applies the wrap after llm-pi-ai
 * re-registers (a settings edit), and disabling the plugin restores the
 * original stream.
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { readFileSync, writeFileSync } from 'node:fs'
import type { GenerateOptions, LlmAdapter } from '@deepseek-ai/dsh-llm'
import { OpenAiCompletionsAdapter } from './adapter/adapter.ts'
import { providerResolverOf } from './adapter/config.ts'

/** Plugin settings. */
export interface Config {
  /** Master switch: when false the original llm-pi-ai streams are restored. */
  enabled: boolean
  /** Provider routes this adapter takes over, e.g. [local-35b]. */
  providers: string[]
}

/** Composition-entry schema (also the settings namespace schema). */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(false),
  providers: z.array(z.string()).default([]),
})

/** Settings namespace owned by this plugin. */
export const SETTINGS_NAMESPACE = 'llm-openai-completions'

/** Minimal settings-service face (typed locally; the service is host-provided). */
interface SettingsServiceLike {
  register(ns: string, schema: unknown, options?: { base?: unknown }): {
    get(): unknown
    watch(callback: () => void): () => void
  }
}

/** Install a settings namespace through the cordis settings service. */
function installSettingsSection(
  ctx: Context,
  ns: string,
  schema: unknown,
  entry: Config,
  hooks: { setSource: (source: () => Config) => void; onChange: () => void },
): void {
  ;(ctx as unknown as { inject(deps: string[], fn: (sctx: {
    settings: SettingsServiceLike
    effect(cleanup: () => (() => void) | void, label?: string): void
  }) => void): void }).inject(['settings'], (sctx) => {
    const scope = sctx.settings.register(ns, schema, { base: entry })
    hooks.setSource(() => scope.get() as Config)
    hooks.onChange()
    sctx.effect(() => () => {
      hooks.onChange()
    })
    scope.watch(() => hooks.onChange())
  })
}

/** The wrapped stream function identity (one per apply, for unwrap matching). */
type StreamFn = (options: GenerateOptions) => AsyncIterable<unknown>

/**
 * Plugin body.
 * @param ctx - host context carrying llm / settings services.
 * @param config - composition entry.
 */
export function apply(ctx: Context, config: Config): void {
  const llm = ctx.get('llm') as { adapters?: Map<string, { adapter: LlmAdapter }> } | undefined
  const settings = ctx.get('settings') as { get?: (ns: string) => unknown } | undefined
  const adapter = new OpenAiCompletionsAdapter(providerResolverOf(settings))
  const wrapped: StreamFn = (options) => {
    debug({ event: 'wrapped.stream', provider: options.provider, model: options.model, effort: options.reasoningEffort })
    return adapter.stream(options)
  }

  // Temporary runtime diagnostics (writes a small JSON log under $DSH_HOME).
  const DEBUG_FILE = process.env.DSH_HOME
    ? `${process.env.DSH_HOME}/llm-openai-completions-debug.json`
    : `${process.cwd()}/llm-openai-completions-debug.json`
  const debug = (entry: Record<string, unknown>): void => {
    try {
      let lines: unknown[] = []
      try { lines = JSON.parse(readFileSync(DEBUG_FILE, 'utf8')) as unknown[] } catch { /* fresh */ }
      lines.push({ at: new Date().toISOString(), ...entry })
      writeFileSync(DEBUG_FILE, JSON.stringify(lines, null, 2), 'utf8')
    } catch (error) {
      // Diagnostics must never break the plugin; surface the write failure.
      try { writeFileSync(`${DEBUG_FILE}.err`, String(error), 'utf8') } catch { /* ignore */ }
    }
  }
  debug({ event: 'apply', settingsService: settings !== undefined, adaptersRegistered: [...(llm?.adapters?.keys() ?? [])] })

  // Last-applied original streams per provider, for restore on disable.
  const originals = new Map<string, LlmAdapter['stream']>()

  const applyWrap = (): void => {
    debug({ event: 'applyWrap', providers: current().providers, enabled: current().enabled })
    for (const provider of current().providers) {
      const registration = llm?.adapters?.get(provider)
      debug({ event: 'applyWrap.provider', provider, found: registration !== undefined })
      if (registration === undefined) continue
      if (registration.adapter.stream === wrapped) continue
      if (!originals.has(provider)) originals.set(provider, registration.adapter.stream)
      registration.adapter.stream = wrapped as LlmAdapter['stream']
      debug({ event: 'applyWrap.wrapped', provider })
    }
  }
  const applyUnwrap = (): void => {
    for (const [provider, original] of originals) {
      const registration = llm?.adapters?.get(provider)
      if (registration !== undefined && registration.adapter.stream === wrapped) {
        registration.adapter.stream = original
      }
    }
    originals.clear()
  }
  const rewrap = (): void => {
    applyUnwrap()
    if (current().enabled) applyWrap()
    else debug({ event: 'rewrap.skipped', enabled: current().enabled })
  }

  // Runtime-adjustable configuration source: composition entry is the base,
  // the settings namespace layers on top.
  let current: () => Config = () => config
  installSettingsSection(ctx, SETTINGS_NAMESPACE, Config, config, {
    setSource: (source) => {
      current = source
      debug({ event: 'setSource', value: source() })
    },
    onChange: () => {
      rewrap()
    },
  })

  const onAny = ctx.on as unknown as (event: string, listener: (...args: never[]) => unknown) => void
  onAny('llm/adapters-updated', () => {
    rewrap()
  })

  // Watch the live registration state: if llm-pi-ai re-registers with a fresh
  // adapter instance, our wrap disappears — this catches that.
  const watch = setInterval(() => {
    try {
      const reg = llm?.adapters?.get('local-35b')
      debug({
        event: 'watch',
        found: reg !== undefined,
        streamWrapped: reg?.adapter?.stream === wrapped,
        adapterCtor: reg?.adapter?.constructor?.name ?? null,
        providersInMap: [...(llm?.adapters?.keys() ?? [])],
        enabled: current().enabled,
      })
    } catch { /* ignore */ }
  }, 3000)

  // Initial application (llm-pi-ai may register after this plugin).
  rewrap()
  ctx.effect(() => () => {
    applyUnwrap()
    clearInterval(watch)
  }, 'dsh-llm-openai-completions: unwrap on unload')
}
