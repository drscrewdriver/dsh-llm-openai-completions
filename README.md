# dsh-llm-openai-completions

**OpenAI-completions-compatible adapter for custom gateways** (vLLM / LM Studio / self-hosted OpenAI proxies) — a "fourth adapter class" next to `llm-deepseek` and `llm-pi-ai`, with behavior that never guesses:

- `system` is **always** `role: "system"` — a custom gateway never receives `developer`, so the `Unexpected message role` 400 is gone even when thinking is enabled (pi-ai's `detectCompat` defaults `supportsDeveloperRole: true` for non-standard URLs, which breaks every custom gateway once a `reasoningEfforts` table marks the model as reasoning).
- Thinking is driven by the model's `compat.thinkingFormat`:
  - `qwen` → wire `enable_thinking: boolean` (Qwen3.6-style; no `reasoning_effort`, no budget)
  - `qwen-chat-template` → `chat_template_kwargs.enable_thinking` (+ preserve)
  - effort-capable → `reasoning_effort` passthrough (Qwen3.8-style)
- The receive side splits Qwen3-style `</think>` content (vLLM renders thinking into `content` with no `reasoning_content` field) into a reasoning block — no more thinking text mixed into the body.

Configuration lives in the **llm-pi-ai** section (Settings → Models): baseURL, models, `reasoningEfforts`, `compat.thinkingFormat`. This plugin only swaps the wire behavior of the providers you list.

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
specified in [docs/settings-spec.md](docs/settings-spec.md).**

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

## Known limitations (v0.1.0)

- **Text-only**: image blocks are rejected with `UNSUPPORTED_CONTENT` (image bytes live in the attachment service, out of scope for v1).
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
