/**
 * The openai-completions-compatible adapter: streams one model call against a
 * custom OpenAI-compatible gateway with behavior that never guesses.
 *
 * `system` is always `role: "system"` (a custom gateway must never receive
 * `developer`), thinking is serialized from the model's capability
 * (`enable_thinking` / `chat_template_kwargs` / `reasoning_effort`), and the
 * receive side splits Qwen3-style `</think>` content — independently of pi-ai.
 * @module dsh-llm-openai-completions/adapter
 */
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { ProviderResolver } from './config.ts';
/** Minimal attachment-store face for resolving durable image bytes at runtime. */
export interface AttachmentStoreLike {
    readImage(ref: unknown, signal?: AbortSignal): Promise<{
        data: Uint8Array;
    }>;
}
/**
 * Adapter for custom openai-completions gateways.
 * @param resolveProvider - live provider lookup (from the llm-pi-ai section).
 * @param resolveAttachments - lazy attachment-store lookup (for vision models);
 *   may resolve to undefined when the host lacks an attachment service.
 */
export declare class OpenAiCompletionsAdapter extends LlmAdapter {
    private readonly resolveProvider;
    private readonly resolveAttachments;
    constructor(resolveProvider: ProviderResolver, resolveAttachments: () => AttachmentStoreLike | undefined);
    /**
     * Stream one model call: serialize → fetch → SSE → translate.
     * @param options - the fully-assembled harness request.
     * @returns the chunk stream (text / reasoning / tool-call / usage / finish).
     */
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
