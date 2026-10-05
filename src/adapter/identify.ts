/**
 * Takeover identification: which llm-pi-ai routes this transport should
 * short-circuit.
 *
 * The functions are the same-origin port of dsh-thinking-levels'
 * `takeover-sync.ts` identification (locked by that repo's unit tests, and by
 * `identify.spec.ts` here) so the transport's dispatch judgment and the
 * control layer's gating cannot drift apart.
 *
 * The judgment (single source of truth is this plugin's own settings section):
 *   takeover(route) = enabled && (manual providers ∪ auto-identified)
 * where auto-identified = custom openai-completions gateway AND thinking
 * declared (a reasoningEfforts table). The manual list covers routes outside
 * the auto criteria (e.g. a vision gateway without thinking); the global
 * `enabled` switch is the off button.
 * @module dsh-llm-openai-completions/adapter/identify
 */

/** The settings namespace holding the provider/model data plane. */
export const PI_AI_NAMESPACE = 'llm-pi-ai'

/** One model row of the llm-pi-ai section (minimal face). */
export interface PiAiModelRow {
  id?: unknown
  reasoningEfforts?: unknown
  compat?: unknown
}

/** One provider profile of the llm-pi-ai section (minimal face). */
export interface PiAiProviderProfile {
  api?: unknown
  baseURL?: unknown
  models?: unknown
  compat?: unknown
  /** Other profile fields (apiKeyEnv, displayName, modelOverrides, …). */
  [key: string]: unknown
}

/** The llm-pi-ai section slice this module reads. */
export interface PiAiSection {
  providers?: Record<string, PiAiProviderProfile>
}

/** Hosts that are NOT a custom gateway (official OpenAI-compatible endpoints). */
const OFFICIAL_HOST_RE = /(?:^|\.)(?:deepseek\.com|openai\.com|openrouter\.ai|anthropic\.com|googleapis\.com|ai\.google\.dev|mistral\.ai|x\.ai)$/i

/** Whether a value looks like a declared reasoningEfforts table. */
function isEffortsTable(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Whether a provider profile targets a CUSTOM openai-completions gateway:
 * explicit `api: openai-completions`, or a baseURL that is not an official
 * host. Catalog routes without either (e.g. xiaomi via pi-ai discovery) are
 * not custom and are left alone.
 */
export function isCustomOpenAiGateway(profile: PiAiProviderProfile | undefined): boolean {
  if (profile === undefined) return false
  if (profile.api === 'openai-completions') return true
  const baseURL = profile.baseURL
  if (typeof baseURL !== 'string' || baseURL.length === 0) return false
  try {
    return !OFFICIAL_HOST_RE.test(new URL(baseURL).hostname)
  } catch {
    return false
  }
}

/** The model rows a profile declares, from models[] then modelOverrides. */
function modelRows(profile: PiAiProviderProfile): PiAiModelRow[] {
  const rows: PiAiModelRow[] = []
  if (Array.isArray(profile.models)) {
    rows.push(...profile.models.filter((row): row is PiAiModelRow => typeof row === 'object' && row !== null))
  }
  if (typeof profile.modelOverrides === 'object' && profile.modelOverrides !== null && !Array.isArray(profile.modelOverrides)) {
    rows.push(...Object.values(profile.modelOverrides).filter((row): row is PiAiModelRow => typeof row === 'object' && row !== null))
  }
  return rows
}

/**
 * Whether a provider declares thinking: at least one model row carries a
 * reasoningEfforts table (thinking on). `false` (thinking off) and absent
 * both mean no thinking.
 */
export function declaresThinking(profile: PiAiProviderProfile | undefined): boolean {
  if (profile === undefined) return false
  return modelRows(profile).some((row) => isEffortsTable(row.reasoningEfforts))
}

/**
 * Identify the providers the transport auto-adopts: custom gateway AND
 * thinking declared. Order is stable (the section's own provider order).
 */
export function identifyTakeoverProviders(section: PiAiSection | undefined): string[] {
  const providers = section?.providers
  if (typeof providers !== 'object' || providers === null) return []
  return Object.entries(providers)
    .filter(([, profile]) => isCustomOpenAiGateway(profile) && declaresThinking(profile))
    .map(([id]) => id)
}

/**
 * The dispatch judgment over one request's provider route: pure manual
 * membership. The capability card's per-route takeover checkbox is the single
 * per-route truth — checked ⇔ route ∈ providers — so dispatch MUST use the
 * same set or the checkbox would lie. (The auto-identify functions remain
 * exported as pure utilities for hints/diagnostics; they no longer widen the
 * judgment.)
 * @param enabled - the live `enabled` switch.
 * @param manualProviders - the live manual `providers` list.
 * @returns the set of taken-over routes, or `null` when disabled.
 */
export function takeoverRouteSet(
  enabled: boolean,
  manualProviders: readonly string[],
): Set<string> | null {
  if (!enabled) return null
  return new Set(manualProviders)
}
