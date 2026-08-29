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
  onChange: () => void,
): void {
  ;(ctx as unknown as { inject(deps: string[], fn: (sctx: {
    settings: SettingsServiceLike
    effect(cleanup: () => (() => void) | void, label?: string): void
  }) => void): void }).inject(['settings'], (sctx) => {
    const scope = sctx.settings.register(ns, schema, { base: entry })
    sctx.effect(() => () => {
      onChange()
    })
    scope.watch(() => onChange())
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
  const wrapped: StreamFn = (options) => adapter.stream(options)

  // Last-applied original streams per provider, for restore on disable.
  const originals = new Map<string, LlmAdapter['stream']>()

  const applyWrap = (): void => {
    for (const provider of config.providers) {
      const registration = llm?.adapters?.get(provider)
      if (registration === undefined) continue
      if (registration.adapter.stream === wrapped) continue
      if (!originals.has(provider)) originals.set(provider, registration.adapter.stream)
      registration.adapter.stream = wrapped as LlmAdapter['stream']
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
    if (config.enabled) applyWrap()
  }

  let current = config
  installSettingsSection(ctx, SETTINGS_NAMESPACE, Config, config, () => {
    // Re-read the active section; enabling/disabling or editing providers
    // takes effect on the next llm/adapters-updated or immediately here.
    current = config
    rewrap()
  })

  const onAny = ctx.on as unknown as (event: string, listener: (...args: never[]) => unknown) => void
  onAny('llm/adapters-updated', () => {
    rewrap()
  })

  // Initial application (llm-pi-ai may register after this plugin).
  rewrap()
  ctx.effect(() => () => {
    applyUnwrap()
  }, 'dsh-llm-openai-completions: unwrap on unload')
}
