# dsh-llm-openai-completions

> ✅ **0.3.0 复活（2026-10-05）。** 传输接管回归，带着 pi-ai 给不了的真功能：多模态真发（图片/音频/视频/PDF）+ 模态硬门禁、面向 dsh-promptbook 类消费方的 `llmOpenaiCompletions` 提示词源口子、凭据服务密钥，以及 `0.1.0-rc.8` – `0.2.0-rc.2` 全 rc 动态兼容。旧的 `settings.get` 世代架构已退役——判定为 `enabled && (手工 ∪ 自动识别)`，开关就在本插件自己的设置区。契约面：[AGENTS.md](./AGENTS.md)。

**定位**：作为 dsh-thinking-levels 可挂接的短路后端复活——按路由 `api` 声明支持三种主流 API 格式（OpenAI Chat Completions 已实装；**Anthropic Messages 与 OpenAI Responses 为下一站**），主要为小米 MiMo 多模态打造：音视频与 PDF 真发。

## 说明文档 / README languages

[English](./README.md) · 中文 · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [Deutsch](./README.de.md) · [Español](./README.es.md) · [Français](./README.fr.md) · [Italiano](./README.it.md) · [Русский](./README.ru.md)

安装指南：[EN](./INSTALL.md) · [中文](./INSTALL.zh.md) · [日本語](./INSTALL.ja.md) · [한국어](./INSTALL.ko.md) · [DE](./INSTALL.de.md) · [ES](./INSTALL.es.md) · [FR](./INSTALL.fr.md) · [IT](./INSTALL.it.md) · [RU](./INSTALL.ru.md) — [更新日志](./CHANGELOG.md)

**面向自定义网关的 OpenAI-completions 兼容传输接管**（vLLM / LM Studio / 自托管 OpenAI 代理）：插件对被接管路由短路 `llm/stream` 瀑布，用从不猜测的行为服务它们——数据面（baseURL / models / `reasoningEfforts` / `compat` / `input`）留在 **llm-pi-ai**，经 `settings.describe()` 实时读取。

- `system` **永远**是 `role: "system"`——自定义网关绝不收到 `developer`，开启思考也不会再触发 `Unexpected message role` 400（pi-ai 的 `detectCompat` 对非标准 URL 默认 `supportsDeveloperRole: true`，一旦模型带 `reasoningEfforts` 表就打挂所有自定义网关）。
- 思考由模型的 `compat.thinkingFormat` 驱动：
  - toggle 型模型（带 `reasoningEfforts` 表、无 `supportsReasoningEffort`）→ 恒发 `chat_template_kwargs.enable_thinking`（+ preserve），无视配置格式——裸 vLLM 的 Qwen3 模板只认这个
  - `qwen` → 顶层 `enable_thinking: boolean`（不发 `reasoning_effort`、不发预算）
  - `qwen-chat-template` → `chat_template_kwargs.enable_thinking`（+ preserve）
  - effort 型 → `reasoning_effort` 透传（Qwen3.8 风格）
- 接收侧拆分 Qwen3 风格 `</think>` 内容（vLLM 把思考渲染进 `content`、无 `reasoning_content` 字段）为 reasoning 块，并认 `reasoning_content` / `reasoning` / `reasoning_text` 三字段。
- 刻意不发 `thinking_budget`（避免截断意外）。

## 🎉 0.3.0 — 多模态真发 + 模态硬门禁

短路消费瀑布发生在宿主把 file 块投影成文本句柄**之前**，媒体以结构块抵达并直接编码上线——零宿主补丁、零句柄重建：

- **图片** → `image_url` data-URI 段（多图保序、文本按源顺序交错）
- **音频** → `input_audio` 段（base64 + 格式）
- **视频** → `video_url` data-URI 段（内联上限 20 MB）
- **PDF** → OpenAI `file` 段
- **模态硬门禁**：发送前对全量历史的每个媒体块按模型 llm-pi-ai `input` 声明逐块校验；未声明模态被**大声拒绝**（`INVALID_REQUEST`，指明模态名），而不是静默降级成文本。
- 一次性调用（`session-title`）剥离媒体块且从不思考。
- 字节来自附件服务（`readImage` / `readFileStream`）；非视觉模型遇图依旧大声拒绝（`UNSUPPORTED_CONTENT`）。

## 🎉 0.3.0 — `llmOpenaiCompletions` 提示词源口子

`ctx.provide("llmOpenaiCompletions", { listHostedModels, registerPromptSource })`——与 dsh-llm-mimo 的 `llmMimo` 同款契约，面向 dsh-promptbook 类消费方：按 `(provider, model)` 替换**实际下发**的系统提示词与工具描述，确定性纯函数（缓存安全）、只改文本（绝不碰 `name`/`parameters`）、无注册源零行为。作用域保证：只在被接管路由的 dispatch 内生效。完整契约：[AGENTS.md §1](./AGENTS.md)。

## 接管判定（单一事实源）

```
takeover(route) = section.enabled === true
                  && (section.providers ∪ 自动识别).includes(route)
自动识别 = 自定义 openai-completions 网关 且 声明了思考
```

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml（或 设置 → 插件 → dsh-llm-openai-completions）
llm-openai-completions:
  enabled: true
  providers:        # 手工名单，叠加在自动识别集之上（可选）
    - local-35b
```

- 开关与手工名单在本插件**自己的设置区**（`.volatile()`——运行时可改，宿主自动生成表单）。
- **dsh-thinking-levels 的 `takeover` 开关是控制层 master**：翻转时把 `{enabled}` 镜像写进本 section；镜像永不碰手工 `providers` 名单。
- 关掉开关（或卸载插件）即原样回落 pi-ai——没有需要回退的 adapter 注册。
- 你的 llm-pi-ai 配置原样保留（一份共享配置；本适配器只读——字段全表：[docs/settings-spec.md](docs/settings-spec.md)，接管契约：[docs/takeover-spec.md](docs/takeover-spec.md)）：

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
            thinkingFormat: qwen        # 只发 enable_thinking，不发 reasoning_effort
```

## 预览

实况截图——**与 dsh-thinking-levels 联动**：自定义模型的"可思考"档位下拉（默认/关/开），演示能力检测 → 接管链路：

<figure>
  <img style="max-width:100%" alt="自定义模型思考档位下拉（Qwen3.6-35B-A3B，默认/关/开）：检测 + 接管链路——dsh-thinking-levels 能力卡在 llm-pi-ai 模型条目写入 input/reasoningEfforts/compat，本适配器读取并接管线缆行为（compat.thinkingFormat: qwen→enable_thinking，effort 型→reasoning_effort 透传）" src="assets/自定义模型的可思考.png" />
  <figcaption>能力卡 + 接管链路：一份共享 llm-pi-ai 配置——<strong>卡片检测</strong>（写入 input/reasoningEfforts/compat），<strong>传输接管线缆</strong>（按 compat.thinkingFormat 发 enable_thinking / reasoning_effort）。</figcaption>
</figure>

## 安装

宿主兼容：**`0.1.0-rc.8` 至 `0.2.0-rc.2` 的每个 rc**，代码内按版本条件兼容（形状检测的 settings 面、`ToolCallId`/`CallId` shim、凭据 credentials → 启动环境 → `process.env` 三级链）。全部安装途径见[安装指南](./INSTALL.zh.md)：

```bash
# npm（推荐）
dsh plugin --profile web add dsh-llm-openai-completions -w
# 本地 tgz
dsh plugin --profile web add /路径/dsh-llm-openai-completions-0.3.0.tgz -w
dsh web
```

## 已知边界

- **PDF 支持因端点而异**（MiMo chat 直接 400，部分中转接受）——`input` 声明是能力声明；勾选 `pdf` 前先确认你的端点。
- **非媒体文件附件**（如 `.txt`）没有跨网关线缆形状；被接管路由上退化为文本占位（内容仍可经文件工具读取）。
- **不发 `thinking_budget`**（刻意）。
- 思考档位**选择器**仍来自模型推理元数据（llm-pi-ai + dsh-thinking-levels）；本传输只管线缆行为。
- 安装后重启 `dsh web`；接管监听在 boot 时组合。

## 开发

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest（config / identify / serialize / sse / translate / prompt-source / version-conditional）
npm run build       # tsc → lib/
node scripts/audit-host-faces.mjs   # 15-rc 依赖面审计
```

## 上游建议

本插件同时是 llm-pi-ai / pi-ai 兼容缺口的参考实现：自定义 URL 应默认 `supportsDeveloperRole: false`、接收侧应拆分 `</think>` 内容、`compat` 应为真正支持它的网关暴露 `supportsDeveloperRole`——宿主投影层也可以长出与本插件按路由施加的同等的能力感知 file 块门禁。
