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
/** Whether a value looks like the declared reasoningEfforts table. */
function isEffortsTable(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/**
 * Build a provider resolver over the live `llm-pi-ai` settings section.
 * @param settings - the settings service (may be absent in odd environments).
 * @returns a resolver returning the provider info when it is configured.
 */
export function providerResolverOf(settings) {
    return (provider) => {
        const section = settings?.get?.('llm-pi-ai');
        const profile = section?.providers?.[provider];
        if (typeof profile !== 'object' || profile === null)
            return undefined;
        const baseURL = typeof profile.baseURL === 'string' && profile.baseURL.length > 0
            ? profile.baseURL
            : undefined;
        if (baseURL === undefined)
            return undefined;
        const models = {};
        // Route-wide capability defaults, then per-model fields override them —
        // the same fallback chain llm-pi-ai resolves (`defaultInput`, route `compat`).
        const routeCompat = typeof profile.compat === 'object' && profile.compat !== null && !Array.isArray(profile.compat)
            ? profile.compat
            : {};
        const routeInput = Array.isArray(profile.defaultInput)
            ? profile.defaultInput
            : undefined;
        if (Array.isArray(profile.models)) {
            for (const entry of profile.models) {
                if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
                    continue;
                const model = entry;
                const id = typeof model['id'] === 'string' ? model['id'] : undefined;
                if (id === undefined || id.length === 0)
                    continue;
                const compat = typeof model['compat'] === 'object' && model['compat'] !== null && !Array.isArray(model['compat'])
                    ? model['compat']
                    : routeCompat;
                const efforts = isEffortsTable(model['reasoningEfforts']) ? model['reasoningEfforts'] : {};
                // Modality fallback mirrors llm-pi-ai: entry `input` wins, then the
                // route's `defaultInput`, then text-only. A vision gateway that declares
                // `defaultInput: [text, image]` once must classify every model the same.
                const input = Array.isArray(model['input'])
                    ? model['input']
                    : routeInput;
                models[id] = {
                    ...typeof compat['thinkingFormat'] === 'string' ? { thinkingFormat: compat['thinkingFormat'] } : {},
                    // Only the explicit compat flag marks an effort-capable model. A bare
                    // reasoningEfforts table (Qwen3.6-style: { off: null, high: 'high' })
                    // is a toggle-only model — the wire takes enable_thinking, never
                    // reasoning_effort. Mirror dsh-thinking-levels' piAiPosture exactly.
                    supportsReasoningEffort: compat['supportsReasoningEffort'] === true,
                    reasoningEfforts: efforts,
                    vision: (input ?? ['text']).includes('image'),
                };
            }
        }
        return {
            baseURL,
            ...typeof profile.apiKeyEnv === 'string' && profile.apiKeyEnv.length > 0
                ? { apiKeyEnv: profile.apiKeyEnv }
                : {},
            models,
        };
    };
}
