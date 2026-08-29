# Progress: 自定义 openai-completions adapter

## 会话日志
| 时间 | 事件 | 结果 |
|---|---|---|
| 2026-08-29 | 确认 registerAdapter 机制存在（ctx.llm.registerAdapter(providers, adapter)，LlmAdapter 仅 stream 必实现） | ✅ |
| 2026-08-29 | 用户确认走 adapter 替换方案（封装成本 + 上游提案） | ✅ |
| 2026-08-29 | 创建 task_plan.md / findings.md / progress.md | ✅ |
| 2026-08-29 | 调研 dsh-thinking-effort（配置层补档位）与 dsh-model-memory（mutate path-op 写 llm-pi-ai + 记忆）——两者均未解决 developer role / think 标签 | ✅ |
| 2026-08-29 | 撤销 pi-ai 两个补丁（恢复 .bak-devrole 原始），实测原始 pi-ai 三场景 | ✅ |
| 2026-08-29 | **实测结论（撤销补丁后）**：A) reasoning=true（开思考写表）→ system role = developer（vLLM 会 400）；B) reasoning=false → system；C) content 含 `</think>` → 未分离（text_delta="Let me think</think>9.8 is larger."） | ✅ |
| 2026-08-29 | 用户要求保留上下文，亲自关闭 thinking-levels 验证 | 进行中 |

## 错误记录
| 错误 | 尝试 | 解决 |
|---|---|---|
| ESM loader Windows 'c:' 协议 | node --import register.mjs | 改用本地 SSE 服务器真实链路（verify-pi-ai-original-e2e.mjs） |

## 当前状态
- pi-ai = **原始（两个补丁已撤销）**，备份 `.bak-devrole` 保留
- dsh-thinking-levels 代码在分支 feat/v0.5.0-model-capabilities（5 commit）
- **dsh-llm-openai-completions 已实现并验证**：
  - src/adapter/{sse,serialize,translate,config,adapter}.ts + src/index.ts（包装 llm-pi-ai adapter.stream，llm/adapters-updated 重包）
  - 19 单测全过 + typecheck + build
  - E2E（本地 SSE 服务器模拟 vLLM）：system role、enable_thinking、`</think>` 分离、usage/finish 全部正确
  - git 分支 feat/openai-completions-adapter（commit c5d0e41 + b3a4db7）
- 待办：真实 vLLM 部署验证（装进 profile + 启用 + 重启 dsh）
