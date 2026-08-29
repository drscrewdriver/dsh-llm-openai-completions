/**
 * End-to-end decision path for Qwen3.6-35B-A3B (toggle model).
 * thinking-levels resolveEffortInjection -> short-circuit serializeRequest.
 * Prints every stage so a missing enable_thinking is attributable.
 */
import { resolveEffortInjection } from '../../dsh-thinking-levels/src/thinking-level.ts'
import { serializeRequest } from '../src/adapter/serialize.ts'
import { providerResolverOf } from '../src/adapter/config.ts'

const settings = {
  get: (ns) => ({
    'llm-pi-ai': {
      providers: {
        'local-35b': {
          api: 'openai-completions',
          baseURL: 'http://192.168.100.242:8200/v1',
          models: [{
            id: 'Qwen3.6-35B-A3B',
            reasoningEfforts: { off: null, high: 'high' },
            compat: { supportsReasoningEffort: false, thinkingFormat: 'qwen' },
          }],
        },
      },
    },
  })[ns],
}

const capability = providerResolverOf(settings)('local-35b')?.models['Qwen3.6-35B-A3B']

// Simulate the request-path capability snapshot the way capabilityResolver builds it.
const scenarios = [
  { label: 'toggleOnly=true (takeover list), user On', cap: { supportsReasoning: true, efforts: ['off', 'high'], toggleOnly: true }, seedEffort: 'on', level: 'auto' },
  { label: 'toggleOnly=true, no seed (auto default)', cap: { supportsReasoning: true, efforts: ['off', 'high'], toggleOnly: true }, seedEffort: undefined, level: 'auto' },
  { label: 'toggleOnly=true, user Off', cap: { supportsReasoning: true, efforts: ['off', 'high'], toggleOnly: true }, seedEffort: 'off', level: 'auto' },
  { label: 'toggleOnly=false (takeover missed), no seed', cap: { supportsReasoning: true, efforts: ['off', 'high'], toggleOnly: false }, seedEffort: undefined, level: 'auto' },
  { label: 'supportsReasoning=false, no seed', cap: { supportsReasoning: false, efforts: [], toggleOnly: false }, seedEffort: undefined, level: 'auto' },
]

for (const s of scenarios) {
  const decision = resolveEffortInjection({
    supportsReasoning: s.cap.supportsReasoning,
    seedEffort: s.seedEffort,
    selected: s.level,
    recentCalls: [],
    allowDowngrade: true,
    allowUpgrade: true,
    efforts: s.cap.efforts,
    toggleOnly: s.cap.toggleOnly,
  })
  const request = {
    provider: 'local-35b',
    model: 'Qwen3.6-35B-A3B',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    ...decision.inject ? { reasoningEffort: decision.level } : {},
  }
  const body = serializeRequest(request, capability)
  console.log(`${s.label}: decision=${JSON.stringify(decision)} wire.enable_thinking=${body.enable_thinking}`)
}
