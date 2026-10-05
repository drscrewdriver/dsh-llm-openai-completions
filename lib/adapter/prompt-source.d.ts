/**
 * The prompt-source seam: consumers (a dsh-promptbook-class plugin) replace
 * the system prompt and tool descriptions this transport actually sends on
 * taken-over routes, keyed by provider/model.
 *
 * Contract (mirrors dsh-llm-mimo's llmMimo seam):
 * 1. Zero behavior change when no source is registered — plain passthrough.
 * 2. Text only: `resolve*` must never touch a tool's `name`/`parameters`
 *    (historical tool_use blocks are correlated by name).
 * 3. `resolve*` must be a deterministic pure function of (provider, model) —
 *    the system prompt and tools sit at the head of the request prefix, so
 *    byte-instability is a full prompt-cache miss on every turn. Dynamic
 *    fragments belong in a tail-append channel, not here.
 * 4. Scope guarantee: the source is consulted only inside this transport's
 *    dispatch (taken-over routes) — out-of-domain models are structurally
 *    unreachable.
 * 5. System prompt dual channel: loop requests carry the prompt as the
 *    leading `system` message (`options.system` undefined); one-shot calls
 *    carry it via `options.system`. The query input is the resolved channel
 *    text and the replacement is written back to the SAME channel.
 * @module dsh-llm-openai-completions/adapter/prompt-source
 */
import type { GenerateOptions } from '@deepseek-ai/dsh-llm';
/** A consumer-registered prompt source. */
export interface PromptSource {
    /** Replace the whole system prompt; return undefined to leave it unchanged. */
    resolveSystem(input: {
        provider: string;
        model: string;
        system: string;
    }): string | undefined;
    /** Replace one tool's description; return undefined to leave it unchanged. */
    resolveToolDescription(input: {
        provider: string;
        model: string;
        toolName: string;
        description: string;
    }): string | undefined;
}
/** The seam exposed to consumers as the `llmOpenaiCompletions` service. */
export interface PromptSourceFace {
    /** Register a prompt source; returns its disposer. One source at a time —
     * the most recent registration wins, mirroring the mimo seam. */
    registerPromptSource(source: PromptSource): () => void;
}
/** Registry holding the current source and applying it to requests. */
export declare class PromptSourceRegistry {
    private source;
    /** Register a prompt source; returns a disposer that unregisters it. */
    register(source: PromptSource): () => void;
    /** The current source, if any. */
    peek(): PromptSource | undefined;
    /** The leading system message of a message list, if one exists. */
    private static leadingSystem;
    /**
     * Apply the registered source to one request. Returns the given options
     * untouched when no source is registered (contract 1) or when nothing is
     * replaced. Never mutates the input options object.
     */
    apply(options: GenerateOptions, provider: string): GenerateOptions;
}
