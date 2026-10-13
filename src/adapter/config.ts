/**
 * Model-capability and provider lookup for the custom openai-completions
 * transport.
 *
 * The transport reads the live `llm-pi-ai` settings section (the same section
 * the user edits in Settings → Models): provider baseURL/credentials plus each
 * model's `reasoningEfforts` / `compat.thinkingFormat` /
 * `compat.supportsReasoningEffort` / `input` modalities. Reading the live
 * section (through `describe()` — see settings-read) means a Settings → Models
 * edit applies to the next request without a restart.
 * @module dsh-llm-openai-completions/adapter/config
 */
import type { FaceId } from './face.ts'
import { faceOf } from './face.ts'
import type { PiAiSection } from './identify.ts'

/** The modalities a model's `input` declaration may name. */
export const INPUT_MODALITIES = ['text', 'image', 'audio', 'video', 'pdf'] as const

/** One model's capability snapshot, resolved from the llm-pi-ai config. */
export interface ModelCapability {
  /** `compat.thinkingFormat` (qwen / qwen-chat-template / openai / …). */
  thinkingFormat?: string
  /** `compat.supportsReasoningEffort` — the model takes reasoning_effort. */
  supportsReasoningEffort: boolean
  /** The declared `reasoningEfforts` table (level → wire spelling). */
  reasoningEfforts: Record<string, unknown>
  /** The declared `input` modalities (route `defaultInput` inherited, text floor). */
  input: string[]
  /** The declared per-model output ceiling (max_tokens on faces that require it). */
  maxTokens?: number
  /** The model accepts image input (its `input` lists image). */
  vision: boolean
}

/** One provider's resolved config for this transport. */
export interface ProviderInfo {
  /** The wire endpoint, e.g. http://host:port/v1. */
  baseURL: string
  /** Credential env reference, when configured. */
  apiKeyEnv?: string
  /** The wire face this route speaks (from its `api` declaration). */
  face: FaceId
  /** Capabilities keyed by model id. */
  models: Record<string, ModelCapability>
}

/** A live lookup that re-reads the llm-pi-ai section on every call. */
export interface ProviderResolver {
  (provider: string): ProviderInfo | undefined
}

/** Whether a value looks like the declared reasoningEfforts table. */
function isEffortsTable(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Build a provider resolver over the live `llm-pi-ai` section.
 * @param section - the live llm-pi-ai section (undefined when not composed).
 * @returns a resolver returning the provider info when it is configured.
 */
export function providerResolverOf(section: PiAiSection | undefined): ProviderResolver {
  return (provider) => {
    const profile = section?.providers?.[provider]
    if (typeof profile !== 'object' || profile === null) return undefined
    const baseURL = typeof profile.baseURL === 'string' && profile.baseURL.length > 0
      ? profile.baseURL
      : undefined
    if (baseURL === undefined) return undefined

    const face = faceOf(profile)
    const routeDefaultMaxTokens = typeof profile.defaultMaxTokens === 'number' && profile.defaultMaxTokens > 0
      ? profile.defaultMaxTokens
      : undefined

    const models: Record<string, ModelCapability> = {}
    // Route-wide capability defaults, then per-model fields override them —
    // the same fallback chain llm-pi-ai resolves (`defaultInput`, route `compat`).
    const routeCompat = typeof profile.compat === 'object' && profile.compat !== null && !Array.isArray(profile.compat)
      ? profile.compat as Record<string, unknown>
      : {}
    const routeInput = Array.isArray(profile.defaultInput)
      ? (profile.defaultInput as unknown[]).filter((m): m is string => typeof m === 'string')
      : undefined
    if (Array.isArray(profile.models)) {
      for (const entry of profile.models) {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue
        const model = entry as Record<string, unknown>
        const id = typeof model['id'] === 'string' ? model['id'] : undefined
        if (id === undefined || id.length === 0) continue
        const compat = typeof model['compat'] === 'object' && model['compat'] !== null && !Array.isArray(model['compat'])
          ? model['compat'] as Record<string, unknown>
          : routeCompat
        const efforts = isEffortsTable(model['reasoningEfforts']) ? model['reasoningEfforts'] : {}
        // Modality fallback mirrors llm-pi-ai: entry `input` wins, then the
        // route's `defaultInput`, then text-only. A vision gateway that declares
        // `defaultInput: [text, image]` once must classify every model the same.
        const declared = Array.isArray(model['input'])
          ? (model['input'] as unknown[]).filter((m): m is string => typeof m === 'string')
          : routeInput
        const input = declared ?? ['text']
        // Output ceiling for faces with a required max_tokens (anthropic):
        // the model row's declaration, else the route's defaultMaxTokens.
        const maxTokens = typeof model['maxTokens'] === 'number' && model['maxTokens'] > 0
          ? model['maxTokens']
          : routeDefaultMaxTokens
        models[id] = {
          ...typeof compat['thinkingFormat'] === 'string' ? { thinkingFormat: compat['thinkingFormat'] } : {},
          // Only the explicit compat flag marks an effort-capable model. A bare
          // reasoningEfforts table (Qwen3.6-style: { off: null, high: 'high' })
          // is a toggle-only model — the wire takes enable_thinking, never
          // reasoning_effort. Mirror dsh-thinking-levels' piAiPosture exactly.
          supportsReasoningEffort: compat['supportsReasoningEffort'] === true,
          reasoningEfforts: efforts,
          input,
          ...(maxTokens !== undefined ? { maxTokens } : {}),
          vision: input.includes('image'),
        }
      }
    }

    return {
      baseURL,
      face,
      ...typeof profile.apiKeyEnv === 'string' && profile.apiKeyEnv.length > 0
        ? { apiKeyEnv: profile.apiKeyEnv }
        : {},
      models,
    }
  }
}
