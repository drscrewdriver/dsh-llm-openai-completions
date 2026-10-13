# 安装指南（官方 DSH CLI）

> ✅ **0.3.0 复活（2026-10-05）。** 本指南覆盖复活后的传输接管——`0.1.0-rc.8` 至 `0.2.0-rc.2` 全 rc 动态兼容。

本指南只使用官方 `dsh plugin` 命令。

安装指南：[EN](./INSTALL.md) · 中文 · [日本語](./INSTALL.ja.md) · [한국어](./INSTALL.ko.md) · [DE](./INSTALL.de.md) · [ES](./INSTALL.es.md) · [FR](./INSTALL.fr.md) · [IT](./INSTALL.it.md) · [RU](./INSTALL.ru.md)

README：[EN](./README.md) · [中文](./README.zh.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [DE](./README.de.md) · [ES](./README.es.md) · [FR](./README.fr.md) · [IT](./INSTALL.it.md) · [RU](./README.ru.md)

## 1. 安装

```bash
# npm（推荐）
dsh plugin --profile web add dsh-llm-openai-completions -w
# 本地 tgz（离线 / 预发布构建）
dsh plugin --profile web add /路径/dsh-llm-openai-completions-0.3.0.tgz -w
dsh web
```

DSH 桌面版：**插件 → 添加插件 → 粘贴 npm 包名、GitHub 地址或本地绝对路径**（`file:` 前缀为复制式，裸路径为链接式），然后启用并彻底重启桌面端。

## 2. 验证安装

检查组合：

```bash
dsh --profile web --dump-default-config
```

组合树里应含 `llm-openai-completions`。启动后日志出现 `[llm-openai-completions] short-circuit listener registered (prepend+global)` 即确认瀑布监听就位。

## 3. 打开开关

开关在本插件自己的设置区（默认**关**——不翻开就不接管任何路由）：

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml（或 设置 → 插件 → dsh-llm-openai-completions）
llm-openai-completions:
  enabled: true
  providers:        # 手工名单，叠加在自动识别集之上（可选）
    - local-35b
```

路由经 dsh-thinking-levels 模型面板的逐路由勾选框进入接管名单（直接写 `providers`），或手工编辑名单；那里的 `takeover` 开关翻转时镜像写入 `enabled`。

## 4. 故障排查

| 症状 | 处理 |
| --- | --- |
| 找不到 `dsh` | 安装或启用官方 DSH CLI。 |
| 插件显示"已禁用" | 检查 profile 组合。 |
| `MISSING_CREDENTIAL` | 把路由的 `apiKeyEnv` 引用存进凭据服务（网页模型页会写入），或在启动环境里导出。 |
| `does not declare "<模态>" input` | 模态硬门禁拒绝了模型未声明的附件——在 llm-pi-ai 的模型 `input` 里补上该模态，或换模型。 |
| 自定义网关返回 `Unexpected message role` | 确认路由真的被接管了（`enabled: true` 且该路由被识别或在名单里）。 |
| 思考文本混进正文 | 确认模型的 `compat.thinkingFormat` 配置正确。 |

## 5. 移除

```bash
dsh plugin --profile web remove dsh-llm-openai-completions
```

装后重启 DSH——pi-ai 原样服务每条路由（没有需要回退的 adapter 注册）。
