/**
 * dsh-llm-openai-completions — host plugin.
 *
 * Takes over streaming for selected custom-provider routes (vLLM / LM Studio /
 * self-hosted OpenAI proxies) through the official `llm/stream` waterfall:
 * the plugin registers a prepend+global listener that, for a taken-over
 * provider, yields its own openai-completions stream instead of calling
 * `next()` (which would reach the pi-ai adapter). No adapter object is
 * registered or mutated, so there is no registration identity to unwind —
 * disabling the switch (or unmounting the plugin) falls through to `next()`
 * and pi-ai serves the route unchanged.
 *
 * Takeover judgment (single source of truth, this plugin's own settings
 * section): `enabled && providers.includes(route)` — pure manual membership.
 * The capability card's per-route takeover checkbox writes exactly this list,
 * so the checkbox, the dispatch, and dsh-thinking-levels' gating all read one
 * truth. The data plane stays in llm-pi-ai, read through `describe()` per
 * request.
 *
 * The adapter never guesses: `system` is always `role: "system"`, thinking is
 * driven by the model's `compat.thinkingFormat`, the receive side splits
 * Qwen3-style `</think>` content, undeclared modalities are refused before
 * send, and a registered prompt source can rewrite the system prompt and tool
 * descriptions (the `llmOpenaiCompletions` service — dsh-promptbook-class
 * consumers, see AGENTS.md).
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Volatile } from '@deepseek-ai/cosmokit';
import z from '@deepseek-ai/schemastery';
import { PI_AI_NAMESPACE } from './adapter/identify.ts';
export { type PromptSource, type PromptSourceFace } from './adapter/prompt-source.ts';
/** The settings namespace of the pi-ai data plane (re-exported for consumers). */
export { PI_AI_NAMESPACE };
/** Plugin settings. */
export interface Config {
    /** Master switch: when false every llm-pi-ai stream passes through. */
    enabled: boolean | Volatile<boolean>;
    /** Manual takeover list (route ids), on top of the auto-identified set. */
    providers: string[] | Volatile<string[]>;
}
/**
 * Composition-entry schema. Both fields are `.volatile()`: DSH 0.1.7+ hands
 * `apply` live refs and generates the settings form from the schema alone,
 * so the switch and the manual list are runtime-editable without a remount.
 */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    enabled: z<boolean, boolean, "volatile-defined">;
    providers: z<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    enabled: z<boolean, boolean, "volatile-defined">;
    providers: z<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
}>>, "plain">;
/** Settings defaults, kept in lockstep with the schema defaults above. */
export declare const DEFAULT_CONFIG: Config;
/** Settings namespace owned by this plugin. */
export declare const SETTINGS_NAMESPACE = "llm-openai-completions";
/** Host services this plugin's dispatch path consumes (declarative inject). */
export declare const inject: string[];
/**
 * Plugin body.
 * @param ctx - host context carrying llm / settings / credentials services.
 * @param config - composition entry (volatile fields arrive as live refs).
 */
export declare function apply(ctx: Context, config?: Config): void;
