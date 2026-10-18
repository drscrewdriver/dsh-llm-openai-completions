# dsh-llm-openai-completions

> ✅ **Revived as 0.3.0 (2026-10-05).** The transport takeover is back with real features pi-ai cannot offer: multimodal true-send (image/audio/video/PDF) with a modality hard gate, an `llmOpenaiCompletions` prompt-source seam for dsh-promptbook-class consumers, credentials-service keys, and full-rc dynamic compatibility across `0.1.0-rc.8` – `0.2.1-rc.2`. The old `settings.get`-era architecture is gone — the judgment is `enabled && providers.includes(route)` (pure manual membership: the per-route checkbox is the truth), and the switch lives in this plugin's own settings section. Contract surfaces: [AGENTS.md](./AGENTS.md).

**Positioning**: revived as a short-circuit backend that dsh-thinking-levels can drive — speaking **all three mainstream API formats** per route `api` declaration (OpenAI Chat Completions · Anthropic Messages · OpenAI Responses), built primarily for Xiaomi MiMo multimodal: true audio/video/PDF send.

## README languages / 说明文档

English · [中文](./README.zh.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [Deutsch](./README.de.md) · [Español](./README.es.md) · [Français](./README.fr.md) · [Italiano](./README.it.md) · [Русский](./README.ru.md)

Install guides: [EN](./INSTALL.md) · [中文](./INSTALL.zh.md) · [日本語](./INSTALL.ja.md) · [한국어](./INSTALL.ko.md) · [DE](./INSTALL.de.md) · [ES](./INSTALL.es.md) · [FR](./INSTALL.fr.md) · [IT](./INSTALL.it.md) · [RU](./INSTALL.ru.md) — [Changelog](./CHANGELOG.md)

**OpenAI-completions-compatible transport takeover for custom gateways** (vLLM / LM Studio / self-hosted OpenAI proxies): the plugin short-circuits the `llm/stream` waterfall for taken-over routes and serves them with behavior that never guesses — the data plane (baseURL / models / `reasoningEfforts` / `compat` / `input`) stays in **llm-pi-ai**, read live through `settings.describe()`.

- `system` is **always** `role: "system"` — a custom gateway never receives `developer`, so the `Unexpected message role` 400 is gone even when thinking is enabled (pi-ai's `detectCompat` defaults `supportsDeveloperRole: true` for non-standard URLs, which breaks every custom gateway once a `reasoningEfforts` table marks the model as reasoning).
- Thinking is driven by the model's `compat.thinkingFormat`:
  - toggle models (`reasoningEfforts` table, no `supportsReasoningEffort`) → `chat_template_kwargs.enable_thinking` (+ preserve) — always, regardless of the configured format, because that is what bare vLLM Qwen3 templates honor
  - `qwen` → top-level `enable_thinking: boolean` (no `reasoning_effort`, no budget)
  - `qwen-chat-template` → `chat_template_kwargs.enable_thinking` (+ preserve)
  - effort-capable → `reasoning_effort` passthrough (Qwen3.8-style)
- The receive side splits Qwen3-style `</think>` content (vLLM renders thinking into `content` with no `reasoning_content` field) into a reasoning block, and reads `reasoning_content` / `reasoning` / `reasoning_text`.
- No `thinking_budget` is sent (deliberate: avoid truncation surprises).

## 🎉 0.3.0 — Multimodal true-send with a modality hard gate

The short-circuit consumes the waterfall **before** the host projects file blocks to text handles, so media arrives structural and is encoded for the wire — no host patches, no file-handle reconstruction:

- **image** → `image_url` data-URI parts (multi-image count and order preserved, text interleaved in source order)
- **audio** → `input_audio` parts (base64 + format)
- **video** → `video_url` data-URI parts (20 MB inline cap)
- **PDF** → OpenAI `file` parts
- **Modality hard gate**: every media block in the full history is checked against the model's llm-pi-ai `input` declaration before anything is read or sent; an undeclared modality is refused loudly (`INVALID_REQUEST`, naming the modality) instead of being silently degraded to text.
- One-shot calls (`session-title`) strip media blocks and never think.
- Bytes come from the attachment service (`readImage` / `readFileStream`); non-vision models still reject images loudly (`UNSUPPORTED_CONTENT`).

## 🎉 0.3.0 — The `llmOpenaiCompletions` prompt-source seam

`ctx.provide("llmOpenaiCompletions", { listHostedModels, registerPromptSource })` — the same contract dsh-llm-mimo exposes as `llmMimo`, for dsh-promptbook-class consumers: replace the **actually dispatched** system prompt and tool descriptions per `(provider, model)`, deterministically (cache-safe), text-only (never `name`/`parameters`), zero behavior with no source registered. Scope guarantee: consulted only on taken-over routes. Full contract: [AGENTS.md §1](./AGENTS.md).

## Three wire faces (per-route `api`)

| face | endpoint | auth | thinking | modalities |
|---|---|---|---|---|
| `openai-completions` (default) | `{base}/chat/completions` | Bearer | thinkingFormat matrix | image/audio/video/pdf |
| `anthropic-messages` | `{base}/v1/messages` | `x-api-key` + version header | off/one-shot → disabled | **image only** |
| `openai-responses` | `{base}/responses` | Bearer | `reasoning.effort` (honest fold) | image/audio/video/pdf |

- Every face: `max_tokens` = request value → model row → route default → 8192; the leading system message is extracted into the face's system channel and stripped from the message list.
- Anthropic pairing discipline: tool_use/tool_result must pair (broken history = loud `INVALID_REQUEST`); assistant thinking is not replayed (no signature in the harness — strictly weaker than the chat face).
- Responses boundaries: `stop` dropped (no Responses spelling); reasoning effort folds honestly; probe calibration pending against real MiMo endpoints.

## Takeover judgment (single source of truth)

```
takeover(route) = section.enabled === true
                  && section.providers.includes(route)
```

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml (or Settings → Plugins → dsh-llm-openai-completions)
llm-openai-completions:
  enabled: true
  providers:        # the takeover list — the single truth (see below)
    - local-35b
```

- The switch and the takeover list live in **this plugin's own settings section** (`.volatile()` — runtime-editable, host-generated form).
- **dsh-thinking-levels drives both fields**: its `takeover` switch mirrors `{enabled}` into this section, and its model panel's per-route takeover checkbox writes `providers` directly — the checkbox is the truth, so dispatch, `listHostedModels`, and the control layer's gating all read one set.
- Disabling the switch (or unmounting the plugin) falls through to pi-ai unchanged — no adapter registration to unwind.
- Your llm-pi-ai config stays as-is (one shared config; this adapter only reads it — full field table: [docs/settings-spec.md](docs/settings-spec.md), takeover contract: [docs/takeover-spec.md](docs/takeover-spec.md)):

```yaml
llm-pi-ai:
  providers:
    local-35b:
      api: openai-completions
      baseURL: http://192.168.100.242:8200/v1
      models:
        - id: Qwen3.6-35B-A3B
          reasoningEfforts: { off: null, high: 'high' }
          compat:
            thinkingFormat: qwen        # enable_thinking only, no reasoning_effort
```

## Preview

Live screenshot — **powered together with dsh-thinking-levels**: the custom model's "thinkable"
level dropdown (Default / Off / On). It demonstrates the capability-detection → takeover chain:

<figure>
  <img style="max-width:100%" alt="Custom model thinking-level dropdown (Qwen3.6-35B-A3B, options Default/Off/On): the detection + takeover chain — the dsh-thinking-levels capability card writes input/reasoningEfforts/compat on the llm-pi-ai model entry, then the dsh-llm-openai-completions adapter reads them and takes over the wire behavior (compat.thinkingFormat: qwen→enable_thinking, effort-capable→reasoning_effort passthrough)" src="assets/自定义模型的可思考.png" />
  <figcaption>Joint capability card + takeover chain with dsh-thinking-levels: one shared llm-pi-ai config — the <strong>card detects</strong> (writes input/reasoningEfforts/compat), the <strong>transport takes over the wire</strong> (sends enable_thinking / reasoning_effort per compat.thinkingFormat).</figcaption>
</figure>

## Install

Host compatibility: **every rc from `0.1.0-rc.8` through `0.2.1-rc.2`**, version-conditional in code (shape-detected settings faces, a `ToolCallId`/`CallId` shim, credentials → launch-environment → `process.env` key resolution). See the [install guide](./INSTALL.md) for all routes:

```bash
# npm (recommended)
dsh plugin --profile web add dsh-llm-openai-completions -w
# local tgz
dsh plugin --profile web add /path/to/dsh-llm-openai-completions-0.3.0.tgz -w
dsh web
```

## Known limitations

- **PDF support is endpoint-dependent** (MiMo chat rejects it outright; some relays accept it) — the `input` declaration is a capability claim; check your endpoint before declaring `pdf`.
- **Non-media file attachments** (e.g. `.txt`) have no cross-gateway wire shape; on taken-over routes they degrade to a text placeholder (content stays reachable through the file tools).
- **No `thinking_budget`** (deliberate).
- The thinking-level **selector** still comes from the model's reasoning metadata (llm-pi-ai + dsh-thinking-levels); this transport controls the wire behavior only.
- Restart `dsh web` after install; the takeover listener composes at boot.

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest (config / identify / serialize / sse / translate / prompt-source / version-conditional)
npm run build       # tsc → lib/
node scripts/audit-host-faces.mjs   # 15-rc dependency-surface audit
```

## Upstream proposal

This plugin doubles as a reference implementation for the llm-pi-ai / pi-ai
compatibility gaps: custom URLs should default `supportsDeveloperRole: false`,
the receive side should split `</think>` content, `compat` should expose
`supportsDeveloperRole` for gateways that genuinely support it — and the host
projection layer could grow the same capability-aware file-block gate this
plugin applies per route.
