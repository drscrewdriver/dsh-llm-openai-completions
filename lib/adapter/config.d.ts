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
import type { FaceId } from './face.ts';
import type { PiAiSection } from './identify.ts';
/** The modalities a model's `input` declaration may name. */
export declare const INPUT_MODALITIES: readonly ["text", "image", "audio", "video", "pdf"];
/** One model's capability snapshot, resolved from the llm-pi-ai config. */
export interface ModelCapability {
    /** `compat.thinkingFormat` (qwen / qwen-chat-template / openai / …). */
    thinkingFormat?: string;
    /** `compat.supportsReasoningEffort` — the model takes reasoning_effort. */
    supportsReasoningEffort: boolean;
    /** The declared `reasoningEfforts` table (level → wire spelling). */
    reasoningEfforts: Record<string, unknown>;
    /** The declared `input` modalities (route `defaultInput` inherited, text floor). */
    input: string[];
    /** The declared per-model output ceiling (max_tokens on faces that require it). */
    maxTokens?: number;
    /** The model accepts image input (its `input` lists image). */
    vision: boolean;
}
/** One provider's resolved config for this transport. */
export interface ProviderInfo {
    /** The wire endpoint, e.g. http://host:port/v1. */
    baseURL: string;
    /** Credential env reference, when configured. */
    apiKeyEnv?: string;
    /** The wire face this route speaks (from its `api` declaration). */
    face: FaceId;
    /** Capabilities keyed by model id. */
    models: Record<string, ModelCapability>;
}
/** A live lookup that re-reads the llm-pi-ai section on every call. */
export interface ProviderResolver {
    (provider: string): ProviderInfo | undefined;
}
/**
 * Build a provider resolver over the live `llm-pi-ai` section.
 * @param section - the live llm-pi-ai section (undefined when not composed).
 * @returns a resolver returning the provider info when it is configured.
 */
export declare function providerResolverOf(section: PiAiSection | undefined): ProviderResolver;
