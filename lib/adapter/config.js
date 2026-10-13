import { faceOf } from "./face.js";
/** The modalities a model's `input` declaration may name. */
export const INPUT_MODALITIES = ['text', 'image', 'audio', 'video', 'pdf'];
/** Whether a value looks like the declared reasoningEfforts table. */
function isEffortsTable(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/**
 * Build a provider resolver over the live `llm-pi-ai` section.
 * @param section - the live llm-pi-ai section (undefined when not composed).
 * @returns a resolver returning the provider info when it is configured.
 */
export function providerResolverOf(section) {
    return (provider) => {
        const profile = section?.providers?.[provider];
        if (typeof profile !== 'object' || profile === null)
            return undefined;
        const baseURL = typeof profile.baseURL === 'string' && profile.baseURL.length > 0
            ? profile.baseURL
            : undefined;
        if (baseURL === undefined)
            return undefined;
        const face = faceOf(profile);
        const routeDefaultMaxTokens = typeof profile.defaultMaxTokens === 'number' && profile.defaultMaxTokens > 0
            ? profile.defaultMaxTokens
            : undefined;
        const models = {};
        // Route-wide capability defaults, then per-model fields override them —
        // the same fallback chain llm-pi-ai resolves (`defaultInput`, route `compat`).
        const routeCompat = typeof profile.compat === 'object' && profile.compat !== null && !Array.isArray(profile.compat)
            ? profile.compat
            : {};
        const routeInput = Array.isArray(profile.defaultInput)
            ? profile.defaultInput.filter((m) => typeof m === 'string')
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
                const declared = Array.isArray(model['input'])
                    ? model['input'].filter((m) => typeof m === 'string')
                    : routeInput;
                const input = declared ?? ['text'];
                // Output ceiling for faces with a required max_tokens (anthropic):
                // the model row's declaration, else the route's defaultMaxTokens.
                const maxTokens = typeof model['maxTokens'] === 'number' && model['maxTokens'] > 0
                    ? model['maxTokens']
                    : routeDefaultMaxTokens;
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
                };
            }
        }
        return {
            baseURL,
            face,
            ...typeof profile.apiKeyEnv === 'string' && profile.apiKeyEnv.length > 0
                ? { apiKeyEnv: profile.apiKeyEnv }
                : {},
            models,
        };
    };
}
