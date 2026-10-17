#!/usr/bin/env node
/**
 * Host dependency-surface audit across the 16-rc matrix: pack each rc of the
 * @deepseek-ai packages this plugin consumes and grep the export surface it
 * needs. Prints the per-rc verdict table to stdout.
 */
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, readdirSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const RCS = [
  '0.1.0-rc.2', '0.1.0-rc.3', '0.1.0-rc.6', '0.1.0-rc.7', '0.1.0-rc.8',
  '0.1.1-rc.1', '0.1.1-rc.2', '0.1.2-rc.1',
  '0.1.5-rc.1', '0.1.5-rc.2', '0.1.5-rc.3',
  '0.1.7-rc.1', '0.1.7-rc.2', '0.2.0-rc.1', '0.2.0-rc.2', '0.2.1-rc.1',
]

const CHECKS = {
  'dsh-llm': ['LlmError', 'attributionHeaders', 'EMPTY_RESPONSE_CODE', 'ToolCallId', 'CallId', 'LlmAdapter'],
  'dsh-credentials': ['credentialRef'],
  'dsh-launch-environment': ['launchEnvironmentOf'],
  'dsh-settings': ['describe', 'register', 'update', 'SettingsForms', 'document-updated'],
}

const dir = mkdtempSync(join(tmpdir(), 'oc-audit-'))
const table = {}
try {
  for (const pkg of Object.keys(CHECKS)) {
    table[pkg] = {}
    for (const rc of RCS) {
      execSync(`npm pack @deepseek-ai/${pkg}@${rc} --silent`, { cwd: dir, stdio: 'pipe' })
      const tgz = `deepseek-ai-${pkg}-${rc}.tgz`
      const out = join(dir, 'x')
      mkdirSync(out, { recursive: true })
      execSync(`tar -xzf ${tgz} -C ${JSON.stringify(out)}`, { cwd: dir, stdio: 'pipe' })
      const src = readFileSync(join(out, 'package', 'lib', 'index.js'), 'utf8')
      table[pkg][rc] = Object.fromEntries(CHECKS[pkg].map((name) => [name, src.includes(name)]))
      rmSync(out, { recursive: true, force: true })
      rmSync(join(dir, tgz), { force: true })
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log('rc | dsh-llm(LlmError/attributionHeaders/EMPTY_RESPONSE_CODE/ToolCallId/CallId) | credentials(credentialRef) | launchEnv | settings(describe/register/update/SettingsForms/document-updated)')
for (const rc of RCS) {
  const l = table['dsh-llm'][rc]
  const c = table['dsh-credentials'][rc]
  const le = table['dsh-launch-environment'][rc]
  const s = table['dsh-settings'][rc]
  const f = (b) => (b ? '✓' : '✗')
  console.log(`${rc} | ${f(l.LlmError)}/${f(l.attributionHeaders)}/${f(l.EMPTY_RESPONSE_CODE)}/${f(l.ToolCallId)}/${f(l.CallId)} | ${f(c.credentialRef)} | ${f(le.launchEnvironmentOf)} | ${f(s.describe)}/${f(s.register)}/${f(s.update)}/${f(s.SettingsForms)}/${f(s['document-upputed'] ?? s['document-updated'])}`)
}
