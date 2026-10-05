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
import { LlmError, attributionHeaders } from '@deepseek-ai/dsh-llm';
import { serializeRequest, enforceModalities, mediaTypeFromName } from "./serialize.js";
import { serializeAnthropic, translateAnthropic } from "./anthropic.js";
import { serializeResponses, translateResponses } from "./responses.js";
import { rootFor } from "./face.js";
import { parseSse } from "./sse.js";
import { translate } from "./translate.js";
/** Map an HTTP status to the harness failure code vocabulary. */
function httpErrorCode(status) {
    if (status === 401 || status === 403)
        return 'AUTH';
    if (status === 429)
        return 'RATE_LIMIT';
    if (status >= 500)
        return 'SERVER';
    if (status === 400)
        return 'INVALID_REQUEST';
    return 'TRANSPORT';
}
/** The capability used when the model id is not declared: no thinking, text-only. */
const UNKNOWN_CAPABILITY = { supportsReasoningEffort: false, reasoningEfforts: {}, input: ['text'], vision: false };
/** Upper bound for one inlined video (official-doc规模: 20 MB). */
const MAX_INLINE_VIDEO_BYTES = 20 * 1024 * 1024;
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
export class OpenAiCompletionsAdapter {
    resolveProvider;
    resolveAttachments;
    resolveApiKey;
    promptSources;
    constructor(resolveProvider, resolveAttachments, resolveApiKey, promptSources) {
        this.resolveProvider = resolveProvider;
        this.resolveAttachments = resolveAttachments;
        this.resolveApiKey = resolveApiKey;
        this.promptSources = promptSources;
    }
    /**
     * Collect the bytes of every media block in the request into a map keyed by
     * attachment id: images through `readImage`, files through
     * `readFileStream` (verbatim chunked reads concatenated).
     */
    async collectMedia(options) {
        const media = new Map();
        const store = this.resolveAttachments();
        const needsMedia = options.messages.some((message) => (message.content ?? []).some((block) => block.type === 'image' || block.type === 'file'));
        if (!needsMedia)
            return media;
        if (store === undefined) {
            throw new LlmError(`provider "${String(options.provider)}" has no attachment store to resolve media content.`, 'UNSUPPORTED_CONTENT');
        }
        for (const message of options.messages) {
            for (const block of message.content ?? []) {
                if (block.type === 'image') {
                    const id = block.attachment.attachmentId;
                    if (media.has(id))
                        continue;
                    const { data } = await store.readImage(block.attachment, options.signal);
                    media.set(id, { mediaType: block.attachment.mediaType, data });
                }
                else if (block.type === 'file') {
                    const ref = block.attachment;
                    const id = typeof ref.attachmentId === 'string' ? ref.attachmentId : undefined;
                    if (id === undefined || media.has(id))
                        continue;
                    const mediaType = mediaTypeFromName(ref.name);
                    if (mediaType === undefined)
                        continue; // not an inlinable media type
                    if (store.readFileStream === undefined) {
                        throw new LlmError('the mounted attachment provider cannot read verbatim files, so this media attachment cannot be sent', 'UNSUPPORTED_CONTENT');
                    }
                    const chunks = [];
                    let bytes = 0;
                    for await (const chunk of store.readFileStream(block.attachment, options.signal)) {
                        bytes += chunk.byteLength;
                        if (mediaType.startsWith('video/') && bytes > MAX_INLINE_VIDEO_BYTES) {
                            throw new LlmError(`video "${String(ref.name ?? 'attachment')}" exceeds the ${MAX_INLINE_VIDEO_BYTES / (1024 * 1024)} MB inline limit`, 'INVALID_REQUEST');
                        }
                        chunks.push(chunk);
                    }
                    media.set(id, { mediaType, data: Buffer.concat(chunks.map((c) => Buffer.from(c))) });
                }
            }
        }
        return media;
    }
    /**
     * Stream one model call: gate → prompt source → collect → serialize →
     * fetch → SSE → translate.
     * @param options - the fully-assembled harness request.
     * @returns the chunk stream (text / reasoning / tool-call / usage / finish).
     */
    async *stream(input) {
        const provider = this.resolveProvider(input.provider);
        if (provider === undefined) {
            throw new LlmError(`provider "${input.provider}" is not configured for the openai-completions adapter`, 'NO_ADAPTER');
        }
        const capability = provider.models[input.model] ?? UNKNOWN_CAPABILITY;
        // Modality gate first: an undeclared attachment is refused before any
        // bytes are read or anything is sent (silent loss becomes a loud refusal).
        enforceModalities(input, capability, provider.face);
        // Prompt source seam: consumers rewrite the system prompt / tool
        // descriptions for taken-over dispatches only (scope guarantee).
        const options = this.promptSources.apply(input, String(input.provider));
        const media = await this.collectMedia(options);
        // Vision models keep the lazy image-source path for any image the
        // pre-collection did not cover; non-vision models reject images loudly.
        const image = capability.vision
            ? {
                readImage: async (ref) => {
                    const store = this.resolveAttachments();
                    if (store === undefined) {
                        throw new LlmError(`provider "${String(options.provider)}" has no attachment store to resolve image content.`, 'UNSUPPORTED_CONTENT');
                    }
                    const { data } = await store.readImage(ref, options.signal);
                    return { mediaType: ref.mediaType, base64: Buffer.from(data).toString('base64') };
                },
            }
            : undefined;
        const apiKey = await this.resolveApiKey(options, provider.apiKeyEnv);
        const baseHeaders = {
            'content-type': 'application/json',
            'accept': 'text/event-stream',
            ...attributionHeaders(),
        };
        const face = provider.face;
        // Per-face endpoint, auth headers, body, and SSE dialect.
        const endpoint = face === 'anthropic-messages'
            ? `${rootFor(provider.baseURL, face)}/messages`
            : face === 'openai-responses'
                ? `${rootFor(provider.baseURL, face)}/responses`
                : `${provider.baseURL}/chat/completions`;
        const headers = face === 'anthropic-messages'
            ? {
                ...baseHeaders,
                ...(apiKey === undefined ? {} : { 'x-api-key': apiKey }),
                'anthropic-version': '2023-06-01',
            }
            : {
                ...baseHeaders,
                ...(apiKey === undefined ? {} : { authorization: `Bearer ${apiKey}` }),
            };
        const body = face === 'anthropic-messages'
            ? serializeAnthropic(options, capability, media)
            : face === 'openai-responses'
                ? serializeResponses(options, capability, media)
                : await serializeRequest(options, capability, image, media);
        let response;
        try {
            response = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: options.signal,
            });
        }
        catch (error) {
            // The caller distinguishes cancellation (signal.aborted) from transport
            // failure; chaining the cause keeps the full diagnosis at every boundary.
            throw new LlmError(`${face} request to ${provider.baseURL} failed`, 'TRANSPORT', { cause: error });
        }
        if (!response.ok) {
            let message = `${face} error (HTTP ${response.status})`;
            try {
                const parsed = await response.json();
                if (parsed.error?.message !== undefined)
                    message = parsed.error.message;
            }
            catch {
                // Only swallow error-body parsing: the HTTP status still identifies the
                // failure, so malformed gateway JSON must not mask it.
            }
            throw new LlmError(message, httpErrorCode(response.status), { status: response.status });
        }
        if (response.body === null) {
            throw new LlmError(`${face} returned no response body`, 'EMPTY_RESPONSE');
        }
        if (face === 'anthropic-messages') {
            yield* translateAnthropic(parseSse(response.body));
            return;
        }
        if (face === 'openai-responses') {
            yield* translateResponses(parseSse(response.body));
            return;
        }
        yield* translate(parseSse(response.body));
    }
}
