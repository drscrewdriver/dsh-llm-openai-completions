# Install Guide (Official DSH CLI)

This guide uses only the official DSH `dsh plugin` command.

- [English install guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [English README](./README.en.md)
- [中文 README](./README.zh.md)
- [日本語 README](./README.ja.md)
- [한국어 README](./README.ko.md)

## 1. Official installation

Install the latest version:

```bash
dsh plugin --profile web add dsh-llm-openai-completions -w
```

Restart DSH afterwards.

## 2. Verify installation

Check the composition:

```bash
dsh --profile web --dump-default-config
```

It should contain `llm-openai-completions` in the composed tree.

## 3. Troubleshooting

| Symptom | Action |
| --- | --- |
| `dsh` is not found | Install or enable the official DSH CLI. |
| Plugin shows as "disabled" | Check the profile composition. |
| Custom gateway returns `Unexpected message role` | Verify `llm-openai-completions` is enabled in `cordis.patch.yml`. |
| Thinking text mixed into body | Confirm `compat.thinkingFormat` is set correctly for your model. |

## 4. Remove

```bash
dsh plugin --profile web remove dsh-llm-openai-completions
```

Restart DSH afterwards.
