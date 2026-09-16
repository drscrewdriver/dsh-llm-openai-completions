/**
 * dsh-llm-openai-completions — host plugin.
 *
 * Takes over streaming for selected custom-provider routes (vLLM / LM Studio /
 * self-hosted OpenAI proxies) through the official `llm/stream` waterfall:
 * the plugin registers a prepend listener that, for a configured provider,
 * yields its own openai-completions stream instead of calling `next()` (which
 * would reach the pi-ai adapter). No adapter object is mutated, so there is no
 * registration identity to get wrong.
 *
 * The adapter never guesses: `system` is always `role: "system"`, thinking is
 * driven by the model's `compat.thinkingFormat`, and the receive side splits
 * Qwen3-style `</think>` content. Configuration lives in the llm-pi-ai
 * section (baseURL / models / reasoningEfforts / compat).
 *
 * Disabling the plugin (or removing the provider from the list) falls through
 * to `next()` — the pi-ai adapter serves the route unchanged.
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Plugin settings. */
export interface Config {
    /** Master switch: when false the llm-pi-ai streams are restored. */
    enabled: boolean;
    /** Provider routes this adapter takes over, e.g. [local-35b]. */
    providers: string[];
}
/** Composition-entry schema (also the settings namespace schema). */
export declare const Config: z<Config>;
/** Settings namespace owned by this plugin. */
export declare const SETTINGS_NAMESPACE = "llm-openai-completions";
/**
 * Plugin body.
 * @param ctx - host context carrying llm / settings services.
 * @param config - composition entry.
 */
export declare function apply(ctx: Context, config: Config): void;
