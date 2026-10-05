/**
 * Cross-namespace reads over the DSH 0.1.7+ settings service.
 *
 * `SettingsForms` (the service registered as `settings`) has no `get(ns)`:
 * the read channel is `describe()`, which returns every active profile
 * entry's live Config value with its schema projection and revision. Values
 * are schema-projected by the host, so only fields the owning plugin's
 * Config schema declares survive the round trip — which is why this plugin's
 * data plane is read from the `llm-pi-ai` namespace (whose schema declares
 * everything this adapter consumes) rather than from free-form documents.
 * @module dsh-llm-openai-completions/settings-read
 */
import type { Context } from '@deepseek-ai/cordis'

/** Minimal face of the settings service this module reads. */
export interface SettingsServiceLike {
  describe?: () => SettingsDescriptorLike[]
}

/** One active profile entry as `describe()` reports it (minimal face). */
export interface SettingsDescriptorLike {
  ns: string
  value: unknown
  revision: number
}

/** One namespace's live section value with its write fence. */
export interface SectionReadout<T = unknown> {
  value: T
  revision: number
}

/** One `describe()` pass over the live settings, or `undefined` when the service is absent. */
export function describeSettings(ctx: Context): SettingsDescriptorLike[] | undefined {
  const settings = ctx.get('settings') as SettingsServiceLike | undefined
  return settings?.describe?.()
}

/**
 * Read one namespace's live section. `undefined` when the settings service is
 * absent or the namespace is not an active profile entry (owning plugin not
 * installed / not composed).
 */
export function readSection<T = unknown>(ctx: Context, ns: string): SectionReadout<T> | undefined {
  return readSectionOf<T>(describeSettings(ctx), ns)
}

/** Pick one namespace out of a `describe()` pass (undefined when absent). */
export function readSectionOf<T = unknown>(
  descriptors: SettingsDescriptorLike[] | undefined,
  ns: string,
): SectionReadout<T> | undefined {
  const found = descriptors?.find((descriptor) => descriptor.ns === ns)
  if (found === undefined) return undefined
  return { value: found.value as T, revision: found.revision }
}
