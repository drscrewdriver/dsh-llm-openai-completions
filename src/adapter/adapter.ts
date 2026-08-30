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

import { attributionHeaders, LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { serializeRequest } from './serialize.ts'
import type { ImageSource } from './serialize.ts'
import { parseSse } from './sse.ts'
import { translate } from './translate.ts'
import type { ProviderResolver } from './config.ts'

/** Map an HTTP status to the harness failure code vocabulary. */
function httpErrorCode(status: number): string {
  if (status === 401 || status === 403) return 'AUTH'
  if (status === 429) return 'RATE_LIMIT'
  if (status >= 500) return 'SERVER'
  if (status === 400) return 'INVALID_REQUEST'
  return 'TRANSPORT'
}

/** The capability used when the model id is not declared: no thinking. */
const UNKNOWN_CAPABILITY = { supportsReasoningEffort: false, reasoningEfforts: {}, vision: false } as const

/** Minimal attachment-store face for resolving durable image bytes at runtime. */
export interface AttachmentStoreLike {
  readImage(ref: unknown, signal?: AbortSignal): Promise<{ data: Uint8Array }>
}

/**
 * Adapter for custom openai-completions gateways.
 * @param resolveProvider - live provider lookup (from the llm-pi-ai section).
 * @param resolveAttachments - lazy attachment-store lookup (for vision models);
 *   may resolve to undefined when the host lacks an attachment service.
 */
export class OpenAiCompletionsAdapter extends LlmAdapter {
  constructor(
    private readonly resolveProvider: ProviderResolver,
    private readonly resolveAttachments: () => AttachmentStoreLike | undefined,
  ) {
    super()
  }

  /**
   * Stream one model call: serialize → fetch → SSE → translate.
   * @param options - the fully-assembled harness request.
   * @returns the chunk stream (text / reasoning / tool-call / usage / finish).
   */
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const provider = this.resolveProvider(options.provider)
    if (provider === undefined) {
      throw new LlmError(
        `provider "${options.provider}" is not configured for the openai-completions adapter`,
        'NO_ADAPTER',
      )
    }
    const capability = provider.models[options.model] ?? UNKNOWN_CAPABILITY
    // Vision models resolve image bytes through the injected attachment store;
    // non-vision models get no image source and keep rejecting images loudly.
    const image: ImageSource | undefined = capability.vision
      ? {
          readImage: async (ref) => {
            const store = this.resolveAttachments()
            if (store === undefined) {
              throw new LlmError(
                `provider "${options.provider}" has no attachment store to resolve image content.`,
                'UNSUPPORTED_CONTENT',
              )
            }
            const { data } = await store.readImage(ref, options.signal)
            return { mediaType: ref.mediaType, base64: Buffer.from(data).toString('base64') }
          },
        }
      : undefined
    const body = await serializeRequest(options, capability, image)
    const apiKey = provider.apiKeyEnv !== undefined ? process.env[provider.apiKeyEnv] : undefined
    const headers = {
      ...apiKey === undefined ? {} : { authorization: `Bearer ${apiKey}` },
      'content-type': 'application/json',
      'accept': 'text/event-stream',
      ...attributionHeaders(),
    }

    let response: Response
    try {
      response = await fetch(`${provider.baseURL}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: options.signal,
      })
    } catch (error) {
      // The caller distinguishes cancellation (signal.aborted) from transport
      // failure; chaining the cause keeps the full diagnosis at every boundary.
      throw new LlmError(
        `openai-completions request to ${provider.baseURL} failed`,
        'TRANSPORT',
        { cause: error },
      )
    }

    if (!response.ok) {
      let message = `openai-completions error (HTTP ${response.status})`
      try {
        const parsed = await response.json() as { error?: { message?: string } }
        if (parsed.error?.message !== undefined) message = parsed.error.message
      } catch {
        // Only swallow error-body parsing: the HTTP status still identifies the
        // failure, so malformed gateway JSON must not mask it.
      }
      throw new LlmError(message, httpErrorCode(response.status), { status: response.status })
    }
    if (response.body === null) {
      throw new LlmError('openai-completions returned no response body', 'EMPTY_RESPONSE')
    }

    yield* translate(parseSse(response.body))
  }
}
