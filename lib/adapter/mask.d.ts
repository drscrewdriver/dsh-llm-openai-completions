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
import type { ModelCapability } from './config.ts';
import { type FaceId } from './face.ts';
import { type WireableMessage } from './serialize.ts';
/** One masked occurrence, reported for logging/debugging. */
export interface MaskRecord {
    /** Message index in the request history. */
    messageIndex: number;
    /** Block index within the message. */
    blockIndex: number;
    /** The modality that was masked. */
    modality: string;
    /** Attachment display name, when resolvable. */
    name?: string;
}
/** The mask outcome: messages to send (identity when nothing was masked). */
export interface MaskOutcome {
    messages: readonly WireableMessage[];
    records: MaskRecord[];
}
/**
 * Union extra modalities (plugin settings `extraInputs`) into a capability's
 * declared `input`. Identity when there is nothing to add.
 */
export declare function withExtraInputs(capability: ModelCapability, extra: readonly string[] | undefined): ModelCapability;
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
export declare function maskUncarriableMedia(messages: readonly WireableMessage[], capability: ModelCapability, face: FaceId, model: string): MaskOutcome;
