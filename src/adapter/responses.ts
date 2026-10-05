/**
 * The openai-responses face: serialize harness messages into an OpenAI
 * Responses body and translate its SSE event stream into harness chunks.
 *
 * Wire (spec-based — no reference adapter exists; probe calibration pending):
 * `system` becomes the top-level `instructions` parameter — the leading
 * system message (or `options.system` on one-shots) is extracted, merged,
 * and STRIPPED from `input[]`; `max_output_tokens` follows the same
 * every-request-first chain as the chat face; reasoning effort maps
 * honestly (minimal/low/medium pass through, high/xhigh/max → high,
 * `on`/`off`/absent omit the field); tools are flat function definitions;
 * assistant tool-call history becomes `function_call` items and tool
 * results become `function_call_output` items. `options.stop` has no
 * Responses spelling and is dropped (documented boundary).
 *
 * Input items are stateless (no previous_response_id) — every request
 * carries the full history, like the chat face.
 * @module dsh-llm-openai-completions/adapter/responses
 */
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { MediaMap, WireableBlock, WireableMessage } from './serialize.ts'
import { base64Of } from './serialize.ts'
import { ToolCallId } from './tool-call-id.ts'
import type { ModelCapability } from './config.ts'

/** One input item (the subset this face emits). */
type InputItem =
  | { type: 'message'; role: 'user' | 'assistant'; content: Array<Record<string, unknown>> }
  | { type: 'function_call'; call_id: string; name: string; arguments: string }
  | { type: 'function_call_output'; call_id: string; output: string }

/** The serialized openai-responses request body. */
export interface ResponsesRequest {
  model: string
  stream: true
  instructions?: string
  input: InputItem[]
  max_output_tokens?: number
  reasoning?: { effort: 'minimal' | 'low' | 'medium' | 'high' }
  temperature?: number
  tools?: Array<{ type: 'function'; name: string; description: string; parameters: unknown; strict: boolean }>
}

/** The leading system message of a message list, if one exists. */
function leadingSystem(messages: readonly WireableMessage[]): WireableMessage | undefined {
  return messages.find((message) => message.role === 'system')
}

/** Flatten one message's text blocks. */
function textOf(blocks: readonly WireableBlock[] | undefined): string {
  return (blocks ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('')
}

/** System text: explicit channel, else the leading system message. */
function systemText(options: GenerateOptions, messages: readonly WireableMessage[]): string | undefined {
  const explicit = typeof options.system === 'string' ? options.system : undefined
  if (explicit !== undefined) return explicit.length > 0 ? explicit : undefined
  const leading = leadingSystem(messages)
  const joined = leading === undefined ? '' : textOf(leading.content)
  return joined.length > 0 ? joined : undefined
}

/** Map a harness effort tier onto the Responses vocabulary (omit on/off). */
export function effortFor(effort: unknown): 'minimal' | 'low' | 'medium' | 'high' | undefined {
  if (effort === 'minimal' || effort === 'low' || effort === 'medium' || effort === 'high') return effort
  if (effort === 'xhigh' || effort === 'max') return 'high'
  return undefined
}

/** One user-side content part (media must already be collected). */
function userPart(block: WireableBlock, media: MediaMap): Record<string, unknown> {
  if (block.type === 'text') return { type: 'input_text', text: block.text ?? '' }
  if (block.type === 'image') {
    const blob = media.get(String((block.attachment ?? {}).attachmentId ?? ''))
    if (blob === undefined) {
      throw new LlmError('openai-responses face is missing image bytes for the request', 'INVALID_REQUEST')
    }
    return { type: 'input_image', image_url: `data:${blob.mediaType};base64,${base64Of(blob)}` }
  }
  if (block.type === 'file') {
    const attachment = block.attachment ?? {}
    const blob = media.get(String(attachment.attachmentId ?? ''))
    if (blob === undefined) {
      throw new LlmError(`openai-responses face is missing bytes for file "${String(attachment.name ?? 'attachment')}"`, 'INVALID_REQUEST')
    }
    if (blob.mediaType === 'application/pdf') {
      return { type: 'input_file', filename: String(attachment.name ?? 'document.pdf'), file_data: `data:application/pdf;base64,${base64Of(blob)}` }
    }
    throw new LlmError(`openai-responses face cannot inline file "${String(attachment.name ?? 'attachment')}" (${blob.mediaType})`, 'UNSUPPORTED_CONTENT')
  }
  if (block.type === 'tool-result') {
    throw new LlmError('openai-responses face cannot render a tool result as message content', 'INVALID_REQUEST')
  }
  throw new LlmError(`openai-responses face cannot render content block "${block.type}"`, 'UNSUPPORTED_CONTENT')
}

/**
 * Serialize the full openai-responses request.
 * @param options - the harness request (prompt-source already applied).
 * @param capability - the model's capability (unused for the ceiling chain here
 *   beyond symmetry; Responses takes max_output_tokens from the request).
 * @param media - pre-collected media blobs keyed by attachment id.
 */
export function serializeResponses(
  options: GenerateOptions,
  capability: ModelCapability,
  media: MediaMap,
): ResponsesRequest {
  const raw = options.messages as readonly WireableMessage[]
  const system = systemText(options, raw)

  // F1 (symmetry): the per-request ceiling wins, then the model row.
  const maxOutputTokens = typeof options.maxTokens === 'number' && options.maxTokens > 0
    ? options.maxTokens
    : typeof capability.maxTokens === 'number' && capability.maxTokens > 0
      ? capability.maxTokens
      : undefined

  const leading = leadingSystem(raw)
  const rest = leading === undefined ? raw : raw.filter((message) => message !== leading)

  const input: InputItem[] = []
  for (const message of rest) {
    if (message.role === 'assistant') {
      const text = textOf(message.content)
      if (text.length > 0) {
        input.push({
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text }],
        })
      }
      for (const block of message.content ?? []) {
        if (block.type !== 'tool-call') continue
        input.push({
          type: 'function_call',
          call_id: String(block.id ?? ''),
          name: String(block.name ?? ''),
          arguments: String(block.arguments ?? '{}'),
        })
      }
      continue
    }
    if (message.role === 'tool') {
      // 0.2.0 shape: a first-class tool-role message.
      input.push({
        type: 'function_call_output',
        call_id: String(message.toolCallId ?? ''),
        output: textOf(message.content) || '(no output)',
      })
      continue
    }
    if (message.role === 'developer') continue
    const content: Array<Record<string, unknown>> = []
    for (const block of message.content ?? []) {
      if (block.type === 'tool-result') {
        // 0.1.x shape: tool results embedded in user messages.
        const result = block as WireableBlock & { content?: readonly WireableBlock[]; toolCallId?: string }
        input.push({
          type: 'function_call_output',
          call_id: String(result.toolCallId ?? ''),
          output: textOf(result.content) || '(no output)',
        })
        continue
      }
      content.push(userPart(block, media))
    }
    if (content.length > 0) input.push({ type: 'message', role: 'user', content })
  }

  const tools = options.tools?.map((tool) => ({
    type: 'function' as const,
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    strict: false,
  }))
  const effort = effortFor(options.reasoningEffort)

  return {
    model: options.model,
    stream: true,
    ...(system !== undefined ? { instructions: system } : {}),
    input,
    ...(maxOutputTokens !== undefined ? { max_output_tokens: maxOutputTokens } : {}),
    ...(effort !== undefined ? { reasoning: { effort } } : {}),
    ...options.temperature !== undefined ? { temperature: options.temperature } : {},
    ...tools !== undefined && tools.length > 0 ? { tools } : {},
  }
}

/* ── receive side ──────────────────────────────────────────────────────── */

/** One Responses SSE data payload (the subset this face reads). */
interface ResponsesEvent {
  type?: string
  item?: { type?: string; role?: string; name?: string; call_id?: string }
  delta?: string
  output_index?: number
  response?: {
    usage?: {
      input_tokens?: number
      output_tokens?: number
      output_tokens_details?: { reasoning_tokens?: number }
    }
  }
  error?: { message?: string }
}

/** Map one Responses output item type onto the block it opens. */
function itemKind(itemType: string | undefined): 'text' | 'reasoning' | 'tool-call' | undefined {
  if (itemType === 'message') return 'text'
  if (itemType === 'reasoning') return 'reasoning'
  if (itemType === 'function_call') return 'tool-call'
  return undefined
}

/**
 * Consume Responses SSE payloads and yield StreamChunks. Item lifecycle:
 * `response.output_item.added` opens message/reasoning/function_call items,
 * `response.output_text.delta` / `response.reasoning_summary_text.delta` /
 * `response.function_call_arguments.delta` feed them,
 * `response.completed` closes everything with usage, `response.failed` /
 * `error` are loud failures.
 */
export async function* translateResponses(payloads: AsyncIterable<string>): AsyncGenerator<StreamChunk> {
  let nextIndex = 0
  const open = new Map<number, { kind: 'text' | 'reasoning' | 'tool-call'; text: string; id?: string; name?: string }>()
  const order: number[] = []
  let closed = false

  for await (const payload of payloads) {
    let event: ResponsesEvent
    try {
      event = JSON.parse(payload) as ResponsesEvent
    } catch {
      throw new Error(`malformed SSE payload: ${payload.slice(0, 120)}`)
    }
    const type = event.type
    if (type === 'response.output_item.added') {
      const kind = itemKind(event.item?.type)
      if (kind === undefined) continue
      const index = nextIndex++
      open.set(index, { kind, text: '', id: event.item?.call_id, name: event.item?.name })
      order.push(index)
      if (kind === 'tool-call') {
        yield { type: 'block-start', index, blockType: 'tool-call' }
      } else {
        yield { type: 'block-start', index, blockType: kind }
      }
    } else if (type === 'response.output_text.delta') {
      const index = event.output_index ?? 0
      const block = open.get(index)
      if (block?.kind !== 'text' || typeof event.delta !== 'string') continue
      block.text += event.delta
      yield { type: 'text-delta', index, text: event.delta }
    } else if (type === 'response.reasoning_summary_text.delta' || type === 'response.reasoning_text.delta') {
      const index = event.output_index ?? 0
      const block = open.get(index)
      if (block?.kind !== 'reasoning' || typeof event.delta !== 'string') continue
      block.text += event.delta
      yield { type: 'reasoning-delta', index, text: event.delta }
    } else if (type === 'response.function_call_arguments.delta') {
      const index = event.output_index ?? 0
      const block = open.get(index)
      if (block?.kind !== 'tool-call' || typeof event.delta !== 'string') continue
      block.text += event.delta
      yield {
        type: 'tool-call-delta',
        index,
        id: ToolCallId(block.id ?? ''),
        ...(block.name !== undefined ? { name: block.name } : {}),
        argumentsDelta: event.delta,
      }
    } else if (type === 'response.completed' || type === 'response.incomplete') {
      const usageData = event.response?.usage
      for (const index of order) {
        const block = open.get(index)!
        if (block.kind === 'text') {
          yield { type: 'block-end', index, block: { type: 'text', text: block.text } }
        } else if (block.kind === 'reasoning') {
          yield { type: 'block-end', index, block: { type: 'reasoning', text: block.text } }
        } else {
          yield {
            type: 'block-end',
            index,
            block: { type: 'tool-call', id: ToolCallId(block.id ?? ''), name: block.name ?? '', arguments: block.text },
          }
        }
      }
      if (usageData !== undefined) {
        const reasoning = usageData.output_tokens_details?.reasoning_tokens
        yield {
          type: 'usage',
          usage: {
            inputTokens: usageData.input_tokens ?? 0,
            outputTokens: usageData.output_tokens ?? 0,
            ...(reasoning !== undefined ? { reasoningTokens: reasoning } : {}),
          },
        }
      }
      yield { type: 'finish', reason: { kind: order.some((i) => open.get(i)?.kind === 'tool-call') ? 'tool-calls' : 'stop' } }
      closed = true
      return
    } else if (type === 'response.failed' || type === 'error') {
      throw new LlmError(`openai-responses stream failed: ${String(event.error?.message ?? type)}`, 'SERVER')
    }
  }
  if (!closed) throw new Error('SSE payload stream ended without response.completed')
}
