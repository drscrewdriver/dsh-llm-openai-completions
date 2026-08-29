# dsh-llm-openai-completions

**OpenAI-completions 兼容适配器，用于自定义网关**（vLLM / LM Studio / 自托管 OpenAI 代理）—— 与 `llm-deepseek` 和 `llm-pi-ai` 并列的"第四种适配器类"，行为从不猜测：

- `system` 角色**始终**映射为 `role: "system"`——自定义网关永远不会收到 `developer` 角色，因此即使启用了 thinking，`Unexpected message role` 400 错误也已消失（pi-ai 的 `detectCompat` 为非标准 URL 默认 `supportsDeveloperRole: true`，一旦 `reasoningEfforts` 表标记模型为推理模型，就会破坏所有自定义网关）。
- Thinking 由模型的 `compat.thinkingFormat` 驱动：
  - `qwen` → 发送 `enable_thinking: boolean`（Qwen3.6 风格；无 `reasoning_effort`、无 budget）
  - `qwen-chat-template` → `chat_template_kwargs.enable_thinking`（+ 保留）
  - 具备 effort 能力的 → `reasoning_effort` 透传（Qwen3.8 风格）
- 接收端将 Qwen3 风格的 `</think>` 内容拆分——将 thinking 文本提取为独立的 reasoning block（vLLM 将 thinking 渲染到 `content` 中，无 `reasoning_content` 字段）——不再出现 thinking 文本混入正文。

配置位于 **llm-pi-ai** 设置区（设置 → 模型）：baseURL、models、`reasoningEfforts`、`compat.thinkingFormat`。本插件仅替换你列出的提供者的 wire 行为。

## 安装

```bash
# npm（推荐）
dsh plugin --profile web add dsh-llm-openai-completions -w
# 本地 link（开发）
# dsh plugin --profile web add link:E:/test/rewrite-agently/dsh-llm-openai-completions -w
dsh web
```

## 启用

本插件替换你列出的提供者的流（默认关闭；llm-pi-ai 拥有的现有路由会被包装，而非重新注册，因此不会冲突）。**短路设置契约——`llm-openai-completions` 命名空间、其字段、接管语义和 wire 行为——详见 [docs/settings-spec.md](docs/settings-spec.md)。** 想与本接管机制协作的第三方插件（如 dsh-thinking-effort 控制层）应遵循标准的 **[docs/takeover-spec.md](docs/takeover-spec.md)**（接管控制规范）。

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml（或 设置 → 插件 → dsh-llm-openai-completions）
llm-openai-completions:
  enabled: true
  providers:
    - local-35b
```

你的 `local-35b / Qwen3.6-35B-A3B` 配置在 llm-pi-ai 中保持不变：

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
            thinkingFormat: qwen        # 仅 enable_thinking，无 reasoning_effort
```

## 已知限制 (v0.1.0)

- **纯文本**：图片块被拒绝，返回 `UNSUPPORTED_CONTENT`（图片字节存在于附件服务中，v1 不在范围内）。
- **无 `thinking_budget`**（有意为之：避免截断意外）。
- thinking 级别的**选择器**仍然来自模型的推理元数据（llm-pi-ai + dsh-thinking-levels 的 Off/On 切换）；本插件控制 wire 行为。
- 安装后重启 `dsh web`；wrap 在 `llm/adapters-updated` 时重新应用。

## 开发

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest（serialize / sse / translate）
npm run build       # tsc → lib/
```

E2E 检查：`node <repo>/scripts/...` 或 tests 中的本地 SSE 服务器测试工具（system 角色 / enable_thinking / `</think>` 拆分针对模拟 vLLM）。

## 上游提案

本插件同时作为 llm-pi-ai / pi-ai 兼容性差距的参考实现：自定义 URL 应默认 `supportsDeveloperRole: false`，接收端应拆分 `</think>` 内容，`compat` 应暴露 `supportsDeveloperRole` 供真正支持的网关使用。

## License

MIT
