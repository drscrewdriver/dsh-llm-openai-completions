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
export declare const PI_AI_NAMESPACE = "llm-pi-ai";
/** One model row of the llm-pi-ai section (minimal face). */
export interface PiAiModelRow {
    id?: unknown;
    reasoningEfforts?: unknown;
    compat?: unknown;
}
/** One provider profile of the llm-pi-ai section (minimal face). */
export interface PiAiProviderProfile {
    api?: unknown;
    baseURL?: unknown;
    models?: unknown;
    compat?: unknown;
    /** Other profile fields (apiKeyEnv, displayName, modelOverrides, …). */
    [key: string]: unknown;
}
/** The llm-pi-ai section slice this module reads. */
export interface PiAiSection {
    providers?: Record<string, PiAiProviderProfile>;
}
/**
 * Whether a provider profile targets a CUSTOM openai-completions gateway:
 * explicit `api: openai-completions`, or a baseURL that is not an official
 * host. Catalog routes without either (e.g. xiaomi via pi-ai discovery) are
 * not custom and are left alone.
 */
export declare function isCustomOpenAiGateway(profile: PiAiProviderProfile | undefined): boolean;
/**
 * Whether a provider declares thinking: at least one model row carries a
 * reasoningEfforts table (thinking on). `false` (thinking off) and absent
 * both mean no thinking.
 */
export declare function declaresThinking(profile: PiAiProviderProfile | undefined): boolean;
/**
 * Identify the providers the transport auto-adopts: custom gateway AND
 * thinking declared. Order is stable (the section's own provider order).
 */
export declare function identifyTakeoverProviders(section: PiAiSection | undefined): string[];
/**
 * The dispatch judgment over one request's provider route. `enabled === false`
 * takes over nothing; otherwise the union of the section's manual `providers`
 * list and the auto-identified routes decides.
 * @param enabled - the live `enabled` switch.
 * @param manualProviders - the live manual `providers` list.
 * @param piAi - the live llm-pi-ai section.
 * @returns the set of taken-over routes, or `null` when disabled.
 */
export declare function takeoverRouteSet(enabled: boolean, manualProviders: readonly string[], piAi: PiAiSection | undefined): Set<string> | null;
