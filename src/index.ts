/**
 * dsh-llm-openai-completions — host plugin.
 *
 * Takes over streaming for selected custom-provider routes (vLLM / LM Studio /
 * self-hosted OpenAI proxies) through the official `llm/stream` waterfall:
 * the plugin registers a prepend+global listener that, for a taken-over
 * provider, yields its own openai-completions stream instead of calling
 * `next()` (which would reach the pi-ai adapter). No adapter object is
 * registered or mutated, so there is no registration identity to unwind —
 * disabling the switch (or unmounting the plugin) falls through to `next()`
 * and pi-ai serves the route unchanged.
 *
 * Takeover judgment (single source of truth, this plugin's own settings
 * section): `enabled && providers.includes(route)` — pure manual membership.
 * The capability card's per-route takeover checkbox writes exactly this list,
 * so the checkbox, the dispatch, and dsh-thinking-levels' gating all read one
 * truth. The data plane stays in llm-pi-ai, read through `describe()` per
 * request.
 *
 * The adapter never guesses: `system` is always `role: "system"`, thinking is
 * driven by the model's `compat.thinkingFormat`, the receive side splits
 * Qwen3-style `</think>` content, undeclared modalities are refused before
 * send, and a registered prompt source can rewrite the system prompt and tool
 * descriptions (the `llmOpenaiCompletions` service — dsh-promptbook-class
 * consumers, see AGENTS.md).
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Volatile } from '@deepseek-ai/cosmokit'
import { isVolatile } from '@deepseek-ai/cosmokit'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { OpenAiCompletionsAdapter } from './adapter/adapter.ts'
import { providerResolverOf } from './adapter/config.ts'
import { PI_AI_NAMESPACE, takeoverRouteSet, type PiAiSection } from './adapter/identify.ts'
import { PromptSourceRegistry } from './adapter/prompt-source.ts'
import type { PromptSource, PromptSourceFace } from './adapter/prompt-source.ts'
import { readSection } from './settings-read.ts'

export { type PromptSource, type PromptSourceFace } from './adapter/prompt-source.ts'

/** The settings namespace of the pi-ai data plane (re-exported for consumers). */
export { PI_AI_NAMESPACE }

/** Plugin settings. */
export interface Config {
  /** Master switch: when false every llm-pi-ai stream passes through. */
  enabled: boolean | Volatile<boolean>
  /** Manual takeover list (route ids), on top of the auto-identified set. */
  providers: string[] | Volatile<string[]>
}

/**
 * Composition-entry schema. Both fields are `.volatile()`: DSH 0.1.7+ hands
 * `apply` live refs and generates the settings form from the schema alone,
 * so the switch and the manual list are runtime-editable without a remount.
 */
export const Config = z.object({
  enabled: z.boolean().default(false).volatile(),
  providers: z.array(z.string()).default([]).volatile(),
})

/** Settings defaults, kept in lockstep with the schema defaults above. */
export const DEFAULT_CONFIG: Config = { enabled: false, providers: [] }

/** Settings namespace owned by this plugin. */
export const SETTINGS_NAMESPACE = 'llm-openai-completions'

/** Host services this plugin's dispatch path consumes (declarative inject). */
export const inject = ['credentials', 'attachments']

/** Read a `.volatile()` field: a live ref on DSH 0.1.7+, a plain value otherwise. */
function readLive<T>(value: T | Volatile<T> | undefined, fallback: T): T {
  if (isVolatile(value)) {
    const snapshot = value.get()
    return (snapshot === undefined ? fallback : snapshot) as T
  }
  return (value as T | undefined) ?? fallback
}

/**
 * Legacy (≤ 0.1.6) settings face: install a registered section so the switch
 * and manual list are runtime-editable and the namespace is VISIBLE to other
 * plugins — dsh-thinking-levels reads `llm-openai-completions` through
 * `settings.get(ns)` on these hosts, which resolves only registered
 * namespaces. On 0.1.7+ the composition entry IS the section (declarative,
 * `describe()`-visible) and `settings.register` no longer exists, so the
 * install is a no-op there — the discriminator is the service's own shape
 * (`register` present, `describe` absent), never a version guess.
 */
let legacyRead: (() => Config) | undefined

function installLegacySection(ctx: Context, config: Config): void {
  ;(ctx as unknown as {
    inject(deps: string[], fn: (sctx: { settings: unknown; effect(cleanup: () => (() => void) | void, label?: string): void }) => void): void
  }).inject(['settings'], (sctx) => {
    const settings = sctx.settings as {
      register?: (ns: string, schema: unknown, options?: { base?: unknown }) => {
        get(): unknown
        watch?(callback: () => void): () => void
      }
      describe?: unknown
    }
    if (typeof settings?.register !== 'function' || typeof settings.describe === 'function') return
    const scope = settings.register(SETTINGS_NAMESPACE, Config, { base: config })
    legacyRead = () => scope.get() as Config
    sctx.effect(() => () => {
      legacyRead = undefined
    })
    scope.watch?.(() => {})
  })
}

/**
 * Resolve the route's API key, version- and environment-conditional: the
 * credentials service first (the web Models page writes there), then the
 * launch environment (exists on every line), then the raw process
 * environment. All empty is a loud MISSING_CREDENTIAL — a keyless request
 * would only produce an opaque gateway 401.
 */
async function resolveApiKey(ctx: Context, apiKeyEnv: string | undefined): Promise<string | undefined> {
  if (apiKeyEnv === undefined) return undefined
  const credentials = ctx.get('credentials') as { resolve?: (ref: unknown) => Promise<{ value: string } | undefined> } | undefined
  let value: string | undefined
  if (credentials?.resolve !== undefined) {
    const resolved = await credentials.resolve(credentialRef(apiKeyEnv))
    if (resolved !== undefined) value = resolved.value
  }
  if (value === undefined || value.length === 0) {
    const ambient = launchEnvironmentOf(ctx).get(apiKeyEnv)
    if (ambient !== undefined && ambient.value.length > 0) value = ambient.value
  }
  if (value === undefined || value.length === 0) value = process.env[apiKeyEnv]
  if (value === undefined || value.length === 0) {
    throw new LlmError(
      `llm-openai-completions: no credential for the route's "${apiKeyEnv}" reference — store it through the credentials service (the web Models page writes it) or export it in the launching environment`,
      'MISSING_CREDENTIAL',
    )
  }
  return value
}

/**
 * Plugin body.
 * @param ctx - host context carrying llm / settings / credentials services.
 * @param config - composition entry (volatile fields arrive as live refs).
 */
export function apply(ctx: Context, config: Config = DEFAULT_CONFIG): void {
  installLegacySection(ctx, config)
  // Live configuration: the legacy registered section (≤ 0.1.6, user edits
  // layered over the entry base) wins when installed; otherwise the 0.1.7+
  // composition entry with its volatile refs.
  const current = (): { enabled: boolean; providers: string[] } => {
    const base = legacyRead?.() ?? config
    return {
      enabled: readLive(base.enabled, false),
      providers: readLive(base.providers, []),
    }
  }

  const promptSources = new PromptSourceRegistry()
  const adapter = new OpenAiCompletionsAdapter(
    // Live data-plane lookup: the llm-pi-ai section as describe() reports it
    // (undefined when pi-ai is not composed — takeover then resolves nothing).
    (provider) => providerResolverOf(readSection<PiAiSection>(ctx, PI_AI_NAMESPACE)?.value)(provider),
    // The attachment service may register after apply; resolve it lazily on
    // every stream (media-bearing requests only), never during apply.
    () => ctx.get('attachments') as never,
    (options, apiKeyEnv) => resolveApiKey(ctx, apiKeyEnv),
    promptSources,
  )

  // Take over the llm/stream waterfall for taken-over routes. prepend keeps
  // this listener OUTERMOST (runs last), so a takeover short-circuits pi-ai;
  // global crosses the fiber boundary — LlmRuntime originates the waterfall
  // from its own fiber, which a fiber-local listener never sees.
  const on = ctx.on as unknown as (
    event: string,
    handler: (options: GenerateOptions, next: () => AsyncIterable<StreamChunk>) => AsyncIterable<StreamChunk>,
    options?: { prepend?: boolean; global?: boolean },
  ) => void
  on('llm/stream', async function* (options, next) {
    const cfg = current()
    const routes = takeoverRouteSet(cfg.enabled, cfg.providers)
    const takeOver = routes !== null && routes.has(String(options.provider))
    ctx.logger?.debug?.(
      '[llm-openai-completions] stream provider=%s model=%s effort=%s enabled=%s routes=%j takeOver=%s',
      String(options.provider), String(options.model), String(options.reasoningEffort),
      cfg.enabled, routes !== null ? [...routes] : [], takeOver,
    )
    if (takeOver) {
      yield* adapter.stream(options)
      return
    }
    yield* next()
  }, { prepend: true, global: true })

  // The prompt-source seam: dsh-promptbook-class consumers register a source
  // and it applies to every taken-over dispatch (see AGENTS.md for the
  // contract). Zero behavior when no source is registered.
  const face: PromptSourceFace = {
    registerPromptSource: (source: PromptSource) => promptSources.register(source),
  }
  ;(ctx as unknown as { provide(name: string, api: unknown): void }).provide('llmOpenaiCompletions', {
    ...face,
    // Hosted surface = the models of the currently taken-over routes, from
    // the live llm-pi-ai section. Empty while the switch is off — honest by
    // construction, since dispatch only rewrites prompts on taken-over routes.
    listHostedModels(): Array<{ provider: string; id: string; name?: string }> {
      const cfg = current()
      const routes = takeoverRouteSet(cfg.enabled, cfg.providers)
      if (routes === null) return []
      const piAi = readSection<{ providers?: Record<string, { models?: Array<Record<string, unknown>> }> }>(ctx, PI_AI_NAMESPACE)?.value
      const hosted: Array<{ provider: string; id: string; name?: string }> = []
      for (const [provider, profile] of Object.entries(piAi?.providers ?? {})) {
        if (!routes.has(provider) || !Array.isArray(profile.models)) continue
        for (const model of profile.models) {
          const id = typeof model['id'] === 'string' ? model['id'] : undefined
          if (id === undefined) continue
          hosted.push({
            provider,
            id,
            ...typeof model['name'] === 'string' ? { name: model['name'] } : {},
          })
        }
      }
      return hosted
    },
  })

  ctx.logger?.info?.('[llm-openai-completions] short-circuit listener registered (prepend+global); switch is %s', String(current().enabled))
}
