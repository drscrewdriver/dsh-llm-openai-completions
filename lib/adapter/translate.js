/**
 * Translate openai-completions SSE payloads into the harness StreamChunk
 * protocol, with one stateful block per content/reasoning/tool-call index.
 *
 * Reasoning is read from any of the fields OpenAI-compatible servers use
 * (`reasoning_content` / `reasoning` / `reasoning_text`); vLLM's Qwen3
 * deployment additionally renders thinking into `content` terminated by a
 * lone `</think>` tag, which is split here: the segment before the tag feeds
 * a reasoning block, the remainder text. Block-end, usage, and finish are
 * deferred to the `[DONE]` sentinel, so no chunk follows `finish`.
 * @module dsh-thinking-levels/adapter/translate
 */
import { CallId, EMPTY_RESPONSE_CODE } from '@deepseek-ai/dsh-llm';
import { DONE } from "./sse.js";
/** Map the wire finish_reason vocabulary to the harness FinishReason. */
export function mapFinishReason(reason) {
    switch (reason) {
        case 'stop': return { kind: 'stop' };
        case 'tool_calls': return { kind: 'tool-calls' };
        case 'length': return { kind: 'max-tokens' };
        default:
            return {
                kind: 'error',
                failure: { message: `model stopped: ${reason}`, code: reason.toUpperCase() },
            };
    }
}
/** Map wire usage to disjoint harness counts. */
export function mapUsage(usage) {
    const cacheRead = usage.prompt_tokens_details?.cached_tokens;
    const reasoning = usage.completion_tokens_details?.reasoning_tokens;
    return {
        inputTokens: usage.prompt_tokens - (cacheRead ?? 0),
        outputTokens: usage.completion_tokens,
        ...cacheRead !== undefined ? { cacheReadTokens: cacheRead } : {},
        ...reasoning !== undefined ? { reasoningTokens: reasoning } : {},
    };
}
/** Assemble the final ContentBlock for one open block. */
function closeBlock(block) {
    switch (block.kind) {
        case 'text': return { type: 'text', text: block.text };
        case 'reasoning': return { type: 'reasoning', text: block.text };
        case 'tool-call': return {
            type: 'tool-call',
            id: CallId(block.callId ?? ''),
            name: block.name ?? '',
            arguments: block.text,
        };
    }
}
/** A Qwen3-style `</think>` split: before the tag is thinking, after is text. */
function splitThinking(text) {
    const closeIdx = text.indexOf('</think');
    if (closeIdx === -1)
        return { thinking: '', rest: text };
    const thinking = text.slice(0, closeIdx)
        .replace(/^\s*<thinking>\s*/, '')
        .replace(/^\s*<\|im_start\|>thinking\s*/, '');
    return { thinking, rest: text.slice(closeIdx + '</think>'.length) };
}
/**
 * Consume SSE data payloads (ending with `[DONE]`) and yield StreamChunks.
 * @param payloads - SSE data payloads from {@link parseSse}, `[DONE]`-terminated.
 * @returns deltas as they arrive; `block-end`s, `usage`, and `finish` deferred
 *   to the `[DONE]` sentinel. A stop with no blocks maps to EMPTY_RESPONSE.
 */
export async function* translate(payloads) {
    let nextIndex = 0;
    let textBlock;
    let reasoningBlock;
    // Qwen3-style: content buffered while waiting for a lone </think> tag.
    let thinkPending = '';
    let thinkDone = false;
    const toolBlocks = new Map();
    const order = [];
    let pendingFinish;
    let pendingUsage;
    function open(kind) {
        const block = { index: nextIndex++, kind, text: '' };
        order.push(block);
        return block;
    }
    for await (const payload of payloads) {
        if (payload === DONE) {
            // Flush content buffered while waiting for a </think> that never came.
            if (!thinkDone && thinkPending.length > 0) {
                if (!textBlock) {
                    textBlock = open('text');
                    yield { type: 'block-start', index: textBlock.index, blockType: 'text' };
                }
                textBlock.text += thinkPending;
                yield { type: 'text-delta', index: textBlock.index, text: thinkPending };
                thinkPending = '';
            }
            for (const block of order) {
                yield { type: 'block-end', index: block.index, block: closeBlock(block) };
            }
            if (pendingUsage)
                yield { type: 'usage', usage: pendingUsage };
            const reason = pendingFinish ?? { kind: 'stop' };
            yield {
                type: 'finish',
                reason: reason.kind === 'stop' && order.length === 0
                    ? {
                        kind: 'error',
                        failure: { message: 'model returned a completed response with no content', code: EMPTY_RESPONSE_CODE },
                    }
                    : reason,
            };
            return;
        }
        let chunk;
        try {
            chunk = JSON.parse(payload);
        }
        catch {
            throw new Error(`malformed SSE payload: ${payload.slice(0, 120)}`);
        }
        for (const choice of chunk.choices ?? []) {
            const delta = choice.delta;
            // Reasoning via a dedicated field (reasoning_content / reasoning / reasoning_text).
            for (const field of ['reasoning_content', 'reasoning', 'reasoning_text']) {
                const reasoning = delta?.[field];
                if (typeof reasoning === 'string' && reasoning.length > 0) {
                    if (!reasoningBlock) {
                        reasoningBlock = open('reasoning');
                        yield { type: 'block-start', index: reasoningBlock.index, blockType: 'reasoning' };
                    }
                    reasoningBlock.text += reasoning;
                    yield { type: 'reasoning-delta', index: reasoningBlock.index, text: reasoning };
                }
            }
            const content = delta?.content;
            if (typeof content === 'string' && content.length > 0) {
                if (thinkDone) {
                    // Past the lone </think>: plain body text.
                    if (!textBlock) {
                        textBlock = open('text');
                        yield { type: 'block-start', index: textBlock.index, blockType: 'text' };
                    }
                    textBlock.text += content;
                    yield { type: 'text-delta', index: textBlock.index, text: content };
                }
                else {
                    // Still looking for the </think> tag (Qwen3-style thinking in content).
                    thinkPending += content;
                    const closeIdx = thinkPending.indexOf('</think');
                    if (closeIdx !== -1) {
                        const { thinking, rest } = splitThinking(thinkPending);
                        if (thinking.length > 0) {
                            if (!reasoningBlock) {
                                reasoningBlock = open('reasoning');
                                yield { type: 'block-start', index: reasoningBlock.index, blockType: 'reasoning' };
                            }
                            reasoningBlock.text += thinking;
                            yield { type: 'reasoning-delta', index: reasoningBlock.index, text: thinking };
                        }
                        thinkPending = '';
                        thinkDone = true;
                        if (rest.length > 0) {
                            if (!textBlock) {
                                textBlock = open('text');
                                yield { type: 'block-start', index: textBlock.index, blockType: 'text' };
                            }
                            textBlock.text += rest;
                            yield { type: 'text-delta', index: textBlock.index, text: rest };
                        }
                    }
                }
            }
            for (const call of delta?.tool_calls ?? []) {
                let block = toolBlocks.get(call.index ?? 0);
                if (!block) {
                    block = open('tool-call');
                    toolBlocks.set(call.index ?? 0, block);
                    yield { type: 'block-start', index: block.index, blockType: 'tool-call' };
                }
                if (call.id !== undefined)
                    block.callId = call.id;
                // Only a NON-EMPTY name updates the block. Gateways (mimo / vLLM /
                // Qwen3) repeat `function.name` on later deltas — sometimes as null or
                // "" alongside the arguments fragment — and overwriting the name
                // captured on the first delta would make the harness assemble a
                // tool-call with an empty name (`unknown tool ""`).
                const name = call.function?.name;
                if (typeof name === 'string' && name.length > 0)
                    block.name = name;
                const fragment = call.function?.arguments ?? '';
                block.text += fragment;
                yield {
                    type: 'tool-call-delta',
                    index: block.index,
                    id: CallId(block.callId ?? ''),
                    ...block.name !== undefined ? { name: block.name } : {},
                    argumentsDelta: fragment,
                };
            }
            if (typeof choice.finish_reason === 'string') {
                pendingFinish = mapFinishReason(choice.finish_reason);
            }
        }
        if (chunk.usage)
            pendingUsage = mapUsage(chunk.usage);
    }
    throw new Error('SSE payload stream ended without [DONE]');
}
