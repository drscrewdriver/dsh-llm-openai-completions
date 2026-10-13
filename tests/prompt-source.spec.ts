import { describe, expect, it } from 'vitest'
import { PromptSourceRegistry } from '../src/adapter/prompt-source.ts'
import type { PromptSource } from '../src/adapter/prompt-source.ts'

/** A request with a loop-shaped system prompt (leading system message). */
const loopRequest = () => ({
  provider: 'local35b',
  model: 'Qwen3.6-35B-A3B',
  system: undefined as string | undefined,
  messages: [
    { role: 'system', content: [{ type: 'text', text: 'base system prompt' }] },
    { role: 'user', content: [{ type: 'text', text: 'hi' }] },
  ],
  tools: [
    { name: 'bash', description: 'run a shell command', parameters: { type: 'object' } },
    { name: 'read', description: 'read a file', parameters: { type: 'object' } },
  ],
}) as never

/** A one-shot request (options.system channel). */
const oneShotRequest = () => ({
  provider: 'local35b',
  model: 'Qwen3.6-35B-A3B',
  system: 'one-shot system',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
}) as never

describe('PromptSourceRegistry — the llmOpenaiCompletions seam', () => {
  it('zero behavior when no source is registered (contract 1)', () => {
    const registry = new PromptSourceRegistry()
    const request = loopRequest()
    expect(registry.apply(request, 'local35b')).toBe(request)
  })

  it('replaces the leading system message in place (loop channel)', () => {
    const registry = new PromptSourceRegistry()
    registry.register({
      resolveSystem: ({ system }) => system === 'base system prompt' ? 'persona v2' : undefined,
      resolveToolDescription: () => undefined,
    })
    const next = registry.apply(loopRequest(), 'local35b')
    const system = (next as unknown as { messages: Array<{ role: string; content: Array<{ text?: string }> }> }).messages[0]
    expect(system.role).toBe('system')
    expect(system.content[0]?.text).toBe('persona v2')
  })

  it('replaces options.system on the one-shot channel, not the messages', () => {
    const registry = new PromptSourceRegistry()
    registry.register({
      resolveSystem: ({ system }) => `replaced:${system}`,
      resolveToolDescription: () => undefined,
    })
    const next = registry.apply(oneShotRequest(), 'local35b') as unknown as { system?: string; messages: unknown[] }
    expect(next.system).toBe('replaced:one-shot system')
    expect((next.messages as unknown[]).length).toBe(1)
  })

  it('replaces only the addressed tool description; name/parameters untouched (contract 2)', () => {
    const registry = new PromptSourceRegistry()
    registry.register({
      resolveSystem: () => undefined,
      resolveToolDescription: ({ toolName, description }) =>
        toolName === 'bash' ? `${description} (v2)` : undefined,
    })
    const next = registry.apply(loopRequest(), 'local35b') as unknown as { tools: Array<Record<string, unknown>> }
    expect(next.tools[0]?.description).toBe('run a shell command (v2)')
    expect(next.tools[0]?.name).toBe('bash')
    expect(next.tools[0]?.parameters).toEqual({ type: 'object' })
    expect(next.tools[1]?.description).toBe('read a file')
  })

  it('unregistering via the disposer restores passthrough', () => {
    const registry = new PromptSourceRegistry()
    const dispose = registry.register({
      resolveSystem: ({ system }) => `x:${system}`,
      resolveToolDescription: () => undefined,
    })
    dispose()
    const request = loopRequest()
    expect(registry.apply(request, 'local35b')).toBe(request)
  })

  it('a same-text replacement is a no-op (identity preserved)', () => {
    const registry = new PromptSourceRegistry()
    registry.register({
      resolveSystem: ({ system }) => system,
      resolveToolDescription: () => undefined,
    })
    const request = loopRequest()
    expect(registry.apply(request, 'local35b')).toBe(request)
  })
})
