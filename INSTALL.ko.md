# 설치 가이드(공식 DSH CLI)

> ✅ **0.3.0 부활(2026-10-05).** 본 가이드는 부활한 트랜스포트 테이크오버를 다룹니다——`0.1.0-rc.8`부터 `0.2.1-rc.3`까지 전 rc 동적 호환.

본 가이드는 공식 `dsh plugin` 명령만 사용합니다.

설치 가이드: [EN](./INSTALL.md) · [中文](./INSTALL.zh.md) · [日本語](./INSTALL.ja.md) · 한국어 · [DE](./INSTALL.de.md) · [ES](./INSTALL.es.md) · [FR](./INSTALL.fr.md) · [IT](./INSTALL.it.md) · [RU](./INSTALL.ru.md)

README: [EN](./README.md) · [中文](./README.zh.md) · [日本語](./README.ja.md) · 한국어 · [DE](./README.de.md) · [ES](./README.es.md) · [FR](./README.fr.md) · [IT](./README.it.md) · [RU](./README.ru.md)

## 1. 설치

```bash
# npm(권장)
dsh plugin --profile web add dsh-llm-openai-completions -w
# 로컬 tgz(오프라인 / 프리릴리스 빌드)
dsh plugin --profile web add /path/to/dsh-llm-openai-completions-0.3.0.tgz -w
dsh web
```

DSH 데스크톱: **플러그인 → 플러그인 추가 → npm 이름·GitHub URL·로컬 절대 경로 붙여넣기**(`file:` 접두어는 복사식, 벗겨진 경로는 링크식), 활성화 후 데스크톱 앱 완전 재시작.

## 2. 설치 확인

구성 확인:

```bash
dsh --profile web --dump-default-config
```

구성 트리에 `llm-openai-completions`가 포함되어야 합니다. 부팅 후 로그에 `[llm-openai-completions] short-circuit listener registered (prepend+global)`이 보이면 워터폴 리스너 설치를 확인한 것입니다.

## 3. 스위치 켜기

스위치는 본 플러그인 자신의 설정 섹션에 있습니다(기본 **끔**——뒤집기 전엔 아무 라우트도 테이크오버하지 않습니다):

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml (또는 설정 → 플러그인 → dsh-llm-openai-completions)
llm-openai-completions:
  enabled: true
  providers:        # 수동 목록, 자동식별 집합 위에 덧대기(선택)
    - local-35b
```

라우트는 dsh-thinking-levels 모델 패널의 라우트별 체크박스를 통해 테이크오버 목록에 들어갑니다(`providers` 직접 기록), 또는 목록을 수동 편집; 거기의 `takeover` 스위치는 반전 시 `enabled`로 미러됩니다.

## 4. 문제 해결

| 증상 | 조치 |
| --- | --- |
| `dsh`를 찾을 수 없음 | 공식 DSH CLI 설치 또는 활성화. |
| 플러그인이 "비활성" 표시 | 프로필 구성 확인. |
| `MISSING_CREDENTIAL` | 라우트의 `apiKeyEnv` 참조를 크리덴셜 서비스에 저장(웹 모델 페이지가 기록)하거나 런치 환경에서 export. |
| `does not declare "<모달리티>" input` | 모달리티 하드 게이트가 모델 미선언 첨부를 거부——llm-pi-ai 모델 `input`에 해당 모달리티를 추가하거나 모델 변경. |
| 커스텀 게이트웨이가 `Unexpected message role` 반환 | 라우트가 실제로 테이크오버 중인지 확인(`enabled: true` 그리고 라우트 식별·목록됨). |
| thinking 텍스트가 본문에 섞임 | 모델의 `compat.thinkingFormat` 설정 확인. |

## 5. 제거

```bash
dsh plugin --profile web remove dsh-llm-openai-completions
```

이후 DSH 재시작——pi-ai가 모든 라우트를 그대로 제공합니다(되감을 어댑터 등록이 없습니다).
