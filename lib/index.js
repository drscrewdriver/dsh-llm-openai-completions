import { isVolatile } from '@deepseek-ai/cosmokit';
import z from '@deepseek-ai/schemastery';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment';
import { LlmError } from '@deepseek-ai/dsh-llm';
import { OpenAiCompletionsAdapter } from "./adapter/adapter.js";
import { providerResolverOf } from "./adapter/config.js";
import { PI_AI_NAMESPACE, takeoverRouteSet } from "./adapter/identify.js";
import { PromptSourceRegistry } from "./adapter/prompt-source.js";
import { readSection } from "./settings-read.js";
import { buildVideoTool } from "./video-tool.js";
/** The settings namespace of the pi-ai data plane (re-exported for consumers). */
export { PI_AI_NAMESPACE };
/**
 * Composition-entry schema. Every field is `.volatile()`: DSH 0.1.7+ hands
 * `apply` live refs and generates the settings form from the schema alone,
 * so all knobs are runtime-editable without a remount.
 */
export const Config = z.object({
    enabled: z.boolean().default(false).volatile(),
    providers: z.array(z.string()).default([]).volatile(),
    modalFallback: z.union(['refuse', 'mask']).default('refuse').volatile(),
    extraInputs: z.dict(z.array(z.union(['video', 'audio', 'pdf']))).default({}).volatile(),
    videoTool: z.boolean().default(true).volatile(),
});
/** Settings defaults, kept in lockstep with the schema defaults above. */
export const DEFAULT_CONFIG = {
    enabled: false,
    providers: [],
    modalFallback: 'refuse',
    extraInputs: {},
    videoTool: true,
};
/** Settings namespace owned by this plugin. */
export const SETTINGS_NAMESPACE = 'llm-openai-completions';
/** Host services this plugin's dispatch path consumes (declarative inject). */
export const inject = ['credentials', 'attachments', 'tools'];
/** Read a `.volatile()` field: a live ref on DSH 0.1.7+, a plain value otherwise. */
function readLive(value, fallback) {
    if (isVolatile(value)) {
        const snapshot = value.get();
        return (snapshot === undefined ? fallback : snapshot);
    }
    return value ?? fallback;
}
/**
 * Legacy (≤ 0.1.6) settings face: install a registered section so the switch
 * and manual list are runtime-editable and the namespace is VISIBLE to other
 * plugins — dsh-thinking-levels reads `llm-openai-completions` through
 * `settings.get(ns)` on these hosts, which resolves only registered
 * namespaces. On 0.1.7+ the composition entry IS the section (declarative,
 * `describe()`-visible) and `settings.register` no longer exists, so the
 * install is a no-op there — the discriminator is the service's own shape
 * (`register` present, `describe` absent), never a version guess.
 */
let legacyRead;
function installLegacySection(ctx, config) {
    ;
    ctx.inject(['settings'], (sctx) => {
        const settings = sctx.settings;
        if (typeof settings?.register !== 'function' || typeof settings.describe === 'function')
            return;
        const scope = settings.register(SETTINGS_NAMESPACE, Config, { base: config });
        legacyRead = () => scope.get();
        sctx.effect(() => () => {
            legacyRead = undefined;
        });
        scope.watch?.(() => { });
    });
}
/**
 * Resolve the route's API key, version- and environment-conditional: the
 * credentials service first (the web Models page writes there), then the
 * launch environment (exists on every line), then the raw process
 * environment. All empty is a loud MISSING_CREDENTIAL — a keyless request
 * would only produce an opaque gateway 401.
 */
async function resolveApiKey(ctx, apiKeyEnv) {
    if (apiKeyEnv === undefined)
        return undefined;
    const credentials = ctx.get('credentials');
    let value;
    if (credentials?.resolve !== undefined) {
        const resolved = await credentials.resolve(credentialRef(apiKeyEnv));
        if (resolved !== undefined)
            value = resolved.value;
    }
    if (value === undefined || value.length === 0) {
        const ambient = launchEnvironmentOf(ctx).get(apiKeyEnv);
        if (ambient !== undefined && ambient.value.length > 0)
            value = ambient.value;
    }
    if (value === undefined || value.length === 0)
        value = process.env[apiKeyEnv];
    if (value === undefined || value.length === 0) {
        throw new LlmError(`llm-openai-completions: no credential for the route's "${apiKeyEnv}" reference — store it through the credentials service (the web Models page writes it) or export it in the launching environment`, 'MISSING_CREDENTIAL');
    }
    return value;
}
/**
 * Plugin body.
 * @param ctx - host context carrying llm / settings / credentials services.
 * @param config - composition entry (volatile fields arrive as live refs).
 */
export function apply(ctx, config = DEFAULT_CONFIG) {
    installLegacySection(ctx, config);
    const current = () => {
        const base = legacyRead?.() ?? config;
        return {
            enabled: readLive(base.enabled, false),
            providers: readLive(base.providers, []),
            modalFallback: readLive(base.modalFallback, 'refuse'),
            extraInputs: readLive(base.extraInputs, {}),
            videoTool: readLive(base.videoTool, true),
        };
    };
    const promptSources = new PromptSourceRegistry();
    const adapter = new OpenAiCompletionsAdapter(
    // Live data-plane lookup: the llm-pi-ai section as describe() reports it
    // (undefined when pi-ai is not composed — takeover then resolves nothing).
    (provider) => providerResolverOf(readSection(ctx, PI_AI_NAMESPACE)?.value)(provider), 
    // The attachment service may register after apply; resolve it lazily on
    // every stream (media-bearing requests only), never during apply.
    () => ctx.get('attachments'), (options, apiKeyEnv) => resolveApiKey(ctx, apiKeyEnv), promptSources, 
    // Live policy knobs (mask fallback + extra modalities), re-read per stream.
    () => {
        const cfg = current();
        return { modalFallback: cfg.modalFallback, extraInputs: cfg.extraInputs };
    });
    // The read_video tool: registers unconditionally (tool visibility is
    // session-global), while the `videoTool` setting gates each execution —
    // a settings edit applies without a remount.
    const tools = ctx.get('tools');
    if (typeof tools?.register === 'function') {
        tools.register(buildVideoTool(() => ctx.get('attachments'), () => ({ videoTool: current().videoTool })));
    }
    else {
        ctx.logger?.debug?.('[llm-openai-completions] no tools service mounted; read_video not registered');
    }
    // Take over the llm/stream waterfall for taken-over routes. prepend keeps
    // this listener OUTERMOST (runs last), so a takeover short-circuits pi-ai;
    // global crosses the fiber boundary — LlmRuntime originates the waterfall
    // from its own fiber, which a fiber-local listener never sees.
    const on = ctx.on;
    on('llm/stream', async function* (options, next) {
        const cfg = current();
        const routes = takeoverRouteSet(cfg.enabled, cfg.providers);
        const takeOver = routes !== null && routes.has(String(options.provider));
        ctx.logger?.debug?.('[llm-openai-completions] stream provider=%s model=%s effort=%s enabled=%s routes=%j takeOver=%s', String(options.provider), String(options.model), String(options.reasoningEffort), cfg.enabled, routes !== null ? [...routes] : [], takeOver);
        if (takeOver) {
            yield* adapter.stream(options);
            return;
        }
        yield* next();
    }, { prepend: true, global: true });
    // The prompt-source seam: dsh-promptbook-class consumers register a source
    // and it applies to every taken-over dispatch (see AGENTS.md for the
    // contract). Zero behavior when no source is registered.
    const face = {
        registerPromptSource: (source) => promptSources.register(source),
    };
    ctx.provide('llmOpenaiCompletions', {
        ...face,
        // Hosted surface = the models of the currently taken-over routes, from
        // the live llm-pi-ai section. Empty while the switch is off — honest by
        // construction, since dispatch only rewrites prompts on taken-over routes.
        listHostedModels() {
            const cfg = current();
            const routes = takeoverRouteSet(cfg.enabled, cfg.providers);
            if (routes === null)
                return [];
            const piAi = readSection(ctx, PI_AI_NAMESPACE)?.value;
            const hosted = [];
            for (const [provider, profile] of Object.entries(piAi?.providers ?? {})) {
                if (!routes.has(provider) || !Array.isArray(profile.models))
                    continue;
                for (const model of profile.models) {
                    const id = typeof model['id'] === 'string' ? model['id'] : undefined;
                    if (id === undefined)
                        continue;
                    hosted.push({
                        provider,
                        id,
                        ...typeof model['name'] === 'string' ? { name: model['name'] } : {},
                    });
                }
            }
            return hosted;
        },
    });
    ctx.logger?.info?.('[llm-openai-completions] short-circuit listener registered (prepend+global); switch is %s', String(current().enabled));
}
