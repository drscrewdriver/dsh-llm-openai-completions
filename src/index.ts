/**
 * dsh-llm-openai-completions — host plugin.
 *
 * Takes over streaming for selected custom-provider routes (vLLM / LM Studio /
 * self-hosted OpenAI proxies) through the official `llm/stream` waterfall:
 * the plugin registers a prepend listener that, for a configured provider,
 * yields its own openai-completions stream instead of calling `next()` (which
 * would reach the pi-ai adapter). No adapter object is mutated, so there is no
 * registration identity to get wrong.
 *
 * The adapter never guesses: `system` is always `role: "system"`, thinking is
 * driven by the model's `compat.thinkingFormat`, and the receive side splits
 * Qwen3-style `</think>` content. Configuration lives in the llm-pi-ai
 * section (baseURL / models / reasoningEfforts / compat).
 *
 * Disabling the plugin (or removing the provider from the list) falls through
 * to `next()` — the pi-ai adapter serves the route unchanged.
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { OpenAiCompletionsAdapter } from './adapter/adapter.ts'
import { providerResolverOf } from './adapter/config.ts'

/** Plugin settings. */
export interface Config {
  /** Master switch: when false the llm-pi-ai streams are restored. */
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

/**
 * Plugin body.
 * @param ctx - host context carrying llm / settings services.
 * @param config - composition entry.
 */
export function apply(ctx: Context, config: Config): void {
  // The settings service may not be resolvable via ctx.get at apply time
  // (it registers later); resolve it lazily on every lookup instead.
  const resolveSettings = (): { get?: (ns: string) => unknown } | undefined =>
    ctx.get('settings') as { get?: (ns: string) => unknown } | undefined
  const adapter = new OpenAiCompletionsAdapter((provider) => providerResolverOf(resolveSettings())(provider))

  // Runtime-adjustable configuration source: composition entry is the base,
  // the settings namespace layers on top.
  let current: () => Config = () => config
  installSettingsSection(ctx, SETTINGS_NAMESPACE, Config, config, {
    setSource: (source) => {
      current = source
    },
    onChange: () => {},
  })

  // Take over the llm/stream waterfall for configured providers. prepend keeps
  // this listener OUTERMOST (runs last), so a takeover short-circuits pi-ai.
  const on = ctx.on as unknown as (
    event: string,
    handler: (options: GenerateOptions, next: () => AsyncIterable<StreamChunk>) => AsyncIterable<StreamChunk>,
    options?: { prepend?: boolean },
  ) => void
  on('llm/stream', async function* (options, next) {
    const cfg = current()
    const takeOver = cfg.enabled && cfg.providers.includes(options.provider)
    // Debug-only: takeover decisions are observable through the settings
    // namespace; keep the wire details out of the default log.
    ctx.logger?.debug?.(
      '[llm-openai-completions] stream provider=%s model=%s effort=%s enabled=%s providers=%j takeOver=%s',
      String(options.provider), String(options.model), String(options.reasoningEffort),
      cfg.enabled, cfg.providers, takeOver,
    )
    if (takeOver) {
      yield* adapter.stream(options)
      return
    }
    yield* next()
  }, { prepend: true })
}
