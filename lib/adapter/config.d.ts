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
    thinkingFormat?: string;
    /** `compat.supportsReasoningEffort` — the model takes reasoning_effort. */
    supportsReasoningEffort: boolean;
    /** The declared `reasoningEfforts` table (level → wire spelling). */
    reasoningEfforts: Record<string, unknown>;
    /** The model accepts image input (its `input` lists image). */
    vision: boolean;
}
/** One provider's resolved config for this adapter. */
export interface ProviderInfo {
    /** The wire endpoint, e.g. http://host:port/v1. */
    baseURL: string;
    /** Credential env reference, when configured. */
    apiKeyEnv?: string;
    /** Capabilities keyed by model id. */
    models: Record<string, ModelCapability>;
}
/** Minimal settings-service face (typed locally to avoid host value imports). */
interface SettingsRead {
    get?: (ns: string) => unknown;
}
/** A live lookup that re-reads the llm-pi-ai section on every call. */
export interface ProviderResolver {
    (provider: string): ProviderInfo | undefined;
}
/**
 * Build a provider resolver over the live `llm-pi-ai` settings section.
 * @param settings - the settings service (may be absent in odd environments).
 * @returns a resolver returning the provider info when it is configured.
 */
export declare function providerResolverOf(settings: SettingsRead | undefined): ProviderResolver;
export {};
