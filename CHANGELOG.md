# Changelog

## 0.4.4 (2026-10-18)

- hosts: 追加 0.2.1-rc.2 声明面枚举（34/34 @deepseek-ai/* 宿主 peer 逐包 npm 实测 rc.2 在版；本插件不触 ctx.web provider 与 conversation.input.model.label 槽，代码零改动，纯元数据发版；农场 rc.2 格挂账待命）

## 0.4.3 — 宿主 0.2.1-rc.1 补上界（2026-10-17）

### 变更

- **装载判据补齐 `0.2.1-rc.1`**：`engines.dsh`、三个 `@deepseek-ai/dsh-*` peer、`dsh.plugin.json` engines
  统一改为全 16 线精确枚举（`0.1.0-rc.2 … 0.2.1-rc.1`，逐 rc 单列，禁区间/caret）。
- **devDependencies 三 peer 改钉 `0.2.1-rc.1`**：typecheck 真跑在 rc.1 API 上，消除 devDeps 假绿盲区。
- 补 `publishConfig.registry`（钉死 https://registry.npmjs.org）。
- README/INSTALL 兼容句与 `scripts/audit-host-faces.mjs` 矩阵随移至 16 线。
- 无代码行为改动：LLM 序列化面（`options.messages`、`llmOpenaiCompletions` 接缝、`enable_thinking` /
  `</think>` split）在 rc.1 下 typecheck+build+test 全绿，未见断裂。

## 0.4.2 — 视频工具与形状降级（2026-10-13）

### 新增

- **`read_video` 工具**（`src/video-tool.ts`）：把本地视频文件作为原生 file block 附进会话上下文，
  下一轮以 `video_url` data-URI part 交给被接管的模型。工具本身不发 API —— 视频随会话自己的
  模型流量走，计费、凭据、历史留在同一处。定义是手写的编译期 JSON-Schema 子集（与
  `@deepseek-ai/dsh-tools` 的 `defineTool` 同形），所以**不新增 dsh-tools 依赖、peer/engines 矩阵不动**。
  开关 `videoTool`（volatile，默认开）。
- **`modalFallback: 'refuse' | 'mask'`**（`src/adapter/mask.ts`）：当会话历史里有目标模型在选中
  wire face 上带不动的媒体块时，`mask` 用确定性 meta 文本替换它们而不是拒请求；`refuse`（默认）
  保留硬闸。mask 是**请求局部**的：会话历史仍保留结构化块，切回可承载媒体的模型即恢复原生查看。
  执行次序是重点：mask 跑在 `adapter.stream()` 里 **`enforceModalities` 之前**，所以被 mask 的请求
  仍然要过闸（此前把 mask 放在 `serializeRequest` 里是死代码，因为闸先抛异常）。

### 修复

- 双清单同步：`dsh.plugin.json` 停在 `0.4.0` 而 `package.json` 已到 `0.4.1-beta.4`，现两面 `0.4.2`。

### 验证

- `tsc --noEmit` 0 错；vitest 12 文件 / 122 例全绿（含新增 `tests/mask.spec.ts`）；`npm run build` 退 0。
- 兼容性矩阵未动：`engines.dsh` 与 peer 仍为全 15 线枚举（`0.1.0-rc.2 … 0.2.0-rc.2`）。

## 0.4.0 — Three wire faces（已发布，npm `latest` 曾指此版）

- **Per-route wire face from the pi-ai `api` declaration** — the transport now
  speaks all three protocols pi-ai can configure: `openai-completions`
  (default, unchanged), `anthropic-messages`, and `openai-responses`.
- **anthropic-messages face** (mimo-reference): `{base}/v1/messages`,
  `x-api-key` + `anthropic-version` headers, top-level `system` (the leading
  system message is extracted AND stripped — F2), required `max_tokens` with
  the every-request-first chain `options.maxTokens ?? model row ?? route
  default ?? 8192` (F1), `thinking:{type}` mapped from the effort (off /
  one-shot → disabled), tools as `input_schema`, strict tool_use/tool_result
  pairing (broken history = loud `INVALID_REQUEST`), full SSE event family
  (thinking/signature/input_json deltas, message_start/delta usage).
- **openai-responses face** (spec-full, probe calibration pending):
  `{base}/responses`, `instructions`, input items with multimodal parts
  (input_text / input_image / input_audio / input_file pdf), assistant
  tool-call history as `function_call` + tool results as
  `function_call_output` (both host message shapes), honest
  `reasoning.effort` folding (xhigh/max→high; on/off omit), SSE family
  (output_item.added / output_text.delta / function_call_arguments.delta /
  response.completed with usage / response.failed).
- **Face×modality gate intersection**: a modality must be declared by the
  model AND carryable by the face (anthropic = image only — MiMo silently
  drops the rest); refusals name the face.
- Known boundaries: assistant thinking is not replayed on the anthropic face
  (harness reasoning blocks carry no signature — strictly weaker than the
  chat face's reasoning_content passback); `options.stop` has no Responses
  spelling and is dropped; responses wire shapes await live MiMo probe
  calibration.
- max_tokens/model-row symmetry fix also applies to the chat face unchanged
  (options.maxTokens has always won there).


## 0.3.0 — Revival (unreleased)

> **Back from the dead (2026-10-05).** The 2026-10-01 discontinuation was about the
> retired short-circuit *bridge* in dsh-thinking-levels — the official llm-pi-ai compat
> face replaced it for basic wire fixes. This revival is a different deal: the transport
> comes back as a **feature-bearing takeover** (multimodal true-send, modality gate,
> prompt-source seam) that pi-ai cannot offer, with dsh-thinking-levels' takeover gating
> reading this plugin's judgment. The 2026-10-01 notice below is historical.

### Revival — transport takeover, modernized

- **Short-circuit listener, dual-flag**: `llm/stream` with `{ prepend: true, global: true }`.
  The old build registered fiber-locally and never saw LlmRuntime-originated waterfalls on
  current hosts; `global` crosses the fiber boundary. Takeover short-circuits pi-ai
  (`adapter.stream` without `next()`); anything else passes through untouched.
- **Judgment, single source of truth**: `enabled && (manual providers ∪ auto-identified)`
  where auto-identified = custom openai-completions gateway AND thinking declared — the
  identification functions are a same-origin port of dsh-thinking-levels' `takeover-sync.ts`
  (both repos' tests lock the semantics). The switch and manual list live in this plugin's
  own settings section (`.volatile()` — runtime-editable, host-generated form); the
  data plane stays in llm-pi-ai, read per request through `settings.describe()` — the
  0.1.7+ read channel (the old `settings.get(ns)` / `settings.register` faces no longer
  exist on any supported host, which is what killed the original architecture).
- **Multimodal true-send**: the short-circuit consumes the waterfall BEFORE the host
  projects file blocks to text handles, so image / audio / video / PDF blocks arrive
  structural and are encoded (`image_url` / `input_audio` / `video_url` / OpenAI `file`
  data-URI parts) from attachment-service bytes (`readImage` / `readFileStream`), with a
  20 MB inline cap on video. No host patches, no file-handle reconstruction.
- **Modality hard gate**: undeclared modalities are refused BEFORE send
  (`INVALID_REQUEST`, naming the modality) — silent loss is replaced by an explicit
  refusal on taken-over routes. One-shot calls (`session-title`) strip media and never think.
- **The `llmOpenaiCompletions` prompt-source seam** (contract in AGENTS.md, mirroring
  dsh-llm-mimo's llmMimo): `listHostedModels()` + `registerPromptSource()` let a
  dsh-promptbook-class consumer replace the actual system prompt and tool descriptions
  per (provider, model), with cache-safe determinism and a no-source passthrough.
- **Credentials service**: `apiKeyEnv` resolves through `credentials.resolve(credentialRef(…))`
  with launch-environment fallback and a loud `MISSING_CREDENTIAL` — no more bare
  `process.env`.
- **Host lines**: FULL 15-rc enum (0.1.0-rc.2 … 0.2.0-rc.2) at all three gate points (engines,
  dsh.plugin.json, peers) — cross-line ranges are a semver false claim. Version
  conditionality in code: settings dual read channel (describe() on 0.1.7+, get(ns)
  before), legacy own-section registration (≤ 0.1.6, so the namespace stays visible to
  dsh-thinking-levels), ToolCallId/CallId import shim (0.1.0/0.1.1 lines),
  credentials → launch-environment → process.env resolution chain; `ToolCallId` import fixed for the 0.2.0 line; serializer
  handles both message shapes (0.1.x user-embedded tool results and 0.2.0 `role: 'tool'`
  messages).

### 2026-10-01 — Delisted / Discontinued (historical)

- **This project was discontinued and delisted from the maintained plugin set**:
  `dsh-thinking-levels` no longer needed it, so it was no longer maintained. npm stayed
  at **0.1.0** (published 2026-08-29); the local 0.2.0 line (vision / image input) was
  never published. Superseded by the 0.3.0 revival above.


The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-08-30

### 🎉 Major Feature — Vision/Image Input (major capability update, not a long-tail fix)

> A model that declares vision capability in its config (`input` contains `image`, written by the
> dsh-thinking-levels capability card as `['text','image']`) can now **receive user-uploaded images —
> single or multiple** — on this adapter. This closes the previous hard `UNSUPPORTED_CONTENT` ceiling
> and enables true vision workflows on custom OpenAI-completions gateways (vLLM Qwen-VL / LM Studio).

### Added
- **Vision-model image serialization**: user `image` content blocks are rendered as OpenAI-compatible
  multi-part `content` arrays with `image_url` data-URI parts (`data:<mediaType>;base64,<…>`),
  preserving **multi-image count and order** and interleaving text parts in the source order.
- **Attachment-aware byte resolution**: image bytes are resolved at runtime through an injected,
  lazily-resolved attachment store (`readImage` → base64), never during plugin apply.
- **Non-vision models still reject loudly**: a model that does **not** declare image input keeps
  throwing `UNSUPPORTED_CONTENT` on images — nothing is silently dropped.

### Breaking (internal only)
- `serializeMessages` / `serializeRequest` are now **async** and take an optional image source;
  `OpenAiCompletionsAdapter` gained a lazy attachment-store lookup parameter. No external callers.

## [0.1.0] - 2025-01-01

### Added
- OpenAI-completions-compatible adapter for custom gateways (vLLM / LM Studio / self-hosted proxies)
- `system` role always maps to `role: "system"` — eliminates `Unexpected message role` 400 on custom gateways
- Thinking driven by `compat.thinkingFormat` (qwen / qwen-chat-template / effort-capable modes)
- `</think>` content split on receive side — thinking text extracted to reasoning block
- Configuration in llm-pi-ai settings section
- Settings spec and takeover control spec documentation
