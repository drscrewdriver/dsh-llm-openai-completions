/**
 * Probe: does TOP-LEVEL enable_thinking: true (qwen format) make the vLLM
 * Qwen3.6 gateway return thinking? Tests both qwen and qwen-chat-template.
 */
import { serializeRequest } from '../src/adapter/serialize.ts'

const BASE_URL = 'http://192.168.100.242:8200/v1'
const MODEL = 'Qwen3.6-35B-A3B'

async function probe(format) {
  const body = serializeRequest({
    provider: 'local-35b',
    model: MODEL,
    system: 'You are a helpful assistant.',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'What is 9.8 vs 9.11? Think carefully.' }] }],
    reasoningEffort: 'high',
  }, {
    thinkingFormat: format,
    supportsReasoningEffort: false,
    reasoningEfforts: { off: null, high: 'high' },
    vision: false,
  })
  console.log(`\n=== format=${format} ===`)
  console.log('wire thinking fields:', JSON.stringify({
    enable_thinking: body.enable_thinking,
    chat_template_kwargs: body.chat_template_kwargs,
    reasoning_effort: body.reasoning_effort,
  }))
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'text/event-stream' },
    body: JSON.stringify(body),
  })
  if (!response.ok) { console.log('HTTP', response.status, await response.text()); return }
  const text = await response.text()
  console.log('has </think>:', text.includes('</think'))
  console.log('has reasoning_content:', text.includes('reasoning_content'))
  console.log('bytes:', text.length)
}

await probe('qwen')
await probe('qwen-chat-template')
