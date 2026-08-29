# 安装指南（官方 DSH CLI）

本指南只使用官方 `dsh plugin` 命令。

- [安装指南](./INSTALL.zh.md)
- [English install guide](./INSTALL.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [中文 README](./README.zh.md)
- [English README](./README.en.md)
- [日本語 README](./README.ja.md)
- [한국어 README](./README.ko.md)

## 1. 官方安装

安装最新版本：

```bash
dsh plugin --profile web add dsh-llm-openai-completions -w
```

装后重启 DSH。

## 2. 验证安装

检查组合配置：

```bash
dsh --profile web --dump-default-config
```

应在组合树中包含 `llm-openai-completions`。

## 3. 排查

| 症状 | 处理 |
| --- | --- |
| 找不到 `dsh` 命令 | 安装或启用官方 DSH CLI。 |
| 插件显示「已停用」 | 检查 profile 组合。 |
| 自定义网关返回 `Unexpected message role` | 确认 `cordis.patch.yml` 中启用了 `llm-openai-completions`。 |
| thinking 文本混入正文 | 确认 `compat.thinkingFormat` 针对你的模型设置正确。 |

## 4. 卸载

```bash
dsh plugin --profile web remove dsh-llm-openai-completions
```

重启后恢复。
