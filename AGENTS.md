# AGENTS.md — dsh-llm-openai-completions exposed seams and engineering discipline

For AI agents / consumers. Read this before modifying the plugin. Companion to the
README (installation, configuration) — this file is the CONTRACT surface.

## 1. The `llmOpenaiCompletions` service (prompt-source seam)

`apply` exposes the service via `ctx.provide("llmOpenaiCompletions", api)`. A consumer
declares `inject: ["llmOpenaiCompletions"]` (soft-coupled: guard for absence — the
service exists only while this plugin is composed).

### `listHostedModels(): Array<{ provider, id, name? }>`

Enumerates the models of the CURRENTLY taken-over routes (the takeover judgment's
union, from the live llm-pi-ai section). Empty while the `enabled` switch is off —
honest by construction, because dispatch only rewrites prompts on taken-over routes.
**A consumer GUI's model list must use this source only** — non-hosted models get no
rewrite, so offering them a configuration entry would be governance decay.

### `registerPromptSource(source): () => void`

Registers the prompt source; returns its disposer. `source` shape:

```ts
{
  // Replace the whole system prompt; return undefined to leave it unchanged.
  resolveSystem({ provider, model, system }): string | undefined
  // Replace one tool's description; return undefined to leave it unchanged.
  resolveToolDescription({ provider, model, toolName, description }): string | undefined
}
```

**Semantic constraints (contract — do not violate):**

1. Zero behavior change when no source is registered — plain passthrough.
2. Text only: never touch a tool's `name`/`parameters` (historical `tool_use` blocks
   correlate by name).
3. `resolve*` must be a deterministic pure function of `(provider, model)` — byte-stable.
   The system prompt and tools sit at the head of the request prefix; instability is a
   full prompt-cache miss every turn. Dynamic fragments belong in a tail-append channel.
4. Scope guarantee: consulted only inside this transport's dispatch (taken-over routes).
   Out-of-domain models are structurally unreachable.
5. System prompt dual channel: loop requests carry the prompt as the leading `system`
   message (`options.system` undefined); one-shot calls carry it via `options.system`.
   The query input is the resolved channel text; the replacement is written back to the
   SAME channel.

## 2. Takeover judgment (single source of truth)

```
takeover(route) = section.enabled === true
                  && (section.providers ∪ autoIdentified).includes(route)
autoIdentified  = custom openai-completions gateway AND thinking declared
                  (reasoningEfforts table) — adapter/identify.ts
```

- The `enabled` flag lives in THIS plugin's settings section (`.volatile()` — the host
  generates the form). There is no flag in dsh-thinking-levels; that plugin READS the
  same judgment (`takeoverRoutesOf`) to gate its effort injection and toggle folding.
- The data plane (baseURL / models / reasoningEfforts / compat / input) is and stays in
  the `llm-pi-ai` namespace, read per request through `settings.describe()`. No plugin
  may copy it — llm-pi-ai is the single source of truth.
- Identification functions (`isCustomOpenAiGateway` / `declaresThinking`) are a
  same-origin port of dsh-thinking-levels' `takeover-sync.ts`; both repos' unit tests
  lock the semantics. Change them in sync.

## 3. Dispatch behavior

- Listener: `llm/stream`, `{ prepend: true, global: true }` — outermost, crosses the
  fiber boundary (LlmRuntime originates the waterfall from its own fiber). Takeover =
  `yield* adapter.stream(options); return` (pi-ai never sees the request); passthrough
  = `yield* next()`.
- Wire: `system` is ALWAYS `role: "system"`; thinking per the model's
  `compat.thinkingFormat` (toggle models always `chat_template_kwargs.enable_thinking`);
  no `thinking_budget`; receive side splits Qwen3-style `</think>` and reads
  `reasoning_content` / `reasoning` / `reasoning_text`.
- Credentials: `credentials.resolve(credentialRef(apiKeyEnv))`, launch environment as
  fallback; absence is a loud `MISSING_CREDENTIAL`.
- Multimodal true-send: image → `image_url` data URI, audio → `input_audio`,
  video → `video_url` (20 MB inline cap), PDF → OpenAI `file` part. Bytes come from the
  attachment service (`readImage` / `readFileStream`).
- **Modality gate**: before anything is read or sent, every media block in the FULL
  history is checked against the model's llm-pi-ai `input` declaration; an undeclared
  modality is refused loudly (`INVALID_REQUEST`, naming the modality). The gate replaces
  the host's silent projection-to-text with an explicit refusal on taken-over routes.
  The declaration is a capability claim — check the endpoint's actual support before
  checking a modality (e.g. some gateways reject PDF outright).
- One-shot calls (`purpose: 'session-title'`) strip media blocks and never think.
- Non-media file attachments (e.g. `.txt`) have no cross-gateway wire shape; on
  taken-over routes they degrade to a text placeholder (their content remains reachable
  through the file tools).

## 4. Engineering discipline

- Plugin = standalone git repo; breaking the plugin = revert the plugin repo and
  redeploy — never touch the instance state.
- **Verification discipline**: dispatch-time rewrites (prompt source) must NOT be
  verified against the trajectory system-prompt panel (it renders assembly-time
  persistent prompts, not the wire). Use behavioral discrimination (a discriminative
  system prompt: have the model self-check a tool prefix and answer by the result).
  The trajectory panel only verifies assembly-layer artifacts.
- Peer contract: `@deepseek-ai/dsh-*` packages are runtime-provided (never
  `dependencies`); the enum covers every existing rc of the supported lines
  (`0.1.7-rc.1 || 0.1.7-rc.2 || 0.2.0-rc.1 || 0.2.0-rc.2`), written identically at all
  three gate points (package.json engines, dsh.plugin.json engines, peerDependencies) —
  a cross-line RANGE is a false claim (semver prerelease matching only hits same-tuple
  comparators). Widen only with a host-matrix run.
- `settings.get(ns)` does not exist on any supported host — reads go through
  `describe()` (`src/settings-read.ts`); writes through `settings.update(ns, patch)`
  with schema validation at the write site.
