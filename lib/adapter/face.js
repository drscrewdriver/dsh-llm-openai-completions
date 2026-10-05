/** The modalities each face can honestly carry on the wire. */
export const FACE_MODALITY = {
    // The full inline set this transport encodes.
    'openai-completions': ['image', 'audio', 'video', 'pdf'],
    // MiMo's anthropic face silently drops audio/video/PDF — image only, ever.
    'anthropic-messages': ['image'],
    // Probed image/audio/video; PDF rejected 400 by MiMo chat-family endpoints —
    // kept here per the OpenAI Responses spec (input_file), calibrate on probe.
    'openai-responses': ['image', 'audio', 'video', 'pdf'],
};
/**
 * Read the face from a pi-ai provider profile's route-level `api` field.
 * Absent or unrecognized values fall back to `openai-completions` — the same
 * default pi-ai itself applies.
 */
export function faceOf(profile) {
    const api = profile?.api;
    if (api === 'openai-responses' || api === 'anthropic-messages')
        return api;
    return 'openai-completions';
}
/**
 * The wire root for one face: strip trailing slashes, then let each face
 * name its segments — anthropic needs a `/v1` segment (mimo's
 * messagesApiRoot semantics: append when the pathname does not already end
 * with it), chat/responses endpoints conventionally sit on a `/v1` base the
 * user already configured.
 */
export function rootFor(baseURL, face) {
    const base = baseURL.replace(/\/+$/u, '');
    if (face !== 'anthropic-messages')
        return base;
    let endsWithV1 = false;
    try {
        endsWithV1 = new URL(base).pathname.endsWith('/v1');
    }
    catch {
        endsWithV1 = /\/v1$/u.test(base);
    }
    return endsWithV1 ? base : `${base}/v1`;
}
