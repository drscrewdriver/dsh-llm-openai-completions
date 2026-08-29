/**
 * End-to-end: simulate the full request path for local-35b / Qwen3.6-35B-A3B
 * (toggle model: thinking on, supportsReasoningEffort false, thinkingFormat
 * qwen) and print the wire request body that would reach the gateway.
 */
import { serializeRequest } from '../src/adapter/serialize.ts'
import { providerResolverOf } from '../src/adapter/config.ts'

const settings = {
  get: (ns) => ({
    'llm-pi-ai': {
      providers: {
        'local-35b': {
          apiKeyEnv: 'LOCAL_35B_API_KEY',
          api: 'openai-completions',
          baseURL: 'http://192.168.100.242:8200/v1',
          models: [{
            id: 'Qwen3.6-35B-A3B',
            input: ['text', 'image'],
            reasoningEfforts: { off: null, high: 'high' },
            compat: { supportsReasoningEffort: false, thinkingFormat: 'qwen-chat-template' },
          }],
        },
      },
    },
  })[ns],
}

const resolver = providerResolverOf(settings)
const provider = resolver('local-35b')
const capability = provider?.models['Qwen3.6-35B-A3B']
console.log('capability:', JSON.stringify(capability, null, 2))

const cases = [
  { label: 'On (no effort — harness strips the toggle)', options: { reasoningEffort: undefined } },
  { label: 'Off (explicit)', options: { reasoningEffort: 'off' } },
]
for (const c of cases) {
  const body = serializeRequest({
    provider: 'local-35b',
    model: 'Qwen3.6-35B-A3B',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    ...c.options,
  }, capability)
  console.log(`\n${c.label}:`)
  console.log('  enable_thinking:', body.enable_thinking)
  console.log('  reasoning_effort:', body.reasoning_effort)
  console.log('  chat_template_kwargs:', body.chat_template_kwargs)
}
