# Changelog

All notable changes to this project will be documented in this file.

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
