# Findings: 自定义 openai-completions adapter 调研记录

## 背景（前因）
- 用户经 llm-pi-ai / openai-completions 接本地 vLLM（Qwen3.6-35B-A3B），要支持思考。
- 问题 1：pi-ai `detectCompat` 对自定义 URL 默认 `supportsDeveloperRole=true`；开思考（`reasoningEfforts` 表 → `model.reasoning=true`）→ `useDeveloperRole = model.reasoning && supportsDeveloperRole` → system 发 `role:"developer"` → vLLM 400 `Unexpected message role.`
- 问题 2：vLLM 1.3.0 把 thinking 渲染进 content（仅 `</think>` 结束标签，无 reasoning_content）→ pi-ai 接收侧只认 `reasoning_content/reasoning/reasoning_text` → 推理混进正文。
- 已打 2 个本地补丁（pi-ai openai-completions.js），但非开发者用户不会自动获得 → 决定自写 adapter 插件，装插件即用，兼作上游提案。

## 契约要点
- **LlmAdapter**：唯一抽象方法 `stream(GenerateOptions): AsyncIterable<StreamChunk>`；resolveModel/listModels/providerInfo 有默认实现（llm/src/index.ts L180-233）
- **StreamChunk 协议**：block-start/text-delta/reasoning-delta/tool-call-delta/block-end/usage/finish（BlockAssembler 按 index 关联，同 index 的 text/reasoning-delta 合并进同一块——所以分离 think 必须用不同块）
- **registerAdapter(providers, adapter)**：对已占用 provider 抛 `DUPLICATE_ADAPTER`（all-or-nothing）；返回 disposer + replace()（同一 adapter 换路由）
- **关键决策：不能直接 registerAdapter 接管 local-35b（llm-pi-ai 已注册）** → 改为**包装 llm.adapters Map 里 registration.adapter 的 stream 方法**（保留注册、替换实现；`llm/adapters-updated` 后重新包装）
- **replayState**：llm-pi-ai 用 kind 'pi-ai'/version 2 + blocks 索引对齐；插件可自用简化 kind（历史消息 degrade 到 foreign 仍可用，正确性不受影响）——参考 llm-pi-ai/src/replay.ts foreignAssistant
- **序列化范本**：llm-deepseek adapter.ts `request()`（fetch POST /chat/completions、attributionHeaders()、非 ok → LlmError(httpErrorCode)、parseSse → translate 成 chunks）+ watchdog/consumer 超时模式
- **错误分类码**：AUTH/RATE_LIMIT/INVALID_REQUEST/SERVER/TIMEOUT/TRANSPORT（llm-pi-ai stream.ts classifyPiAiError + llm-deepseek httpErrorCode）

## 待确认
- attributionHeaders() 内容与插件能否值依赖 @deepseek-ai/dsh-llm（解析树风险）——若不达，动态 import + try/catch 跳过
- 插件自写序列化时历史消息（tool-result/reasoning 块）的 wire 映射细节
- settings.get('llm-pi-ai') 的 apiKeyEnv 读取（env 名 → process.env / credentials 服务）

## 范围决策（Phase 2）
- **不 fork 整个 pi-ai**：只实现 openai-completions 单协议（序列化参考 llm-deepseek serialize.ts，流解析参考 llm-deepseek parseSse/translate + 补丁 2 的 `</think>` 逻辑）
- **替换方式**：包装 `llm.adapters.get(provider).adapter` 实例的 `stream` 方法（保留 llm-pi-ai 注册/元数据/retryPolicy，避开 DUPLICATE_ADAPTER）；`llm/adapters-updated` 后重新包装
- **接管范围**：仅启用配置中列出的 provider（默认关，local-35b 类）；xiaomi 等未启用路由仍走 pi-ai
- **附加价值**：插件即上游提案的参考实现（system role 默认、think 标签分离、compat 配置化）

## 实现范本（Phase 3 参考）
- **序列化**：llm-deepseek `serialize.ts`（system/user/assistant/tool wire 映射、tool-result → role:'tool'、tools → type:function、stream_options.include_usage）+ Qwen 差异（system 永远 role:'system'；thinkingFormat qwen → `enable_thinking: bool`；qwen-chat-template → `chat_template_kwargs.enable_thinking`；reasoning_effort 透传）
- **SSE 解析**：llm-deepseek `sse.ts`（eventsource-parser/stream + [DONE] 哨兵 + STREAM_CLOSED）——插件可手写 ~40 行简化版避免依赖
- **StreamChunk 生成**：llm-deepseek `translate.ts`（reasoning 先开块、text 后开块、tool_calls 按 stream index、block-end/usage/finish 延迟到 [DONE]、mapFinishReason/mapUsage、空响应 EMPTY_RESPONSE）——**`</think>` 分离在此层做**（比 pi-ai 内部干净）：content 流缓冲，`</think>` 前 → reasoning 块、后 → text 块
- **attribution**：`attributionHeaders()` = `user-agent: deepseek-harness/version (+url)`（dsh-llm/attribution.ts）；插件需值依赖 @deepseek-ai/dsh-llm 的 LlmError/CallId/常量——依赖解析风险待实现时验证（动态 import + try/catch 兜底）
- **reasoning 字段**：vLLM 可能用 reasoning_content/reasoning/reasoning_text → translate 认全部三个
- **错误分类**：llm-deepseek httpErrorCode + llm-pi-ai classifyPiAiError（400→INVALID_REQUEST 等）

## 设计决策（Phase 2）
- 启用开关：Config `customAdapter: { enabled: false, providers: [] }`（默认关；providers 显式列出要接管的 provider id）
- 序列化读取模型能力：settings.get('llm-pi-ai') → providers[p].models[i].{reasoningEfforts, compat.thinkingFormat, compat.supportsReasoningEffort, input}
- supportsDeveloperRole：插件实现**永远 role:'system'**（自定义网关默认保险）
- thinking_budget：暂不做（用户要求）
- resolveModel：保留 pi-ai 的（efforts 元数据已正确）；插件只替换 stream
- SSE：手写简化解析（data: 行 + 空行 + [DONE]），避免新增依赖
