/**
 * Wire-face selection: one of the three protocols pi-ai's `api` field can
 * name (its PROTOCOLS registry is exactly these three, so a per-route face
 * covers every configurable route). The face decides endpoint path, auth
 * headers, wire serialization, SSE dialect, and which modalities the wire
 * can honestly carry.
 * @module dsh-llm-openai-completions/adapter/face
 */
import type { PiAiProviderProfile } from './identify.ts';
/** The three wire faces this transport speaks (pi-ai PROTOCOLS, verbatim). */
export type FaceId = 'openai-completions' | 'openai-responses' | 'anthropic-messages';
/** The modalities each face can honestly carry on the wire. */
export declare const FACE_MODALITY: Record<FaceId, readonly string[]>;
/**
 * Read the face from a pi-ai provider profile's route-level `api` field.
 * Absent or unrecognized values fall back to `openai-completions` — the same
 * default pi-ai itself applies.
 */
export declare function faceOf(profile: PiAiProviderProfile | undefined): FaceId;
/**
 * The wire root for one face: strip trailing slashes, then let each face
 * name its segments — anthropic needs a `/v1` segment (mimo's
 * messagesApiRoot semantics: append when the pathname does not already end
 * with it), chat/responses endpoints conventionally sit on a `/v1` base the
 * user already configured.
 */
export declare function rootFor(baseURL: string, face: FaceId): string;
