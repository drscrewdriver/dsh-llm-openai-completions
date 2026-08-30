# dsh-llm-openai-completions

**커스텀 게이트웨이용 OpenAI-completions 호환 어댑터** (vLLM / LM Studio / 자체 호스트 OpenAI 프록시) — `llm-deepseek` 및 `llm-pi-ai`와 나란한 "네 번째 어댑터 클래스"로, 추측하지 않는 동작을 제공합니다:

- `system` 역할은 **항상** `role: "system"` — 커스텀 게이트웨이에는 `developer`가 전달되지 않으므로, thinking이 활성화되어도 `Unexpected message role` 400이 사라집니다(pi-ai의 `detectCompat`는 표준이 아닌 URL에 대해 `supportsDeveloperRole: true`를 기본값으로 설정하며, `reasoningEfforts` 테이블에서 모델을 추론용으로 마크하면 모든 게이트웨이를 파괴합니다).
- thinking은 모델의 `compat.thinkingFormat`으로 제어:
  - `qwen` → `enable_thinking: boolean` 전송(Qwen3.6 스타일; `reasoning_effort` 및 budget 없음)
  - `qwen-chat-template` → `chat_template_kwargs.enable_thinking` (+ 유지)
  - effort 지원 → `reasoning_effort` 패스쓰루(Qwen3.8 스타일)
- 수신 측에서 Qwen3 스타일의 `</think>` 콘텐츠를 분할 — thinking 텍스트를 reasoning block으로 분리(vLLM은 thinking을 `content` 필드에 렌더링하고 `reasoning_content` 필드 없음) — thinking 텍스트가 본문에 혼입되지 않습니다.

설정은 **llm-pi-ai** 설정 섹션(설정 → 모델)에 있습니다: baseURL, models, `reasoningEfforts`, `compat.thinkingFormat`. 본 플러그인은 당신이 리스트한 프로바이더의 wire 동작만 교체합니다.

## 설치

```bash
# npm(권장)
dsh plugin --profile web add dsh-llm-openai-completions -w
# 로컬 link(개발)
# dsh plugin --profile web add link:E:/test/rewrite-agently/dsh-llm-openai-completions -w
dsh web
```

## 활성화

본 플러그인은 당신이 리스트한 프로바이더의 스트림을 교체합니다(기본 꺼짐; llm-pi-ai가 소유한 기존 루트는 재등록되지 않고 래핑되므로 충돌하지 않음). **숏서킷 설정 계약 — `llm-openai-completions` 네임스페이스, 필드,接管 시맨틱, wire 동작 — 은 [docs/settings-spec.md](docs/settings-spec.md)에서 지정됩니다.** 본接管 메커니즘과 협업하려는 서드파티 플러그인(예: dsh-thinking-effort 제어층)은 표준 **[docs/takeover-spec.md](docs/takeover-spec.md)**(接管 제어仕様)을 따르세요.

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml(또는 설정 → 플러그인 → dsh-llm-openai-completions)
llm-openai-completions:
  enabled: true
  providers:
    - local-35b
```

당신의 `local-35b / Qwen3.6-35B-A3B` 설정은 llm-pi-ai에 그대로 남습니다:

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
            thinkingFormat: qwen        # enable_thinking만, reasoning_effort 없음
```

## 알려진 제한사항 (v0.2.0)

- **비전 모델이 아닌 경우 이미지 미지원**: `input`에 `image`를 선언하지 않은 모델은 이미지 메시지를 `UNSUPPORTED_CONTENT`로 거부(이미지 바이트는 첨부 서비스에 있으며 비전 경로에서만 해석).
- **`thinking_budget` 없음**(의도적: 잘림의 예상치 못한 상황을 피하기 위해).
- thinking 레벨의 **selector**는 여전히 모델의 추론 메타데이터에서(llm-pi-ai + dsh-thinking-levels의 Off/On 토글); 본 플러그인은 wire 동작을 제어합니다.
- 설치 후 `dsh web`을 재시작; wrap은 `llm/adapters-updated`에서 재적용됩니다.

## 개발

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest(serialize / sse / translate)
npm run build       # tsc → lib/
```

E2E 체크: `node <repo>/scripts/...` 또는 tests 내 로컬 SSE 서버 하니스(system 역할 / enable_thinking / `escaped` 분할을 모의 vLLM으로 테스트).

## 업스트림 제안

본 플러그인은 llm-pi-ai / pi-ai의 호환성 간격의 참조 구현으로도 기능합니다: 커스텀 URL은 기본적으로 `supportsDeveloperRole: false`여야 하며, 수신 측은 `escaped` 콘텐츠를 분할해야 하고, `compat`는 참으로 지원하는 게이트웨이를 위해 `supportsDeveloperRole`을 공개해야 합니다.

## License

MIT
