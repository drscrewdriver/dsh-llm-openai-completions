# task_plan.md — dsh-llm-openai-completions 对接 GitHub + 短路设置规约

## Goal
1. 把本地 `dsh-llm-openai-completions` 对接到 `https://github.com/drscrewdriver/dsh-llm-openai-completions`（空仓库）
2. 保证有 **openai-completions 短路设置规约**（`llm-openai-completions` 命名空间 `{ enabled, providers }` 的正式规格文档）

## 现状
- 本地分支 `feat/openai-completions-adapter`，HEAD `5f6e879`，工作树干净
- 历史含 4 个 debug 提交（84b35a4 / 6f77845 / 6ea4a60 为临时诊断，662553f 为正式 fix）
- `src/index.ts` 仍保留"临时运行时诊断"debug 函数（写 `llm-openai-completions-debug.json`）——不适合进公共仓库
- 短路设置规约已实现（`llm-openai-completions` ns：enabled + providers），README 有 Enable 一节，但**无正式 SPEC 文档**
- GitHub 仓库 `drscrewdriver/dsh-llm-openai-completions` 空仓库（默认分支 main）

## Phases
- [ ] **Phase 1 调研**：读本地全部源码（index/config/adapter/serialize/sse/translate + 测试）；确认短路规约实现细节（已完成）
- [ ] **Phase 2 规约文档**：写 `docs/settings-spec.md`（短路设置规约：命名空间、字段、语义、短路行为、与 llm-pi-ai/thinking-levels 联动、配置示例）；README 引用
- [ ] **Phase 3 代码清理**：移除 index.ts 临时 debug 诊断代码；确认无遗留
- [ ] **Phase 4 历史与验证**：typecheck/lint/test/build；决定历史清理（squash debug 提交？）
- [ ] **Phase 5 推送**：关联 remote + 推送到 GitHub（main 或分支）

## Decisions
- （待与用户确认历史清理与分支策略）

## Errors
| Error | Attempt | Resolution |
|-------|---------|------------|
| （待记录） | | |
