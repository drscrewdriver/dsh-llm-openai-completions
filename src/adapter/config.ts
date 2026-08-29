/**
 * Model-capability and provider lookup for the custom openai-completions
 * adapter.
 *
 * The adapter reads the live `llm-pi-ai` settings namespace (the same section
 * the user edits in Settings → Models): provider baseURL/credentials plus each
 * model's `reasoningEfforts` / `compat.thinkingFormat` /
 * `compat.supportsReasoningEffort` / `input` modalities. Reading the live
 * section means a Settings → Models edit applies to the next request without
 * a restart.
 * @module dsh-llm-openai-completions/adapter/config
 */

/** One model's capability snapshot, resolved from the llm-pi-ai config. */
export interface ModelCapability {
  /** `compat.thinkingFormat` (qwen / qwen-chat-template / openai / …). */
  thinkingFormat?: string
  /** `compat.supportsReasoningEffort` — the model takes reasoning_effort. */
  supportsReasoningEffort: boolean
  /** The declared `reasoningEfforts` table (level → wire spelling). */
  reasoningEfforts: Record<string, unknown>
  /** The model accepts image input (its `input` lists image). */
  vision: boolean
}

/** One provider's resolved config for this adapter. */
export interface ProviderInfo {
  /** The wire endpoint, e.g. http://host:port/v1. */
  baseURL: string
  /** Credential env reference, when configured. */
  apiKeyEnv?: string
  /** Capabilities keyed by model id. */
  models: Record<string, ModelCapability>
}

/** Minimal settings-service face (typed locally to avoid host value imports). */
interface SettingsRead {
  get?: (ns: string) => unknown
}

/** A live lookup that re-reads the llm-pi-ai section on every call. */
export interface ProviderResolver {
  (provider: string): ProviderInfo | undefined
}

/** The relevant slice of the llm-pi-ai section. */
interface PiAiSection {
  providers?: Record<string, {
    baseURL?: unknown
    apiKeyEnv?: unknown
    models?: unknown
  }>
}

/** Whether a value looks like the declared reasoningEfforts table. */
function isEffortsTable(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Build a provider resolver over the live `llm-pi-ai` settings section.
 * @param settings - the settings service (may be absent in odd environments).
 * @returns a resolver returning the provider info when it is configured.
 */
export function providerResolverOf(settings: SettingsRead | undefined): ProviderResolver {
  return (provider) => {
    const section = settings?.get?.('llm-pi-ai') as PiAiSection | undefined
    const profile = section?.providers?.[provider]
    if (typeof profile !== 'object' || profile === null) return undefined
    const baseURL = typeof profile.baseURL === 'string' && profile.baseURL.length > 0
      ? profile.baseURL
      : undefined
    if (baseURL === undefined) return undefined

    const models: Record<string, ModelCapability> = {}
    if (Array.isArray(profile.models)) {
      for (const entry of profile.models) {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue
        const model = entry as Record<string, unknown>
        const id = typeof model['id'] === 'string' ? model['id'] : undefined
        if (id === undefined || id.length === 0) continue
        const compat = typeof model['compat'] === 'object' && model['compat'] !== null && !Array.isArray(model['compat'])
          ? model['compat'] as Record<string, unknown>
          : {}
        const efforts = isEffortsTable(model['reasoningEfforts']) ? model['reasoningEfforts'] : {}
        const input = model['input']
        models[id] = {
          ...typeof compat['thinkingFormat'] === 'string' ? { thinkingFormat: compat['thinkingFormat'] } : {},
          supportsReasoningEffort: compat['supportsReasoningEffort'] === true
            || Object.keys(efforts).length > 0,
          reasoningEfforts: efforts,
          vision: Array.isArray(input) && input.includes('image'),
        }
      }
    }

    return {
      baseURL,
      ...typeof profile.apiKeyEnv === 'string' && profile.apiKeyEnv.length > 0
        ? { apiKeyEnv: profile.apiKeyEnv }
        : {},
      models,
    }
  }
}
