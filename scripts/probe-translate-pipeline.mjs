/**
 * Full pipeline probe: serializeRequest -> POST vLLM -> parseSse -> translate,
 * then print the StreamChunks (which blocks actually carry thinking).
 */
import { serializeRequest } from '../src/adapter/serialize.ts'
import { parseSse } from '../src/adapter/sse.ts'
import { translate } from '../src/adapter/translate.ts'

const BASE_URL = 'http://192.168.100.242:8200/v1'
const MODEL = 'Qwen3.6-35B-A3B'

const body = serializeRequest({
  provider: 'local-35b',
  model: MODEL,
  system: 'You are a helpful assistant.',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'What is 9.8 vs 9.11? Think carefully.' }] }],
  reasoningEffort: 'high',
}, {
  thinkingFormat: 'qwen-chat-template',
  supportsReasoningEffort: false,
  reasoningEfforts: { off: null, high: 'high' },
  vision: false,
})

const response = await fetch(`${BASE_URL}/chat/completions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'accept': 'text/event-stream' },
  body: JSON.stringify(body),
})
console.log('HTTP', response.status)
if (!response.ok) { console.log(await response.text()); process.exit(1) }

let reasoningText = ''
let textText = ''
let toolCalls = 0
const blockTypes = new Set()
for await (const chunk of translate(parseSse(response.body))) {
  switch (chunk.type) {
    case 'reasoning-delta': reasoningText += chunk.text; break
    case 'text-delta': textText += chunk.text; break
    case 'tool-call-delta': toolCalls += 1; break
    case 'block-end': blockTypes.add(chunk.block.type); break
    case 'block-start': blockTypes.add(chunk.blockType); break
    default: break
  }
}
console.log('block types seen:', [...blockTypes].join(', '))
console.log('reasoning text length:', reasoningText.length)
console.log('reasoning text head:', JSON.stringify(reasoningText.slice(0, 120)))
console.log('text text length:', textText.length)
console.log('text head:', JSON.stringify(textText.slice(0, 120)))
console.log('tool-call deltas:', toolCalls)
