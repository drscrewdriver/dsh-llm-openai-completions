/**
 * Cross-namespace reads over the settings service, version-conditional across
 * the 15-rc matrix.
 *
 * Two host generations, two read channels:
 * - 0.1.7+ (`SettingsForms`, registered as `settings`): `describe()` returns
 *   every active profile entry's live Config value keyed by entry id; values
 *   are schema-projected (only fields the owning plugin's Config declares
 *   survive) and each descriptor carries a `revision` write fence.
 * - ≤ 0.1.6 (imperative settings): `get(ns)` returns the section directly.
 *
 * `readSection` tries `describe()` first and falls back to `get(ns)` — the
 * `settings?.get?.()` soft reads this architecture once relied on were dead
 * on every 0.1.7+ host, which is why the fallback is shape-detected, not
 * version-guessed.
 * @module dsh-llm-openai-completions/settings-read
 */
import type { Context } from '@deepseek-ai/cordis';
/** Minimal 0.1.7+ settings face. */
export interface SettingsFormsLike {
    describe?: () => SettingsDescriptorLike[];
}
/** Minimal ≤ 0.1.6 settings face. */
export interface SettingsLegacyLike {
    get?: (ns: string) => unknown;
}
/** One active profile entry as `describe()` reports it (minimal face). */
export interface SettingsDescriptorLike {
    ns: string;
    value: unknown;
    revision: number;
}
/** One namespace's live section value with its write fence. */
export interface SectionReadout<T = unknown> {
    value: T;
    revision: number;
}
/**
 * Read one namespace's live section. `undefined` when the settings service is
 * absent or the namespace is not an active entry (owning plugin not
 * installed / not composed).
 */
export declare function readSection<T = unknown>(ctx: Context, ns: string): SectionReadout<T> | undefined;
/** Pick one namespace out of a `describe()` pass (undefined when absent). */
export declare function readSectionOf<T = unknown>(descriptors: SettingsDescriptorLike[] | undefined, ns: string): SectionReadout<T> | undefined;
