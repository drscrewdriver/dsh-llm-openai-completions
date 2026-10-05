/**
 * The anthropic-messages face: serialize harness messages into an Anthropic
 * Messages body and translate its SSE event stream into harness chunks.
 *
 * Wire (mimo活参考语义): `system` is a TOP-LEVEL parameter — the leading
 * system message (or `options.system` on one-shots) is extracted, merged,
 * and STRIPPED from `messages[]` (anthropic rejects role:"system" entries);
 * `max_tokens` is REQUIRED, every-request `options.maxTokens` first, then
 * the model row's declared ceiling, then 8192; thinking maps from the
 * request effort (`off` / one-shot → disabled, else enabled) — effort tiers
 * have no anthropic spelling here; tools are `{name, description,
 * input_schema}`; assistant history replays text + tool_use only (the
 * harness reasoning block carries no signature, and an unsigned thinking
 * block is rejected — strictly weaker than the chat face, which passes
 * reasoning_content back on tool-call turns).
 *
 * Pairing discipline: every tool_use must be answered by a tool_result in
 * the immediately following user message (mimo's check) — a broken history
 * is a loud INVALID_REQUEST, never a silently mangled request.
 * @module dsh-llm-openai-completions/adapter/anthropic
 */
import { LlmError } from '@deepseek-ai/dsh-llm';
import { ToolCallId } from "./tool-call-id.js";
/** Fallback output ceiling when neither the request nor the model declares one. */
const FALLBACK_MAX_TOKENS = 8192;
/** The leading system message of a message list, if one exists. */
function leadingSystem(messages) {
    return messages.find((message) => message.role === 'system');
}
/** Flatten one message's text blocks (system/assistant text). */
function textOf(blocks) {
    return (blocks ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('');
}
/** Resolve the request's system text: explicit channel, else the leading message. */
function systemText(options, messages) {
    const explicit = typeof options.system === 'string' ? options.system : undefined;
    if (explicit !== undefined)
        return explicit.length > 0 ? explicit : undefined;
    const leading = leadingSystem(messages);
    const joined = leading === undefined ? '' : textOf(leading.content);
    return joined.length > 0 ? joined : undefined;
}
/** Render one user-side content block (media must already be collected). */
function userBlock(block, media) {
    if (block.type === 'text')
        return { type: 'text', text: block.text ?? '' };
    if (block.type === 'image') {
        const attachment = block.attachment ?? {};
        const blob = media.get(String(attachment.attachmentId ?? ''));
        if (blob === undefined) {
            throw new LlmError('anthropic-messages face is missing image bytes for the request', 'INVALID_REQUEST');
        }
        return { type: 'image', source: { type: 'base64', media_type: blob.mediaType, data: Buffer.from(blob.data).toString('base64') } };
    }
    if (block.type === 'file') {
        // Unreachable when the face gate passed (anthropic carries image only);
        // kept as a loud guard rather than a silent degradation.
        throw new LlmError(`anthropic-messages face cannot inline file "${String(block.attachment?.name ?? 'attachment')}"`, 'UNSUPPORTED_CONTENT');
    }
    if (block.type === 'tool-result') {
        const result = block;
        return {
            type: 'tool_result',
            tool_use_id: String(result.toolCallId ?? ''),
            content: (result.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('') || '(no output)',
        };
    }
    throw new LlmError(`anthropic-messages face cannot render content block "${block.type}"`, 'UNSUPPORTED_CONTENT');
}
/**
 * Serialize the full anthropic-messages request.
 * @param options - the harness request (prompt-source already applied).
 * @param capability - the model's capability (maxTokens ceiling for the fallback chain).
 * @param media - pre-collected media blobs keyed by attachment id.
 * @returns the wire body plus the endpoint path segment.
 */
export function serializeAnthropic(options, capability, media) {
    const raw = options.messages;
    const system = systemText(options, raw);
    // F1: the per-request ceiling wins, then the model row, then the fallback.
    const maxTokens = typeof options.maxTokens === 'number' && options.maxTokens > 0
        ? options.maxTokens
        : typeof capability.maxTokens === 'number' && capability.maxTokens > 0
            ? capability.maxTokens
            : FALLBACK_MAX_TOKENS;
    // Thinking: off / one-shot → disabled; any other state thinks. Effort tiers
    // have no anthropic spelling on this face (mimo semantics).
    const thinkingDisabled = options.purpose === 'session-title' || options.reasoningEffort === 'off';
    // Drop the leading system message from the wire messages (its text went to
    // the top-level `system` parameter — anthropic rejects role:"system" rows).
    const leading = leadingSystem(raw);
    const rest = leading === undefined ? raw : raw.filter((message) => message !== leading);
    const messages = [];
    for (const message of rest) {
        if (message.role === 'assistant') {
            const content = [];
            const text = textOf(message.content);
            if (text.length > 0)
                content.push({ type: 'text', text });
            for (const block of message.content ?? []) {
                if (block.type !== 'tool-call')
                    continue;
                content.push({
                    type: 'tool_use',
                    id: String(block.id ?? ''),
                    name: String(block.name ?? ''),
                    input: safeJson(block.arguments ?? '{}'),
                });
            }
            if (content.length > 0)
                messages.push({ role: 'assistant', content });
            continue;
        }
        if (message.role === 'tool') {
            // 0.2.0 shape: a first-class tool-role message → a user turn carrying
            // one tool_result block.
            messages.push({
                role: 'user',
                content: [{
                        type: 'tool_result',
                        tool_use_id: String(message.toolCallId ?? ''),
                        content: textOf(message.content) || '(no output)',
                    }],
            });
            continue;
        }
        if (message.role === 'developer')
            continue;
        const content = [];
        // 0.1.x shape: tool results embedded in user messages — emitted first
        // (mimo reorders tool results to the front of their message).
        for (const block of message.content ?? []) {
            if (block.type === 'tool-result')
                content.push(userBlock(block, media));
        }
        for (const block of message.content ?? []) {
            if (block.type === 'text') {
                if ((block.text ?? '').length > 0)
                    content.push({ type: 'text', text: String(block.text) });
            }
            else if (block.type === 'image') {
                content.push(userBlock(block, media));
            }
        }
        if (content.length > 0)
            messages.push({ role: 'user', content });
    }
    // Pairing discipline: every tool_use answered by a tool_result, none orphaned.
    const pending = new Set();
    for (const message of messages) {
        if (message.role === 'assistant') {
            for (const block of message.content) {
                if (block.type === 'tool_use') {
                    if (pending.has(block.id))
                        throw new LlmError('duplicate tool call id in history', 'INVALID_REQUEST');
                    pending.add(block.id);
                }
            }
        }
        else {
            for (const block of message.content) {
                if (block.type === 'tool_result') {
                    if (!pending.delete(block.tool_use_id)) {
                        throw new LlmError('tool result has no matching tool call in history', 'INVALID_REQUEST');
                    }
                }
            }
        }
    }
    if (pending.size > 0)
        throw new LlmError('history ends with unresolved tool calls', 'INVALID_REQUEST');
    const tools = options.tools?.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
    }));
    return {
        model: options.model,
        stream: true,
        messages,
        max_tokens: maxTokens,
        thinking: { type: thinkingDisabled ? 'disabled' : 'enabled' },
        ...(system !== undefined ? { system } : {}),
        ...options.temperature !== undefined ? { temperature: options.temperature } : {},
        ...options.stop !== undefined && options.stop.length > 0 ? { stop_sequences: options.stop } : {},
        ...tools !== undefined && tools.length > 0 ? { tools } : {},
    };
}
/** Parse a tool-call arguments JSON string; malformed history is a loud error. */
function safeJson(argumentsText) {
    try {
        return JSON.parse(argumentsText);
    }
    catch {
        throw new LlmError('tool call arguments are not valid JSON', 'INVALID_REQUEST');
    }
}
/** Map the anthropic stop_reason vocabulary to the harness FinishReason. */
function mapStopReason(reason) {
    if (reason === 'tool_use')
        return { kind: 'tool-calls' };
    if (reason === 'max_tokens')
        return { kind: 'max-tokens' };
    return { kind: 'stop' };
}
/**
 * Consume anthropic SSE payloads and yield StreamChunks. Block lifecycle:
 * `content_block_start` opens text/thinking/tool_use blocks,
 * `content_block_delta` feeds them, `content_block_stop` closes each,
 * `message_delta` carries the finish reason and output usage,
 * `message_stop` ends the stream. thinking blocks become reasoning chunks;
 * `signature_delta` is ignored (the harness reasoning block has no field
 * for it — see the module note on replay).
 */
export async function* translateAnthropic(payloads) {
    let nextIndex = 0;
    const blocks = new Map();
    const order = [];
    let pendingFinish;
    let usage;
    const open = (kind, id, name) => {
        const index = nextIndex++;
        blocks.set(index, { kind, text: '', id, name });
        order.push(index);
        return index;
    };
    for await (const payload of payloads) {
        let event;
        try {
            event = JSON.parse(payload);
        }
        catch {
            throw new Error(`malformed SSE payload: ${payload.slice(0, 120)}`);
        }
        const type = event.type;
        if (type === 'content_block_start') {
            const block = event.content_block ?? {};
            const index = event.index ?? nextIndex;
            if (block.type === 'tool_use') {
                const i = open('tool-call', block.id, block.name);
                yield { type: 'block-start', index: i, blockType: 'tool-call' };
            }
            else if (block.type === 'thinking') {
                const i = open('reasoning');
                yield { type: 'block-start', index: i, blockType: 'reasoning' };
            }
            else {
                const i = open('text');
                yield { type: 'block-start', index: i, blockType: 'text' };
            }
        }
        else if (type === 'content_block_delta') {
            const index = event.index ?? 0;
            const block = blocks.get(index);
            const delta = event.delta ?? {};
            if (delta.type === 'text_delta' && typeof delta.text === 'string' && block?.kind === 'text') {
                block.text += delta.text;
                yield { type: 'text-delta', index, text: delta.text };
            }
            else if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string' && block?.kind === 'reasoning') {
                block.text += delta.thinking;
                yield { type: 'reasoning-delta', index, text: delta.thinking };
            }
            else if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string' && block?.kind === 'tool-call') {
                block.text += delta.partial_json;
                yield {
                    type: 'tool-call-delta',
                    index,
                    id: ToolCallId(block.id ?? ''),
                    ...(block.name !== undefined ? { name: block.name } : {}),
                    argumentsDelta: delta.partial_json,
                };
            }
            // signature_delta: ignored (no harness field — see module note).
        }
        else if (type === 'content_block_stop') {
            const index = event.index ?? 0;
            const block = blocks.get(index);
            if (block === undefined)
                continue;
            if (block.kind === 'text') {
                yield { type: 'block-end', index, block: { type: 'text', text: block.text } };
            }
            else if (block.kind === 'reasoning') {
                yield { type: 'block-end', index, block: { type: 'reasoning', text: block.text } };
            }
            else {
                yield {
                    type: 'block-end',
                    index,
                    block: { type: 'tool-call', id: ToolCallId(block.id ?? ''), name: block.name ?? '', arguments: block.text },
                };
            }
        }
        else if (type === 'message_delta') {
            const delta = event.delta ?? {};
            if (typeof delta.stop_reason === 'string')
                pendingFinish = mapStopReason(delta.stop_reason);
            if (event.usage?.output_tokens !== undefined) {
                usage = {
                    inputTokens: usage?.inputTokens ?? 0,
                    outputTokens: event.usage.output_tokens,
                };
            }
        }
        else if (type === 'message_start') {
            const input = event.message?.usage?.input_tokens;
            if (typeof input === 'number')
                usage = { inputTokens: input, outputTokens: usage?.outputTokens ?? 0 };
        }
        else if (type === 'message_stop') {
            for (const index of order) {
                const block = blocks.get(index);
                if (block.kind === 'text') {
                    yield { type: 'block-end', index, block: { type: 'text', text: block.text } };
                }
                else if (block.kind === 'reasoning') {
                    yield { type: 'block-end', index, block: { type: 'reasoning', text: block.text } };
                }
                else {
                    yield {
                        type: 'block-end',
                        index,
                        block: { type: 'tool-call', id: ToolCallId(block.id ?? ''), name: block.name ?? '', arguments: block.text },
                    };
                }
            }
            if (usage !== undefined)
                yield { type: 'usage', usage };
            yield { type: 'finish', reason: pendingFinish ?? { kind: 'stop' } };
            return;
        }
        else if (type === 'error') {
            throw new LlmError(`anthropic stream error event`, 'SERVER');
        }
    }
    throw new Error('SSE payload stream ended without message_stop');
}
