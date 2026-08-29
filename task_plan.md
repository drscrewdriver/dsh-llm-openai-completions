# Task Plan: dsh-llm-openai-completions —— 独立 openai-completions 适配器插件

## Goal
独立插件注册/接管 openai-completions 兼容的 provider 路由（vLLM / LM Studio / 自建网关），自实现序列化（system 永远 role:"system"、enable_thinking / chat_template_kwargs / reasoning_effort）与流解析（`</think>` 分离），让所有用户装插件即用自定义 API + 思考（无补丁、不依赖 pi-ai 行为猜测）；同时作为对 llm-pi-ai/pi-ai 上游的兼容性提案参考实现。

## Current Phase
Phase 3（实现中，已确认注册方式）

## Phases

### Phase 1: 调研（complete）
- LlmAdapter 契约（stream 唯一抽象方法）、StreamChunk 协议、registerAdapter（DUPLICATE_ADAPTER 冲突）、replayState、序列化/流解析范本（llm-deepseek serialize/sse/translate）
- 实测：原始 pi-ai 三场景——A) reasoning=true → developer role（400）；B) reasoning=false → system；C) `</think>` 未分离
- 调研 dsh-thinking-effort（配置层补档位）/ dsh-model-memory（mutate path-op 写 llm-pi-ai）——均未解决 developer role / think 标签

### Phase 2: 设计（complete）
- **注册方式**：两种可选——
  - A) **包装 llm-pi-ai 已注册 adapter 的 stream**（保留 llm-pi-ai 配置，用户零迁移；llm/adapters-updated 重包）
  - B) **registerAdapter 注册独立 provider 路由**（插件自己声明 provider + baseURL + models，用户从 llm-pi-ai 移除对应 provider 避免 DUPLICATE）
  - 默认 A（零迁移），B 作为进阶
- 序列化规则：system 永远 system、thinkingFormat → enable_thinking / chat_template_kwargs / reasoning_effort、不做 budget
- 流解析：reasoning 三字段 + `</think>` 分离（translate 层）、SSE 手写
- 启用：settings ns `llm-openai-completions`，`{ enabled, providers: string[] }`（默认关、显式列出）

### Phase 3: 实现（in_progress）
- [x] `src/adapter/sse.ts`：手写 SSE 解析（data 行 + 空行 + [DONE]）
- [x] `src/adapter/serialize.ts`：wire 序列化（system/user/assistant/tool、enable_thinking、chat_template_kwargs、reasoning_effort）
- [x] `src/adapter/translate.ts`：wire chunk → StreamChunk（reasoning 三字段 + `</think>` 分离、tool_calls、usage、finish）
- [ ] `src/adapter/config.ts`：模型能力读取（llm-pi-ai settings 或插件自身配置）
- [ ] `src/adapter/adapter.ts`：LlmAdapter 子类（stream：fetch + SSE + translate + 错误分类 + attribution）
- [ ] `src/index.ts`：Config + install（包装 adapter.stream / registerAdapter + llm/adapters-updated）
- [ ] 依赖：@deepseek-ai/dsh-llm 值依赖验证

### Phase 4: 验证
- [ ] 本地 vLLM（Qwen3.6）实连：思考开/关、think 分离、无 400（与原始 pi-ai 对比）
- [ ] 与 dsh-thinking-levels 协作（拦截器 effort 决策 + 自写 adapter 序列化一致性）
- [ ] typecheck / vitest / build

### Phase 5: 打包与提案
- [ ] README：启用方式（A/B）、与补丁/配置层方案对比
- [ ] 上游提案稿（自定义 URL 默认 system role、think 标签分离、compat 放开 supportsDeveloperRole）
- [ ] git 隔离分支 + 提交

## 关键决策记录
| 决策 | 理由 |
|---|---|
| 独立插件 dsh-llm-openai-completions | 适配器是独立关注点；兼作上游提案的参考实现 |
| 默认包装 llm-pi-ai adapter.stream（A） | 用户零迁移（local-35b 配置不动） |
| system 永远 system | 自定义网关默认保险，根治 developer role 400 |
| `</think>` 分离在 translate 层 | 独立于 pi-ai，接收侧根治 |
| 不做 thinking_budget | 用户要求（防截断） |
