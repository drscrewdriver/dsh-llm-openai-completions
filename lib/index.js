import z from '@deepseek-ai/schemastery';
import { OpenAiCompletionsAdapter } from "./adapter/adapter.js";
import { providerResolverOf } from "./adapter/config.js";
/** Composition-entry schema (also the settings namespace schema). */
export const Config = z.object({
    enabled: z.boolean().default(false),
    providers: z.array(z.string()).default([]),
});
/** Settings namespace owned by this plugin. */
export const SETTINGS_NAMESPACE = 'llm-openai-completions';
/** Install a settings namespace through the cordis settings service. */
function installSettingsSection(ctx, ns, schema, entry, hooks) {
    ;
    ctx.inject(['settings'], (sctx) => {
        const scope = sctx.settings.register(ns, schema, { base: entry });
        hooks.setSource(() => scope.get());
        hooks.onChange();
        sctx.effect(() => () => {
            hooks.onChange();
        });
        scope.watch(() => hooks.onChange());
    });
}
/**
 * Plugin body.
 * @param ctx - host context carrying llm / settings services.
 * @param config - composition entry.
 */
export function apply(ctx, config) {
    // The settings service may not be resolvable via ctx.get at apply time
    // (it registers later); resolve it lazily on every lookup instead.
    const resolveSettings = () => ctx.get('settings');
    const adapter = new OpenAiCompletionsAdapter((provider) => providerResolverOf(resolveSettings())(provider), 
    // The attachment service may register after apply; resolve it lazily on
    // every stream (vision models only), never during apply.
    () => ctx.get('attachments'));
    // Runtime-adjustable configuration source: composition entry is the base,
    // the settings namespace layers on top.
    let current = () => config;
    installSettingsSection(ctx, SETTINGS_NAMESPACE, Config, config, {
        setSource: (source) => {
            current = source;
        },
        onChange: () => { },
    });
    // Take over the llm/stream waterfall for configured providers. prepend keeps
    // this listener OUTERMOST (runs last), so a takeover short-circuits pi-ai.
    const on = ctx.on;
    on('llm/stream', async function* (options, next) {
        const cfg = current();
        const takeOver = cfg.enabled && cfg.providers.includes(options.provider);
        // Debug-only: takeover decisions are observable through the settings
        // namespace; keep the wire details out of the default log.
        ctx.logger?.debug?.('[llm-openai-completions] stream provider=%s model=%s effort=%s enabled=%s providers=%j takeOver=%s', String(options.provider), String(options.model), String(options.reasoningEffort), cfg.enabled, cfg.providers, takeOver);
        if (takeOver) {
            yield* adapter.stream(options);
            return;
        }
        yield* next();
    }, { prepend: true });
}
