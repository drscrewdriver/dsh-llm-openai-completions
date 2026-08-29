/**
 * End-to-end verification: translate (short-circuit adapter) -> BlockAssembler
 * (harness) for a realistic mimo/vLLM-style tool_calls stream where later
 * deltas repeat function.name as null/''. Confirms the assembled tool-call
 * keeps a non-empty name (no `unknown tool ""`).
 */
import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import { translate } from '../src/adapter/translate.ts'

async function main() {
  const payloads = [
    JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'fs_write', arguments: '{"path' } }] } }] }),
    JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: null, arguments: '":"a.txt","content":"hi"}' } }] } }] }),
    JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: '', arguments: '' } }] } }] }),
    JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
    '[DONE]',
  ]
  async function* feed() { for (const p of payloads) yield p }

  const assembler = new BlockAssembler()
  for await (const chunk of translate(feed())) assembler.push(chunk)

  const blocks = assembler.blocks()
  const call = blocks.find(b => b.type === 'tool-call')
  if (!call || call.type !== 'tool-call') {
    console.error('FAIL: no tool-call block assembled')
    process.exit(1)
  }
  console.log('assembled tool-call:', JSON.stringify(call, null, 2))
  if (call.name === 'fs_write' && call.arguments === '{"path":"a.txt","content":"hi"}') {
    console.log('PASS: name preserved, arguments intact')
  } else {
    console.error(`FAIL: name=${JSON.stringify(call.name)} args=${JSON.stringify(call.arguments)}`)
    process.exit(1)
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
