# dsh-llm-openai-completions

- [English README](./README.md)
- [中文 README](./README.zh.md)
- [日本語 README](./README.ja.md)
- [한국어 README](./README.ko.md)
- [Installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [Changelog](./CHANGELOG.md)

**OpenAI-completions-compatible adapter for custom gateways** (vLLM / LM Studio / self-hosted OpenAI proxies) — a "fourth adapter class" next to `llm-deepseek` and `llm-pi-ai`, with behavior that never guesses:

- `system` is **always** `role: "system"` — a custom gateway never receives `developer`, so the `Unexpected message role` 400 is gone even when thinking is enabled (pi-ai's `detectCompat` defaults `supportsDeveloperRole: true` for non-standard URLs, which breaks every custom gateway once a `reasoningEfforts` table marks the model as reasoning).
- Thinking is driven by the model's `compat.thinkingFormat`:
  - `qwen` → wire `enable_thinking: boolean` (Qwen3.6-style; no `reasoning_effort`, no budget)
  - `qwen-chat-template` → `chat_template_kwargs.enable_thinking` (+ preserve)
  - effort-capable → `reasoning_effort` passthrough (Qwen3.8-style)
- The receive side splits Qwen3-style ` response` content (vLLM renders thinking into `content` with no `reasoning_content` field) into a reasoning block — no more thinking text mixed into the body.

## 🎉 Major Feature — Vision/Image Input (v0.2.0)

Vision models can now **receive user-uploaded images — single or multiple** (multi-image order
preserved, text parts interleaved in source order):

- When the target model declares vision capability in its llm-pi-ai config (`input` contains `image`,
  written by the dsh-thinking-levels capability card as `['text','image']`), user `image` content
  blocks are serialized as OpenAI-compatible multi-part `content` arrays — each `image_url` is a
  `data:<mediaType>;base64,<…>` data URI (bytes resolved via the attachment store's `readImage` and
  base64-encoded). Multiple images in one message are supported and kept in order.
- **Non-vision models still reject loudly** (`UNSUPPORTED_CONTENT`) — nothing is silently dropped.
- Requirements: image reading depends on the host providing `ctx.attachments` (attachment store);
  text-only models are unaffected.

Configuration lives in the **llm-pi-ai** section (Settings → Models): baseURL, models,
`reasoningEfforts`, `compat.thinkingFormat`, `input`. This plugin only swaps the wire behavior of the providers you list.

> **Capability detection config**: vision / thinking / reason-effort support / level tiers are all read
> from a model entry's `input` / `reasoningEfforts` / `compat` fields in llm-pi-ai (the base editor does
> **not** expose these fields). They are written by the **dsh-thinking-levels** capability card per user
> action, or edited by hand in `settings.yaml` — one shared config, the adapter just reads it. Full field
> table and wire contract: [docs/settings-spec.md §4.1](docs/settings-spec.md).

## Install

```bash
# npm (recommended)
dsh plugin --profile web add dsh-llm-openai-completions -w
# local link (development)
# dsh plugin --profile web add link:E:/test/rewrite-agently/dsh-llm-openai-completions -w
dsh web
```

## Enable

The plugin replaces the stream of the providers you list (default off; existing
routes owned by llm-pi-ai are wrapped, not re-registered, so no adapter
conflict). **The short-circuit settings contract — the `llm-openai-completions`
namespace, its fields, the takeover semantics, and the wire behavior — is
specified in [docs/settings-spec.md](docs/settings-spec.md).** Third-party
plugins (e.g. a dsh-thinking-effort control layer) that want to interoperate
with this takeover mechanism should follow the standard
**[docs/takeover-spec.md](docs/takeover-spec.md)** (Takeover Control Spec).

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml (or Settings → Plugins → dsh-llm-openai-completions)
llm-openai-completions:
  enabled: true
  providers:
    - local-35b
```

Your `local-35b / Qwen3.6-35B-A3B` config in llm-pi-ai stays as-is:

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

## Known limitations (v0.2.0)

- **Non-vision models do not support images**: a model that does not declare image input (via `input`
  containing `image`) is rejected with `UNSUPPORTED_CONTENT` (image bytes live in the attachment
  service and are only resolved on the vision path).
- **No `thinking_budget`** (deliberate: avoid truncation surprises).
- The thinking-level **selector** still comes from the model's reasoning metadata (llm-pi-ai + dsh-thinking-levels' Off/On toggle); this plugin controls the wire behavior.
- Restart `dsh web` after install; the wrap re-applies on `llm/adapters-updated`.

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest (serialize / sse / translate)
npm run build       # tsc → lib/
```

E2E check: `node <repo>/scripts/...` or the local-SSE-server harness in the
tests (system role / enable_thinking / `</think>` split against a fake vLLM).

## Upstream proposal

This plugin doubles as a reference implementation for the llm-pi-ai / pi-ai
compatibility gaps: custom URLs should default `supportsDeveloperRole: false`,
the receive side should split `</think>` content, and `compat` should expose
`supportsDeveloperRole` for gateways that genuinely support it.
