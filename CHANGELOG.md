# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-01-01

### Added
- OpenAI-completions-compatible adapter for custom gateways (vLLM / LM Studio / self-hosted proxies)
- `system` role always maps to `role: "system"` — eliminates `Unexpected message role` 400 on custom gateways
- Thinking driven by `compat.thinkingFormat` (qwen / qwen-chat-template / effort-capable modes)
- `</think>` content split on receive side — thinking text extracted to reasoning block
- Configuration in llm-pi-ai settings section
- Settings spec and takeover control spec documentation
