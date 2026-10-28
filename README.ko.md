# dsh-llm-openai-completions

> ✅ **0.3.0 부활(2026-10-05).** 트랜스포트 테이크오버가 pi-ai로는 불가능한 실기능을 갖추어 돌아왔습니다: 멀티모달 참전송(이미지/오디오/비디오/PDF)＋모달리티 하드 게이트, dsh-promptbook 계열 컨슈머용 `llmOpenaiCompletions` 프롬프트 소스 통로, 크리덴셜 서비스 키, 그리고 `0.1.0-rc.8` – `0.2.1-rc.4` 전 rc 동적 호환. 구 `settings.get` 시대 아키텍처는 은퇴——판정은 `enabled && providers.includes(route)`(순수 수동 멤버십: 라우트별 체크박스가 진실)이며 스위치는 본 플러그인 자신의 설정 섹션에 있습니다. 계약 면: [AGENTS.md](./AGENTS.md).

**포지셔닝**: dsh-thinking-levels가 결합 가능한 쇼트서킷 백엔드로 부활——라우트별 `api` 선언에 따라 **세 가지 주류 API 포맷을 모두 구현**했습니다(OpenAI Chat Completions · Anthropic Messages · OpenAI Responses——샤오미 MiMo 멀티모달을 위한 오디오/비디오/PDF 참전송).

## README languages / 说明文档

[English](./README.md) · [中文](./README.zh.md) · [日本語](./README.ja.md) · 한국어 · [Deutsch](./README.de.md) · [Español](./README.es.md) · [Français](./README.fr.md) · [Italiano](./README.it.md) · [Русский](./README.ru.md)

설치 가이드: [EN](./INSTALL.md) · [中文](./INSTALL.zh.md) · [日本語](./INSTALL.ja.md) · 한국어 · [DE](./INSTALL.de.md) · [ES](./INSTALL.es.md) · [FR](./INSTALL.fr.md) · [IT](./INSTALL.it.md) · [RU](./INSTALL.ru.md) — [변경 로그](./CHANGELOG.md)

**커스텀 게이트웨이용 OpenAI-completions 호환 트랜스포트 테이크오버**(vLLM / LM Studio / 자체 호스팅 OpenAI 프록시): 테이크오버된 라우트의 `llm/stream` 워터폴을 쇼트서킷하고, 추측 없는 동작으로 서비스합니다——데이터 플레인(baseURL / models / `reasoningEfforts` / `compat` / `input`)은 **llm-pi-ai**에 남고 `settings.describe()`로 실시간 읽습니다.

- `system`은 **언제나** `role: "system"` —— 커스텀 게이트웨이는 `developer`를 절대 받지 않으므로, thinking 활성 시에도 `Unexpected message role` 400이 사라집니다(pi-ai의 `detectCompat`는 비표준 URL에 `supportsDeveloperRole: true`를 기본값으로 두어, `reasoningEfforts` 테이블이 모델을 추론 모델로 표시하는 순간 모든 커스텀 게이트웨이를 깨뜨립니다).
- thinking은 모델의 `compat.thinkingFormat`이 구동:
  - 토글형 모델(`reasoningEfforts` 테이블 있음, `supportsReasoningEffort` 없음) → 설정 포맷과 무관하게 항상 `chat_template_kwargs.enable_thinking`(+ preserve)——순수 vLLM의 Qwen3 템플릿이 인정하는 것은 이것뿐
  - `qwen` → 최상위 `enable_thinking: boolean`(`reasoning_effort`·budget 없음)
  - `qwen-chat-template` → `chat_template_kwargs.enable_thinking`(+ preserve)
  - effort 대응 → `reasoning_effort` 패스스루(Qwen3.8 스타일)
- 수신 측은 Qwen3 스타일 `</think>` 콘텐츠(vLLM은 thinking을 `reasoning_content` 필드 없이 `content`에 렌더링)를 reasoning 블록으로 분할하고, `reasoning_content` / `reasoning` / `reasoning_text` 3 필드를 인식합니다.
- `thinking_budget`은 의도적으로 전송하지 않습니다(절단 사고 방지).

## 🎉 0.3.0 — 멀티모달 참전송＋모달리티 하드 게이트

쇼트서킷은 호스트가 file 블록을 텍스트 핸들로 프로젝션하기 **전에** 워터폴을 소비하므로, 미디어는 구조 블록으로 도착해 곧장 와이어로 인코딩됩니다——호스트 패치 제로, 핸들 재구성 제로:

- **이미지** → `image_url` data-URI 파트(다중 이미지 수·순서 보존, 텍스트는 원순 인터리브)
- **오디오** → `input_audio` 파트(base64 + 포맷)
- **비디오** → `video_url` data-URI 파트(인라인 상한 20 MB)
- **PDF** → OpenAI `file` 파트
- **모달리티 하드 게이트**: 전송 전에 전체 이력의 모든 미디어 블록을 모델의 llm-pi-ai `input` 선언과 대조; 미선언 모달리티는 텍스트로 침묵 열화되는 대신 **큰 소리로 거부**됩니다(`INVALID_REQUEST`, 모달리티명 명시).
- 원샷 호출(`session-title`)은 미디어 블록을 벗기고 결코 thinking하지 않습니다.
- 바이트는 어태치먼트 서비스에서(`readImage` / `readFileStream`); 비비전 모델의 이미지는 여전히 큰 소리로 거부(`UNSUPPORTED_CONTENT`).

## 🎉 0.3.0 — `llmOpenaiCompletions` 프롬프트 소스 통로

`ctx.provide("llmOpenaiCompletions", { listHostedModels, registerPromptSource })`——dsh-llm-mimo의 `llmMimo`와 동일 계약으로, dsh-promptbook 계열 컨슈머용: `(provider, model)`별로 **실제 송출되는** 시스템 프롬프트와 도구 설명을 교체. 결정론적 순수 함수(캐시 안전), 텍스트만(`name`/`parameters` 불가침), 소스 미등록 시 동작 제로. 스코프 보장: 테이크오버 라우트의 디스패치 내에서만 참조. 전체 계약: [AGENTS.md §1](./AGENTS.md).

## 세 와이어 면(라우트별 `api`)

| 면 | 엔드포인트 | 인증 | thinking | 모달리티 |
|---|---|---|---|---|
| `openai-completions`(기본) | `{base}/chat/completions` | Bearer | thinkingFormat 매트릭스 | 이미지/오디오/비디오/PDF |
| `anthropic-messages` | `{base}/v1/messages` | `x-api-key` + 버전 header | off/원샷 → disabled | **이미지만** |
| `openai-responses` | `{base}/responses` | Bearer | `reasoning.effort`(정직한 접기) | 이미지/오디오/비디오/PDF |

- 전 면 공통: `max_tokens` = 요청값 → 모델 행 → 라우트 기본 → 8192; leading system 메시지는 각 면의 system 채널로 추출되고 메시지 목록에서 제거됩니다.
- Anthropic 페어 규율: tool_use/tool_result는 반드시 페어(깨진 이력 = 큰 소리의 `INVALID_REQUEST`); 어시스턴트 thinking은 재생하지 않습니다(하네스에 서명 필드 없음——chat 면보다 엄격하게 약함).
- Responses 경계: `stop` 폐기(Responses 철자 없음); reasoning 레벨은 정직하게 접기; 실기 MiMo 엔드포인트 대상 프로브 보정은 예정.

## 테이크오버 판정(단일 사실원)

```
takeover(route) = section.enabled === true
                  && section.providers.includes(route)
```

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml (또는 설정 → 플러그인 → dsh-llm-openai-completions)
llm-openai-completions:
  enabled: true
  providers:        # 테이크오버 목록——유일한 진실(아래 참조)
    - local-35b
```

- 스위치와 테이크오버 목록은 본 플러그인 **자신의 설정 섹션**에 있습니다(`.volatile()`——런타임 변경 가능, 호스트 생성 폼).
- **dsh-thinking-levels가 두 필드를 구동**: 그 `takeover` 스위치는 `{enabled}`를 본 섹션에 미러하고, 모델 패널의 라우트별 테이크오버 체크박스가 `providers`를 직접 기록합니다——체크박스가 진실이며, dispatch·`listHostedModels`·컨트롤 계층 게이팅은 같은 집합을 읽습니다.
- 스위치 해제(또는 플러그인 제거) 시 그대로 pi-ai로 폴스루——되감을 어댑터 등록이 없습니다.
- llm-pi-ai 설정은 그대로(1개의 공유 설정; 본 어댑터는 읽기만——필드 전표: [docs/settings-spec.md](docs/settings-spec.md), 테이크오버 계약: [docs/takeover-spec.md](docs/takeover-spec.md)):

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

## 미리보기

실기기 스크린샷——**dsh-thinking-levels 연동**: 커스텀 모델의 "생각 가능" 레벨 드롭다운(기본/끔/켬). 능력 검출 → 테이크오버 체인 시연:

<figure>
  <img style="max-width:100%" alt="커스텀 모델 thinking 레벨 드롭다운(Qwen3.6-35B-A3B, 기본/끔/켬): 검출＋테이크오버 체인——dsh-thinking-levels 능력 카드가 llm-pi-ai 모델 항목에 input/reasoningEfforts/compat를 기록하면, 본 어댑터가 읽어 와이어 동작을 인수합니다(compat.thinkingFormat: qwen→enable_thinking, effort 대응→reasoning_effort 패스스루)" src="assets/自定义模型的可思考.png" />
  <figcaption>능력 카드＋테이크오버 체인: 1개의 공유 llm-pi-ai 설정——<strong>카드가 검출</strong>하고(input/reasoningEfforts/compat 기록), <strong>트랜스포트가 와이어를 인수</strong>합니다(compat.thinkingFormat에 따라 enable_thinking / reasoning_effort 송신).</figcaption>
</figure>

## 설치

호스트 호환: **`0.1.0-rc.8`부터 `0.2.1-rc.4`까지 모든 rc**, 코드 내 버전 조건부 호환(형상 검출 settings 면, `ToolCallId`/`CallId` shim, 크리덴셜 credentials → 런치 환경 → `process.env` 3단 체인). 모든 설치 경로는 [설치 가이드](./INSTALL.ko.md)로:

```bash
# npm(권장)
dsh plugin --profile web add dsh-llm-openai-completions -w
# 로컬 tgz
dsh plugin --profile web add /path/to/dsh-llm-openai-completions-0.3.0.tgz -w
dsh web
```

## 알려진 한계

- **PDF 지원은 엔드포인트 의존**(MiMo chat은 즉시 400, 일부 릴레이는 수용)——`input` 선언은 능력 선언입니다; `pdf` 선언 전에 엔드포인트를 확인하세요.
- **비미디어 파일 첨부**(예: `.txt`)에는 크로스 게이트웨이 와이어 형상이 없습니다; 테이크오버 라우트에서 텍스트 플레이스홀더로 열화됩니다(내용은 파일 도구로 계속 도달 가능).
- **`thinking_budget` 미전송**(의도적).
- thinking 레벨 **셀렉터**는 여전히 모델의 추론 메타데이터에서(llm-pi-ai + dsh-thinking-levels); 본 트랜스포트가 제어하는 것은 와이어 동작뿐입니다.
- 설치 후 `dsh web` 재시작; 테이크오버 리스너는 boot 시 조립됩니다.

## 개발

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest(config / identify / serialize / sse / translate / prompt-source / version-conditional)
npm run build       # tsc → lib/
node scripts/audit-host-faces.mjs   # 15-rc 의존면 감사
```

## 업스트림 제안

본 플러그인은 llm-pi-ai / pi-ai 호환 공백의 레퍼런스 구현이기도 합니다: 커스텀 URL은 `supportsDeveloperRole: false` 기본값, 수신 측은 `</think>` 콘텐츠 분할, `compat`는 진정으로 지원하는 게이트웨이용 `supportsDeveloperRole` 노출이 마땅합니다——그리고 호스트 프로젝션 계층도 본 플러그인이 라우트별로 적용하는 것과 같은 능력 인지 file 블록 게이트를 키울 수 있습니다.
