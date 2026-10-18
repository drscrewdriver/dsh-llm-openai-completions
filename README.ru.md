# dsh-llm-openai-completions

> ✅ **Возрождён как 0.3.0 (2026-10-05).** Перехват транспорта вернулся с настоящими функциями, которых у pi-ai нет: истинно мультимодальная отправка (изображение/аудио/видео/PDF) с жёстким шлюзом модальностей, шов источника промптов `llmOpenaiCompletions` для потребителей класса dsh-promptbook, ключи через сервис учётных данных и динамическая совместимость со всеми rc от `0.1.0-rc.8` до `0.2.1-rc.2`. Архитектура эпохи `settings.get` ушла на пенсию — критерий: `enabled && providers.includes(route)` (чистое ручное членство: галочка маршрута — истина), а переключатель живёт в собственном разделе настроек этого плагина. Контрактные поверхности: [AGENTS.md](./AGENTS.md).

**Позиционирование**: возрождён как бэкенд короткого замыкания, которым может управлять dsh-thinking-levels — говорящий на **всех трёх основных форматах API** по декларации `api` каждого маршрута (OpenAI Chat Completions · Anthropic Messages · OpenAI Responses), создан прежде всего для мультимодальности Xiaomi MiMo: настоящая отправка аудио/видео/PDF.

## Языки README / 说明文档

[English](./README.md) · [中文](./README.zh.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [Deutsch](./README.de.md) · [Español](./README.es.md) · [Français](./README.fr.md) · [Italiano](./README.it.md) · Русский

Руководства по установке: [EN](./INSTALL.md) · [中文](./INSTALL.zh.md) · [日本語](./INSTALL.ja.md) · [한국어](./INSTALL.ko.md) · [DE](./INSTALL.de.md) · [ES](./INSTALL.es.md) · [FR](./INSTALL.fr.md) · [IT](./INSTALL.it.md) · [RU](./INSTALL.ru.md) — [Журнал изменений](./CHANGELOG.md)

**Перехват транспорта, совместимый с OpenAI-completions, для пользовательских шлюзов** (vLLM / LM Studio / самохостинговые OpenAI-прокси): плагин замыкает накоротко каскад `llm/stream` для захваченных маршрутов и обслуживает их поведением, которое никогда не гадает — плоскость данных (baseURL / models / `reasoningEfforts` / `compat` / `input`) остаётся в **llm-pi-ai** и читается вживую через `settings.describe()`.

- `system` — **всегда** `role: "system"` — пользовательский шлюз никогда не получает `developer`, поэтому ошибка 400 `Unexpected message role` исчезает даже при включённом thinking (`detectCompat` в pi-ai ставит `supportsDeveloperRole: true` по умолчанию для нестандартных URL, что ломает каждый пользовательский шлюз, как только таблица `reasoningEfforts` помечает модель как рассуждающую).
- Thinking управляется `compat.thinkingFormat` модели:
  - тумблерные модели (таблица `reasoningEfforts`, без `supportsReasoningEffort`) → всегда `chat_template_kwargs.enable_thinking` (+ preserve), независимо от настроенного формата — ибо только это признают голые шаблоны Qwen3 в vLLM
  - `qwen` → `enable_thinking: boolean` верхнего уровня (без `reasoning_effort`, без бюджета)
  - `qwen-chat-template` → `chat_template_kwargs.enable_thinking` (+ preserve)
  - с поддержкой effort → прямой пропуск `reasoning_effort` (стиль Qwen3.8)
- Приёмная сторона разделяет содержимое `</think>` в стиле Qwen3 (vLLM рендерит thinking в `content` без поля `reasoning_content`) в блок reasoning и читает `reasoning_content` / `reasoning` / `reasoning_text`.
- `thinking_budget` не отправляется (намеренно: избежать сюрпризов с обрезкой).

## 🎉 0.3.0 — Истинно мультимодальная отправка с жёстким шлюзом модальностей

Короткое замыкание потребляет каскад **до того**, как хост спроецирует file-блоки в текстовые дескрипторы — медиа приходят структурно и кодируются прямо в провод: никаких патчей хоста, никакой реконструкции дескрипторов:

- **изображение** → части `image_url` data-URI (количество и порядок нескольких изображений сохранены, текст чередуется в исходном порядке)
- **аудио** → части `input_audio` (base64 + формат)
- **видео** → части `video_url` data-URI (лимит инлайна 20 МБ)
- **PDF** → части `file` OpenAI
- **Жёсткий шлюз модальностей**: каждый медиаблок полной истории сверяется с декларацией `input` модели в llm-pi-ai до любого чтения или отправки; незаявленная модальность громко отвергается (`INVALID_REQUEST`, с именованием модальности) вместо тихой деградации в текст.
- Одноразовые вызовы (`session-title`) снимают медиаблоки и никогда не думают.
- Байты приходят из сервиса вложений (`readImage` / `readFileStream`); невизуальные модели по-прежнему громко отвергают изображения (`UNSUPPORTED_CONTENT`).

## 🎉 0.3.0 — Шов источника промптов `llmOpenaiCompletions`

`ctx.provide("llmOpenaiCompletions", { listHostedModels, registerPromptSource })` — тот же контракт, который dsh-llm-mimo выставляет как `llmMimo`, для потребителей класса dsh-promptbook: заменять **реально отправляемый** системный промпт и описания инструментов по `(provider, model)`, детерминированно (безопасно для кэша), только текст (никогда `name`/`parameters`), нулевое поведение без зарегистрированного источника. Гарантия охвата: опрашивается только в диспетчере захваченных маршрутов. Полный контракт: [AGENTS.md §1](./AGENTS.md).

## Три лица провода (по маршруту `api`)

| лицо | endpoint | auth | thinking | модальности |
|---|---|---|---|---|
| `openai-completions` (по умолчанию) | `{base}/chat/completions` | Bearer | матрица thinkingFormat | изображение/аудио/видео/PDF |
| `anthropic-messages` | `{base}/v1/messages` | `x-api-key` + заголовок версии | off/одноразово → disabled | **только изображение** |
| `openai-responses` | `{base}/responses` | Bearer | `reasoning.effort` (честное свёртывание) | изображение/аудио/видео/PDF |

- Все лица: `max_tokens` = значение запроса → строка модели → по умолчанию маршрута → 8192; начальное system-сообщение извлекается в системный канал лица и удаляется из списка.
- Дисциплина пар anthropic: tool_use/tool_result должны сочетаться (сломанная история = громкий `INVALID_REQUEST`); thinking ассистента не переигрывается (в harness нет поля подписи — строго слабее лица chat).
- Границы responses: `stop` отбрасывается (нет написания Responses); уровни reasoning свёртываются честно; калибровка зондом по реальным эндпоинтам MiMO предстоит.

## Критерий захвата (единственный источник истины)

```
takeover(route) = section.enabled === true
                  && section.providers.includes(route)
```

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml (или Настройки → Плагины → dsh-llm-openai-completions)
llm-openai-completions:
  enabled: true
  providers:        # список захвата — единственная истина (см. ниже)
    - local-35b
```

- Переключатель и список захвата живут в **собственном разделе настроек этого плагина** (`.volatile()` — изменяемы на ходу, форма генерируется хостом).
- **dsh-thinking-levels приводит оба поля**: его переключатель `takeover` зеркалит `{enabled}` в этот раздел, а галочка захвата по маршруту в его панели моделей пишет `providers` напрямую — галочка есть истина; диспетчер, `listHostedModels` и фильтр слоя управления читают одно и то же множество.
- Выключение переключателя (или демонтаж плагина) без изменений откатывается на pi-ai — никакой регистрации адаптера, которую нужно было бы раскручивать.
- Ваша конфигурация llm-pi-ai остаётся как есть (одна общая конфигурация; этот адаптер её только читает — полная таблица полей: [docs/settings-spec.md](docs/settings-spec.md), контракт захвата: [docs/takeover-spec.md](docs/takeover-spec.md)):

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
            thinkingFormat: qwen        # только enable_thinking, без reasoning_effort
```

## Предпросмотр

Живой скриншот — **работает совместно с dsh-thinking-levels**: выпадающий список уровней «мыслеспособности» пользовательской модели (По умолчанию/Выкл/Вкл). Демонстрирует цепочку распознавание → захват:

<figure>
  <img style="max-width:100%" alt="Выпадающий список уровней thinking пользовательской модели (Qwen3.6-35B-A3B, По умолчанию/Выкл/Вкл): цепочка распознавания + захвата — карта возможностей dsh-thinking-levels пишет input/reasoningEfforts/compat в запись модели llm-pi-ai, затем адаптер dsh-llm-openai-completions читает их и берёт на себя поведение провода (compat.thinkingFormat: qwen→enable_thinking, с поддержкой effort→прямой пропуск reasoning_effort)" src="assets/自定义模型的可思考.png" />
  <figcaption>Карта возможностей + цепочка захвата с dsh-thinking-levels: одна общая конфигурация llm-pi-ai — <strong>карта распознаёт</strong> (пишет input/reasoningEfforts/compat), <strong>транспорт берёт провод</strong> (отправляет enable_thinking / reasoning_effort согласно compat.thinkingFormat).</figcaption>
</figure>

## Установка

Совместимость с хостом: **каждый rc от `0.1.0-rc.8` до `0.2.1-rc.2`**, условно по версии в коде (лица settings, определяемые по форме, шим `ToolCallId`/`CallId`, цепочка разрешения ключа credentials → среда запуска → `process.env`). Все пути — в [руководстве по установке](./INSTALL.ru.md):

```bash
# npm (рекомендуется)
dsh plugin --profile web add dsh-llm-openai-completions -w
# локальный tgz
dsh plugin --profile web add /путь/к/dsh-llm-openai-completions-0.3.0.tgz -w
dsh web
```

## Известные ограничения

- **Поддержка PDF зависит от конечной точки** (MiMo chat отвергает сразу; некоторые реле принимают) — декларация `input` есть заявление о возможности; проверьте свой эндпоинт, прежде чем заявлять `pdf`.
- **Немедийные файловые вложения** (напр. `.txt`) не имеют межшлюзовой проводной формы; на захваченных маршрутах они деградируют до текстового заполнителя (содержимое остаётся доступным через файловые инструменты).
- **Без `thinking_budget`** (намеренно).
- **Селектор** уровня thinking по-прежнему берётся из метаданных рассуждений модели (llm-pi-ai + dsh-thinking-levels); этот транспорт управляет только поведением провода.
- После установки перезапустите `dsh web`; слушатель захвата собирается при загрузке.

## Разработка

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest (config / identify / serialize / sse / translate / prompt-source / version-conditional)
npm run build       # tsc → lib/
node scripts/audit-host-faces.mjs   # аудит поверхностей зависимостей 15-rc
```

## Предложение вверх по течению

Этот плагин заодно служит эталонной реализацией пробелов совместимости llm-pi-ai / pi-ai: пользовательские URL должны иметь `supportsDeveloperRole: false` по умолчанию, приёмная сторона должна разделять содержимое `</think>`, а `compat` должен выставлять `supportsDeveloperRole` для шлюзов, которые действительно его поддерживают — и слой проекции хоста мог бы вырастить такой же учитывающий возможности шлюз file-блоков, который этот плагин применяет по маршруту.
