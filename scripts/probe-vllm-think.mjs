/**
 * Direct probe: POST a serializeRequest body to the vLLM gateway and print the
 * raw response, so a missing think is attributable (gateway vs adapter).
 */
import { serializeRequest } from '../src/adapter/serialize.ts'

const BASE_URL = process.env.PROBE_BASE_URL ?? 'http://192.168.100.242:8200/v1'
const MODEL = 'Qwen3.6-35B-A3B'

const capability = {
  thinkingFormat: 'qwen-chat-template',
  supportsReasoningEffort: false,
  reasoningEfforts: { off: null, high: 'high' },
  vision: false,
}

async function probe(label, options) {
  const body = serializeRequest({
    provider: 'local-35b',
    model: MODEL,
    system: 'You are a helpful assistant.',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'What is 9.8 vs 9.11? Think carefully.' }] }],
    ...options,
  }, capability)
  console.log(`\n=== ${label} ===`)
  console.log('request body:', JSON.stringify(body, null, 2))
  const started = Date.now()
  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept': 'text/event-stream' },
      body: JSON.stringify(body),
    })
    console.log('HTTP', response.status)
    if (!response.ok) {
      console.log('error body:', await response.text())
      return
    }
    const text = await response.text()
    const elapsed = Date.now() - started
    console.log(`elapsed ${elapsed}ms, bytes ${text.length}`)
    // Summarize: show whether reasoning_content / </think> appear anywhere.
    const hasReasoningField = text.includes('reasoning_content') || text.includes('"reasoning"')
    const hasThinkTag = text.includes('</think')
    const hasContent = text.includes('"content"')
    console.log('reasoning_content field:', hasReasoningField)
    console.log('</think> tag:', hasThinkTag)
    console.log('content field:', hasContent)
    // Print a trimmed excerpt around the first content delta.
    const excerpt = text.slice(0, 1200)
    console.log('excerpt:', excerpt)
  } catch (error) {
    console.log('fetch failed:', error.message)
  }
}

await probe('On (chat_template_kwargs.enable_thinking=true)', { reasoningEffort: 'high' })
await probe('On with no effort (harness strips toggle)', {})
