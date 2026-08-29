# 自定义 api 类型为 openai-completions 时，默认接受 supportsDeveloperRole 为 true，导致改造自定义 API 支持思考困难

## 一、背景

dsh-thinking-levels 插件要为自定义 LLM（`llm-pi-ai` / `openai-completions` 路由，如本地 vLLM 部署的 Qwen3.6-35B-A3B）提供思考能力配置：视觉模型识别、思考开关（`enable_thinking`）、thinking effort 档位（Qwen3.8 类）。这需要在 `llm-pi-ai` 的模型配置里声明 `reasoningEfforts` 表，使 pi-ai 把模型判定为推理模型（`model.reasoning = true`），从而驱动 `enable_thinking` / `reasoning_effort` 的序列化。

## 二、现象

给本地 Qwen3.6 模型声明 `reasoningEfforts: { off: null, high: 'high' }` 开启思考后，**每个请求** 直接失败：

```
400 {"message":"Unexpected message role.","type":"BadRequestError","param":null,"code":400}
```

关闭思考（`reasoningEfforts: false` 或完全不配置）则一切正常，只是模型不思考。

实测复现：直接向 vLLM 1.3.0 发送 `role: "developer"` 的 system 消息 → 一模一样的 400；`role: "system"` → 正常。

## 三、根因

pi-ai 的 openai-completions 序列化（`dist/api/openai-completions.js`）决定 system prompt 的角色：

```js
const useDeveloperRole = model.reasoning && compat.supportsDeveloperRole;
const role = useDeveloperRole ? "developer" : "system";
```

两个条件**同时为真**才使用 `developer` 角色：

1. **`model.reasoning = true`**：由 `llm-pi-ai` 从 `reasoningEfforts` 表解析（`catalog.ts resolveModelReasoning`）——这是"开启思考"的直接后果，也是驱动 `enable_thinking` 的前提，**无法省略**。
2. **`compat.supportsDeveloperRole = true`**：由 pi-ai 的 `detectCompat` 按 provider/URL 猜测：

```js
supportsDeveloperRole: isOpenRouterDeveloperRoleModel || (!isNonStandard && !isOpenRouter),
```

`isNonStandard` 名单（deepseek.com、openai 竞品网关、cerebras/xai 等）**不包含自定义 IP / 自建网关**——所以任何 `openai-completions` 自定义 baseURL（本地 vLLM、LM Studio、自建代理）都会命中 `!isNonStandard && !isOpenRouter`，**默认 `supportsDeveloperRole = true`**。

于是：自定义网关 + 开启思考 → `true AND true` → system 被序列化为 `role: "developer"` → vLLM 等网关拒绝 → 400。

## 四、为什么 DeepSeek v4 没有这个问题

1. 官方 `deepseek-official` 路由走 `llm-deepseek` 适配器，**完全不经过 pi-ai**，序列化直接使用 `role: "system"`，不存在 developer role 逻辑。
2. 即使把 DeepSeek 接到 pi-ai 路由，`detectCompat` 里 `baseUrl.includes("deepseek.com")` 在 `isNonStandard` 名单内 → `supportsDeveloperRole = false` → 仍用 `system`。

所以只有 **"openai-completions 自定义 URL + 开启思考"** 这个组合踩中误判。

## 五、影响面

所有通过 `llm-pi-ai` / `openai-completions` 接入的自定义网关（本地 vLLM、LM Studio、自建 OpenAI 兼容代理等），只要声明 `reasoningEfforts` 开启思考，都会 400。这不是个别模型问题，而是 pi-ai 对未知网关的默认行为与"思考能力必须声明 reasoning 元数据"这一机制的冲突。

## 六、临时缓解（本地补丁，非正式）

补丁 pi-ai `detectCompat` 一行，让自定义 URL 默认回退 `system`：

```js
// 之前：supportsDeveloperRole: isOpenRouterDeveloperRoleModel || (!isNonStandard && !isOpenRouter)
// 之后：仅 OpenAI 官方 URL 或 OpenRouter 特定模型默认 true
supportsDeveloperRole: isOpenRouterDeveloperRoleModel || baseUrl.includes("api.openai.com"),
```

效果：自定义网关默认 `system`，不再触发 developer role；OpenAI 官方不受影响。但这是直接修改依赖文件，升级会被覆盖，且非开发者用户不会自动获得。

## 七、建议的上游修复

1. **pi-ai `detectCompat`**：`supportsDeveloperRole` 应**仅对已知支持该角色的网关**（OpenAI 官方 `api.openai.com`、OpenRouter 特定模型）默认 `true`，未知/自定义 URL 一律默认 `false`——与 `supportsStore`、`supportsStrictMode` 等字段的"非标准即保守"策略保持一致。
2. **llm-pi-ai `compat` 配置**：`compatProfile` 放开 `supportsDeveloperRole` 字段并在 `resolveModelCompat` 透传，给**确实支持** developer role 的自定义网关留显式配置入口（当前 schema 只透传 `thinkingFormat` / `supportsReasoningEffort`，此字段被静默丢弃）。
3. 长期：思考能力（`model.reasoning`）与 system 角色选择（`supportsDeveloperRole`）不应隐式耦合——即使模型支持思考，未知网关也应默认 `system`。

## 附：相关但独立的问题

同一部署还暴露了第二个问题：vLLM 1.3.0 把 thinking 渲染进 `content` 流（仅带 `</think>` 结束标签，无 `reasoning_content` 字段），而 pi-ai 接收侧只识别 `reasoning_content` / `reasoning` / `reasoning_text` 字段，导致推理文本混入正文、`</think>` 标签可见。该问题与本文 developer role 无关（即使 role 修复后仍存在），建议 pi-ai 接收侧支持 think 标签分离，或由 vLLM 配置输出 `reasoning_content`。
