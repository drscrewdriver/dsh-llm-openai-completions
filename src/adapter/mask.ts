/**
 * Emergency modality fallback: when a session's history carries media the
 * target model cannot carry on the selected wire face, `modalFallback: 'mask'`
 * replaces those blocks with deterministic meta text instead of refusing the
 * request (`modalFallback: 'refuse'`, the default, keeps the hard gate).
 *
 * The mask is request-local: session history keeps its structured blocks, so
 * switching back to a media-capable model restores native viewing. Masking
 * runs in `adapter.stream()` BEFORE `enforceModalities`, so the masked request
 * traverses the gate, media collection (masked blocks carry no bytes), and
 * every wire face (chat / anthropic / responses) unchanged.
 * @module dsh-llm-openai-completions/adapter/mask
 */
import type { ModelCapability } from './config.ts'
import { FACE_MODALITY, type FaceId } from './face.ts'
import { requiredModality, type WireableBlock, type WireableMessage } from './serialize.ts'

/** Human labels per maskable modality (mirrors serialize's gate vocabulary). */
const MASK_LABELS: Record<string, string> = {
  video: 'video',
  audio: 'audio',
  pdf: 'PDF document',
  image: 'image',
}

/** A duck-typed attachment ref carrying optional display metadata. */
interface MaskableRef {
  name?: unknown
  bytes?: unknown
  mediaType?: unknown
}

/** One masked occurrence, reported for logging/debugging. */
export interface MaskRecord {
  /** Message index in the request history. */
  messageIndex: number
  /** Block index within the message. */
  blockIndex: number
  /** The modality that was masked. */
  modality: string
  /** Attachment display name, when resolvable. */
  name?: string
}

/** The mask outcome: messages to send (identity when nothing was masked). */
export interface MaskOutcome {
  messages: readonly WireableMessage[]
  records: MaskRecord[]
}

/** The modalities this fallback is allowed to mask (image handled separately). */
const UNCONDITIONALLY_MASKABLE = new Set(['video', 'audio', 'pdf'])

/** Read the display name from a block's attachment ref, when present. */
function refName(block: WireableBlock): string | undefined {
  const ref = (block as { attachment?: MaskableRef }).attachment
  return typeof ref?.name === 'string' && ref.name.length > 0 ? ref.name : undefined
}

/** Read the byte size from a block's attachment ref, when present. */
function refBytes(block: WireableBlock): number | undefined {
  const ref = (block as { attachment?: MaskableRef }).attachment
  return typeof ref?.bytes === 'number' && Number.isFinite(ref.bytes) && ref.bytes >= 0 ? ref.bytes : undefined
}

/** One deterministic placeholder text block for a masked media block. */
function placeholderFor(block: WireableBlock, modality: string, model: string): WireableBlock {
  const label = MASK_LABELS[modality] ?? modality
  const name = refName(block)
  const bytes = refBytes(block)
  const size = bytes === undefined ? '' : ` (${(bytes / (1024 * 1024)).toFixed(1)} MB)`
  const ident = name === undefined ? `A ${label}` : `${label.charAt(0).toUpperCase()}${label.slice(1)} "${name}"`
  return {
    type: 'text',
    text:
      `[Media omitted — ${label}] ${ident}${size} is attached earlier in this session, but the current model ` +
      `(${model}) cannot receive ${label} input on this route. Any earlier analysis of it is still in the ` +
      `surrounding messages; switch back to a ${label}-capable model to view it directly.`,
  }
}

/**
 * Union extra modalities (plugin settings `extraInputs`) into a capability's
 * declared `input`. Identity when there is nothing to add.
 */
export function withExtraInputs(capability: ModelCapability, extra: readonly string[] | undefined): ModelCapability {
  if (extra === undefined || extra.length === 0) return capability
  return { ...capability, input: [...new Set([...capability.input, ...extra])] }
}

/**
 * Replace media blocks the target model/face cannot carry with deterministic
 * text placeholders. The input array is returned UNCHANGED (same reference)
 * when nothing needs masking, so the happy path stays allocation-free.
 * @param messages - the harness request history.
 * @param capability - the target model's capability (its effective `input`).
 * @param face - the wire face the request will travel on.
 * @param model - the model id, named in placeholder text.
 * @returns the (possibly copied) messages plus what was masked.
 */
export function maskUncarriableMedia(
  messages: readonly WireableMessage[],
  capability: ModelCapability,
  face: FaceId,
  model: string,
): MaskOutcome {
  const declared = capability.input.length > 0 ? capability.input : ['text']
  const faceAllowed = FACE_MODALITY[face]
  const allowed = new Set(declared.filter((modality) => faceAllowed.includes(modality)))
  const records: MaskRecord[] = []
  let copied: WireableMessage[] | undefined

  messages.forEach((message, messageIndex) => {
    const content = message.content
    if (content === undefined || content.length === 0) return
    let blocks: WireableBlock[] | undefined
    content.forEach((block, blockIndex) => {
      const modality = requiredModality(block)
      if (modality === undefined || allowed.has(modality)) return
      // Image masking additionally requires the model to be non-vision: the
      // vision gate owns image refusal, and a vision model always carries it.
      if (modality === 'image' && capability.vision) return
      if (!UNCONDITIONALLY_MASKABLE.has(modality) && modality !== 'image') return
      blocks ??= [...content]
      blocks[blockIndex] = placeholderFor(block, modality, model)
      records.push({ messageIndex, blockIndex, modality, ...refName(block) !== undefined ? { name: refName(block) } : {} })
    })
    if (blocks !== undefined) {
      copied ??= [...messages]
      copied[messageIndex] = { ...message, content: blocks }
    }
  })

  return { messages: copied ?? messages, records }
}
