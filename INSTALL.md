# Install Guide (Official DSH CLI)

> ✅ **Revived as 0.3.0 (2026-10-05).** This guide covers the revived transport takeover — full-rc dynamic compatibility from `0.1.0-rc.8` through `0.2.1-rc.2`.

This guide uses only the official DSH `dsh plugin` command.

Install guides: [EN](./INSTALL.md) · [中文](./INSTALL.zh.md) · [日本語](./INSTALL.ja.md) · [한국어](./INSTALL.ko.md) · [DE](./INSTALL.de.md) · [ES](./INSTALL.es.md) · [FR](./INSTALL.fr.md) · [IT](./INSTALL.it.md) · [RU](./INSTALL.ru.md)

READMEs: [EN](./README.md) · [中文](./README.zh.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [DE](./README.de.md) · [ES](./README.es.md) · [FR](./README.fr.md) · [IT](./README.it.md) · [RU](./README.ru.md)

## 1. Install

```bash
# npm (recommended)
dsh plugin --profile web add dsh-llm-openai-completions -w
# from a local tgz (offline / pre-release builds)
dsh plugin --profile web add /path/to/dsh-llm-openai-completions-0.3.0.tgz -w
dsh web
```

On DSH Desktop: **Plugins → Add plugin → paste the npm name, a GitHub URL, or an absolute local path** (a `file:` prefix copies; a bare path links), then enable and fully restart the desktop app.

## 2. Verify installation

Check the composition:

```bash
dsh --profile web --dump-default-config
```

It should contain `llm-openai-completions` in the composed tree. After boot, the log line `[llm-openai-completions] short-circuit listener registered (prepend+global)` confirms the waterfall listener is in place.

## 3. Turn it on

The switch lives in the plugin's own settings section (default **off** — nothing is taken over until you flip it):

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml (or Settings → Plugins → dsh-llm-openai-completions)
llm-openai-completions:
  enabled: true
  providers:        # optional manual list on top of the auto-identified set
    - local-35b
```

Routes enter the takeover list through the per-route checkbox in dsh-thinking-levels' model panel (it writes `providers` directly) or by hand-editing the list; the `takeover` switch there mirrors into `enabled` when flipped.

## 4. Troubleshooting

| Symptom | Action |
| --- | --- |
| `dsh` is not found | Install or enable the official DSH CLI. |
| Plugin shows as "disabled" | Check the profile composition. |
| `MISSING_CREDENTIAL` | Store the route's `apiKeyEnv` reference through the credentials service (the web Models page writes it) or export it in the launching environment. |
| `does not declare "<modality>" input` | The modality hard gate refused an attachment the model does not declare — add the modality to the model's `input` in llm-pi-ai, or switch models. |
| Custom gateway returns `Unexpected message role` | Confirm the route is actually being taken over (`enabled: true` and the route identified or listed). |
| Thinking text mixed into body | Confirm `compat.thinkingFormat` is set correctly for your model. |

## 5. Remove

```bash
dsh plugin --profile web remove dsh-llm-openai-completions
```

Restart DSH afterwards — pi-ai serves every route unchanged (there is no adapter registration to unwind).
