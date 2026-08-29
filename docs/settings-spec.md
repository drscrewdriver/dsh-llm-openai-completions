# dsh-llm-openai-completions 短路设置规约（Settings Spec）

本文件定义 dsh-llm-openai-completions 的**短路设置规约**：如何声明哪些自定义网关 provider 由本适配器接管（绕过 llm-pi-ai），以及接管的 wire 行为契约。实现与规约保持一致；若实现偏离，以本规约为准并修正实现。

## 1. 命名空间

所有短路配置位于 dsh-settings 命名空间：

```
llm-openai-completions
```

该命名空间由本插件通过 cordis `settings` 服务注册（`src/index.ts` 的 `installSettingsSection`），composition 条目（`cordis.yml` / `cordis.patch.yml` 的 `config:`）作为 `base` 层，运行时命名空间叠加在上。宿主侧对设置的读写经 `settings.get(ns)` / `settings.update(ns, patch)`；读取是**懒解析**的（settings 服务可能晚于插件 apply 注册），每次查找重新读。

## 2. 字段

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `enabled` | `boolean` | `false` | 总开关。`false` 时所有 provider 的流都回落到 llm-pi-ai（不接管）。 |
| `providers` | `string[]` | `[]` | 要接管的路由名（对应 `llm-pi-ai.providers` 下的键），例如 `local-35b`。 |

Schema（与 composition 配置同一套）：

```ts
export const Config = z.object({
  enabled: z.boolean().default(false),
  providers: z.array(z.string()).default([]),
})
```

## 3. 短路行为（takeover）

注册在 `llm/stream` waterfall 上，`prepend` 置于最外层（后执行，最终值生效）：

```
对于每个 llm/stream 调用：
  cfg = settings.llm-openai-completions
  if cfg.enabled AND options.provider ∈ cfg.providers:
      使用本适配器流式接管（adapter.stream(options)），不调用 next()
  else:
      调用 next()，由 llm-pi-ai 原样服务该路由
```

- **短路 = 绕过 pi-ai**：被列出的 provider 的模型请求完全由本插件序列化并流式解析，llm-pi-ai 不参与。
- **未列出 / 未启用 / 插件禁用**：`next()` 回落 pi-ai，原行为不变——接管可随时撤销。
- **不修改 llm.adapters 注册表**：不包装、不重注册任何 adapter 对象，因此没有 registration identity 冲突；模型发现/能力元数据（thinking 选择器）仍走 pi-ai。

## 4. 配置位置

provider 的 baseURL / models / `reasoningEfforts` / `compat.thinkingFormat` / `compat.supportsReasoningEffort` / `input` **仍配置在 llm-pi-ai**（Settings → Models），本插件不复制这些配置，只读取它们的 wire 语义。短路名单本身是独立键空间，写在同一 dsh profile 的命名空间下：

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml 或 Settings → Plugins → dsh-llm-openai-completions
llm-openai-completions:
  enabled: true
  providers:
    - local-35b
```

示例 provider（llm-pi-ai，保持不变）：

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

## 5. Wire 行为契约

接管后，每个被接管 provider 的模型请求按以下契约序列化：

- **system 永远 `role: "system"`**：自定义网关绝不收到 `developer`（pi-ai 对非标准 URL 默认 `supportsDeveloperRole: true` 会 400）。根因之一。
- **思考由模型能力驱动**（toggle vs effort）：
  - **toggle 模型（`supportsReasoningEffort: false`）**：**固定发 `chat_template_kwargs: { enable_thinking, preserve_thinking: true }`**，与 `thinkingFormat` 配置无关——这是 vLLM Qwen3 系列唯一生效的思考开关（顶层 `enable_thinking` 被忽略；llm-pi-ai schema 又 withheld `qwen-chat-template`，故本适配器不依赖该字段）。已对真实 vLLM 网关验证。
  - **effort 模型（`supportsReasoningEffort: true`）**：按 `thinkingFormat` 走——`qwen` → 顶层 `enable_thinking`；`qwen-chat-template` → `chat_template_kwargs`；其它 → `reasoning_effort: <effort>`。
- **思考开关判定**：`thinkingOn = reasoningEffort !== 'off'`——toggle 模型**无 effort 也默认开思考**；显式 `off` 才关闭。
- **`supportsReasoningEffort` 仅显式声明**：裸 `reasoningEfforts` 表（如 `{ off: null, high: 'high' }`）是 toggle-only 模型，wire 固定走 `chat_template_kwargs`，绝不当 effort-capable。与 dsh-thinking-levels 的 `piAiPosture` 完全对齐。
- **`</think>` 分离**：接收侧把 Qwen3 风格的 `</think>` 内容（vLLM 把思考渲染进 `content`）切分到 reasoning 块，不混入正文。
- **不做 `thinking_budget`**（刻意，防截断）。
- **文本优先，不支持图片**：图片块抛 `UNSUPPORTED_CONTENT`。

## 6. 与 dsh-thinking-levels 的自动联动

dsh-thinking-levels（v0.5.2+）会自动维护本命名空间：它扫描 `llm-pi-ai.providers`，识别「自定义 openai-completions 网关（`api: openai-completions` 或非官方 baseURL）且任一模型声明 `reasoningEfforts` 表」的 provider，并入 `providers` 并置 `enabled: true`（保留手动名单、去重）。本插件**软耦合**：命名空间未注册（插件未安装）时联动跳过写入。短路名单的最终控制权在用户手写的 `providers` 数组。

## 7. 错误语义

- 被接管 provider 在 llm-pi-ai 中不存在 / 无 baseURL → `provider "<name>" is not configured for the openai-completions adapter`（`LlmError` `NO_ADAPTER`）。
- HTTP 状态 → 错误码：401/403 → `AUTH`、429 → `RATE_LIMIT`、≥500 → `SERVER`、400 → `INVALID_REQUEST`、其它 → `TRANSPORT`。

## 8. 校验

- `npm run typecheck` — 契约类型与实现一致。
- `npm test` — `tests/config.spec.ts` 锁定短路解析（baseURL/models/vision、未知 provider、无 settings 服务、裸表≠effort-capable、显式标志=effort-capable）。
- 短路名单位置：`src/index.ts`（`llm/stream` prepend 监听器）。
