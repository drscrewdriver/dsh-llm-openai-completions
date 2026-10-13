/**
 * The openai-completions-compatible transport: streams one model call against
 * a custom OpenAI-compatible gateway with behavior that never guesses.
 *
 * `system` is always `role: "system"` (a custom gateway must never receive
 * `developer`), thinking is serialized from the model's capability
 * (`enable_thinking` / `chat_template_kwargs` / `reasoning_effort`), and the
 * receive side splits Qwen3-style `</think>` content — independently of pi-ai.
 *
 * Multimodal true-send: media bytes (image / audio / video / PDF) are
 * collected from the attachment service BEFORE serialization, the modality
 * gate refuses undeclared modalities before anything is sent, and the
 * registered prompt source (if any) rewrites the system prompt and tool
 * descriptions on the way through.
 * @module dsh-llm-openai-completions/adapter
 */
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { ProviderResolver } from './config.ts';
import type { PromptSourceRegistry } from './prompt-source.ts';
/**
 * Live policy knobs resolved per stream (volatile settings): the emergency
 * modality fallback and extra input modalities merged into the model's
 * declared `input` (the host pi-ai schema caps `input` at text|image, so
 * video/audio declarations live here, keyed by 'provider/model' or 'provider').
 */
export interface AdapterPolicy {
    modalFallback: 'refuse' | 'mask';
    extraInputs: Record<string, string[]>;
}
/** Minimal attachment-store face for resolving durable media bytes at runtime. */
export interface AttachmentStoreLike {
    readImage(ref: unknown, signal?: AbortSignal): Promise<{
        data: Uint8Array;
    }>;
    readFileStream?(ref: unknown, signal?: AbortSignal): AsyncIterable<Uint8Array>;
}
/**
 * Transport for custom openai-completions gateways. It is NOT registered with
 * the llm service — the short-circuit listener in the host plugin calls
 * `stream` directly for taken-over routes, so unmounting the plugin falls
 * back to pi-ai with no registration identity to unwind.
 * @param resolveProvider - live provider lookup (from the llm-pi-ai section).
 * @param resolveAttachments - lazy attachment-store lookup (for media);
 *   may resolve to undefined when the host lacks an attachment service.
 * @param resolveApiKey - live credential resolution for the route's
 *   `apiKeyEnv` reference (credentials service, launch environment fallback).
 * @param promptSources - the prompt-source registry applied to every
 *   taken-over dispatch (zero behavior when empty).
 */
export declare class OpenAiCompletionsAdapter {
    private readonly resolveProvider;
    private readonly resolveAttachments;
    private readonly resolveApiKey;
    private readonly promptSources;
    private readonly resolvePolicy;
    constructor(resolveProvider: ProviderResolver, resolveAttachments: () => AttachmentStoreLike | undefined, resolveApiKey: (options: GenerateOptions, apiKeyEnv: string | undefined) => Promise<string | undefined>, promptSources: PromptSourceRegistry, resolvePolicy?: () => AdapterPolicy);
    /**
     * Collect the bytes of every media block in the request into a map keyed by
     * attachment id: images through `readImage`, files through
     * `readFileStream` (verbatim chunked reads concatenated).
     */
    private collectMedia;
    /**
     * Stream one model call: gate → prompt source → collect → serialize →
     * fetch → SSE → translate.
     * @param options - the fully-assembled harness request.
     * @returns the chunk stream (text / reasoning / tool-call / usage / finish).
     */
    stream(input: GenerateOptions): AsyncIterable<StreamChunk>;
}
