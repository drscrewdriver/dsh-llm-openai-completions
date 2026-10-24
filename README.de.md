# dsh-llm-openai-completions

> ✅ **Wiederaufleben als 0.3.0 (2026-10-05).** Die Transportübernahme ist mit echten Funktionen zurück, die pi-ai nicht bieten kann: multimodale Echtzeitsendung (Bild/Audio/Video/PDF) mit hartherzigem Modalitätsgate, eine `llmOpenaiCompletions`-Prompt-Quell-Schnittstelle für dsh-promptbook-artige Konsumenten, Credentials-Service-Schlüssel und volle rc-dynamische Kompatibilität über `0.1.0-rc.8` – `0.2.1-rc.3`. Die alte `settings.get`-Architektur ist a.D. — die Beurteilung lautet `enabled && providers.includes(route)` (reine manuelle Mitgliedschaft: das Routing-Kontrollkästchen ist die Wahrheit), der Schalter liegt in der eigenen Einstellungssektion dieses Plugins. Vertragsflächen: [AGENTS.md](./AGENTS.md).

**Positionierung**: als Short-Circuit-Backend wiederauflebt, das dsh-thinking-levels antreiben kann — das **alle drei gängigen API-Formate** je Routen-`api`-Deklaration spricht (OpenAI Chat Completions · Anthropic Messages · OpenAI Responses), primär für Xiaomi-MiMo-Multimodal gebaut: echte Audio-/Video-/PDF-Sendung.

## README-Sprachen / 说明文档

[English](./README.md) · [中文](./README.zh.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · Deutsch · [Español](./README.es.md) · [Français](./README.fr.md) · [Italiano](./README.it.md) · [Русский](./README.ru.md)

Installationsleitfäden: [EN](./INSTALL.md) · [中文](./INSTALL.zh.md) · [日本語](./INSTALL.ja.md) · [한국어](./INSTALL.ko.md) · [DE](./INSTALL.de.md) · [ES](./INSTALL.es.md) · [FR](./INSTALL.fr.md) · [IT](./INSTALL.it.md) · [RU](./INSTALL.ru.md) — [Änderungsprotokoll](./CHANGELOG.md)

**OpenAI-completions-kompatible Transportübernahme für Custom-Gateways** (vLLM / LM Studio / selbst gehostete OpenAI-Proxies): Das Plugin short-circuited den `llm/stream`-Wasserfall für übernommene Routen und bedient sie mit nie ratendem Verhalten — die Datenebene (baseURL / models / `reasoningEfforts` / `compat` / `input`) bleibt in **llm-pi-ai**, live gelesen über `settings.describe()`.

- `system` ist **immer** `role: "system"` — ein Custom-Gateway empfängt nie `developer`, daher ist der `Unexpected message role`-400 verschwunden, selbst wenn Denken aktiviert ist (pi-ais `detectCompat` setzt `supportsDeveloperRole: true` für nicht standardmäßige URLs, was jedes Custom-Gateway bricht, sobald eine `reasoningEfforts`-Tabelle das Modell als Reasoning markiert).
- Thinking wird von `compat.thinkingFormat` des Modells gesteuert:
  - Toggle-Modelle (`reasoningEfforts`-Tabelle, ohne `supportsReasoningEffort`) → immer `chat_template_kwargs.enable_thinking` (+ preserve), unabhängig vom konfigurierten Format — denn nur das ehren bare vLLM Qwen3-Templates
  - `qwen` → top-level `enable_thinking: boolean` (kein `reasoning_effort`, kein Budget)
  - `qwen-chat-template` → `chat_template_kwargs.enable_thinking` (+ preserve)
  - effort-fähig → `reasoning_effort`-Durchreichung (Qwen3.8-Stil)
- Die Empfangsseite teilt Qwen3-Stil-`</think>`-Inhalt (vLLM rendert Thinking in `content` ohne `reasoning_content`-Feld) in einen Reasoning-Block und liest `reasoning_content` / `reasoning` / `reasoning_text`.
- Kein `thinking_budget` wird gesendet (absichtlich: Überraschungen durch Abbruch vermeiden).

## 🎉 0.3.0 — Multimodale Echtzeitsendung mit Modalitätsgate

Der Short-Circuit konsumiert den Wasserfall **bevor** der Host Dateiblöcke zu Texthandle projiziert — Medien kommen strukturell an und werden direkt für die Leitung kodiert: keine Host-Patches, keine Handle-Rekonstruktion:

- **Bild** → `image_url`-Data-URI-Teile (Anzahl und Reihenfolge mehrerer Bilder bleiben erhalten, Text in Quellreihenfolge verschränkt)
- **Audio** → `input_audio`-Teile (base64 + Format)
- **Video** → `video_url`-Data-URI-Teile (Inline-Limit 20 MB)
- **PDF** → OpenAI-`file`-Teile
- **Modalitätsgate**: Jeder Medienblock des vollständigen Verlaufs wird vor dem Lesen oder Senden gegen die llm-pi-ai-`input`-Deklaration des Modells geprüft; eine nicht deklarierte Modalität wird laut abgelehnt (`INVALID_REQUEST`, mit Modalitätsnamen) statt still zu Text degradiert zu werden.
- Einmalaufrufe (`session-title`) streifen Medienblöcke ab und denken nie.
- Bytes kommen aus dem Attachment-Dienst (`readImage` / `readFileStream`); Nicht-Vision-Modelle lehnen Bilder weiterhin laut ab (`UNSUPPORTED_CONTENT`).

## 🎉 0.3.0 — Die `llmOpenaiCompletions`-Prompt-Quell-Schnittstelle

`ctx.provide("llmOpenaiCompletions", { listHostedModels, registerPromptSource })` — derselbe Vertrag, den dsh-llm-mimo als `llmMimo` exponiert, für dsh-promptbook-artige Konsumenten: den **tatsächlich gesendeten** Systemprompt und die Werkzeugbeschreibungen je `(provider, model)` ersetzen, deterministisch (cache-sicher), nur Text (nie `name`/`parameters`), Nullverhalten ohne registrierte Quelle. Scope-Garantie: nur innerhalb des Dispatches übernommener Routen konsultiert. Voller Vertrag: [AGENTS.md §1](./AGENTS.md).

## Drei Drahtflächen (routenweise `api`)

| Fläche | Endpunkt | Auth | Thinking | Modalitäten |
|---|---|---|---|---|
| `openai-completions` (Standard) | `{base}/chat/completions` | Bearer | thinkingFormat-Matrix | Bild/Audio/Video/PDF |
| `anthropic-messages` | `{base}/v1/messages` | `x-api-key` + Version-Header | aus/One-Shot → disabled | **nur Bild** |
| `openai-responses` | `{base}/responses` | Bearer | `reasoning.effort` (ehrlich gefaltet) | Bild/Audio/Video/PDF |

- Alle Flächen: `max_tokens` = Anfragewert → Modellzeile → Routen-Standard → 8192; die führende Systemnachricht wird in den Systemkanal der Fläche extrahiert und aus der Nachrichtenliste entfernt.
- Anthropic-Paarungsdisziplin: tool_use/tool_result müssen paaren (gebrochene Historie = lauter `INVALID_REQUEST`); Assistant-Thinking wird nicht wiedergegeben (kein Signaturfeld im Harness — streng schwächer als die Chat-Fläche).
- Responses-Grenzen: `stop` verworfen (keine Responses-Schreibweise); Reasoning-Stufen ehrlich gefaltet; Probe-Kalibrierung gegen echte MiMo-Endpunkte steht aus.

## Übernahme-Beurteilung (einzige Wahrheitsquelle)

```
takeover(route) = section.enabled === true
                  && section.providers.includes(route)
```

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml (oder Einstellungen → Plugins → dsh-llm-openai-completions)
llm-openai-completions:
  enabled: true
  providers:        # die Übernahmeliste — die einzige Wahrheit (siehe unten)
    - local-35b
```

- Schalter und Übernahmeliste liegen in der **eigenen Einstellungssektion dieses Plugins** (`.volatile()` — zur Laufzeit änderbar, hostgeneriertes Formular).
- **dsh-thinking-levels treibt beide Felder**: Sein `takeover`-Schalter spiegelt `{enabled}` in diese Sektion, und das Routing-Kontrollkästchen im Modellpanel schreibt `providers` direkt — das Kontrollkästchen ist die Wahrheit; Dispatch, `listHostedModels` und die Steuerungsschicht-Gating lesen dieselbe Menge.
- Abschalten (oder Deinstallieren) fällt unverändert auf pi-ai zurück — keine Adapter-Registrierung zum Rückgängigmachen.
- Deine llm-pi-ai-Konfiguration bleibt, wie sie ist (eine geteilte Konfiguration; dieser Adapter liest nur — Feldtabelle: [docs/settings-spec.md](docs/settings-spec.md), Übernahmevertrag: [docs/takeover-spec.md](docs/takeover-spec.md)):

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
            thinkingFormat: qwen        # nur enable_thinking, kein reasoning_effort
```

## Vorschau

Live-Screenshot — **gemeinsam mit dsh-thinking-levels betrieben**: das Denkfähig-Level-Dropdown des Custom-Modells (Standard/Aus/Ein). Er demonstriert die Kette Fähigkeitserkennung → Übernahme:

<figure>
  <img style="max-width:100%" alt="Denkfähig-Level-Dropdown des Custom-Modells (Qwen3.6-35B-A3B, Standard/Aus/Ein): Erkennungs- + Übernahmekette — die dsh-thinking-levels-Fähigkeitskarte schreibt input/reasoningEfforts/compat in den llm-pi-ai-Modelleintrag, dann liest der dsh-llm-openai-completions-Adapter sie und übernimmt das Leitungsverhalten (compat.thinkingFormat: qwen→enable_thinking, effort-fähig→reasoning_effort-Durchreichung)" src="assets/自定义模型的可思考.png" />
  <figcaption>Gemeinsame Fähigkeitskarte + Übernahmekette mit dsh-thinking-levels: eine geteilte llm-pi-ai-Konfiguration — die <strong>Karte erkennt</strong> (schreibt input/reasoningEfforts/compat), der <strong>Transport übernimmt die Leitung</strong> (sendet enable_thinking / reasoning_effort je compat.thinkingFormat).</figcaption>
</figure>

## Installation

Host-Kompatibilität: **jedes rc von `0.1.0-rc.8` bis `0.2.1-rc.3`**, im Code versionsbedingt (formenerkannte Settings-Flächen, ein `ToolCallId`/`CallId`-Shim, Credentials → Launch-Umgebung → `process.env`-Schlüsselauflösung). Alle Wege im [Installationsleitfaden](./INSTALL.de.md):

```bash
# npm (empfohlen)
dsh plugin --profile web add dsh-llm-openai-completions -w
# lokales tgz
dsh plugin --profile web add /pfad/zu/dsh-llm-openai-completions-0.3.0.tgz -w
dsh web
```

## Bekannte Grenzen

- **PDF-Unterstützung ist endpunktabhängig** (MiMo chat lehnt direkt ab; manche Relays akzeptieren es) — die `input`-Deklaration ist eine Fähigkeitsbehauptung; prüfe deinen Endpunkt, bevor du `pdf` deklarierst.
- **Nicht-Media-Dateianhänge** (z. B. `.txt`) haben keine gatewayübergreifende Leitungsform; auf übernommenen Routen degradieren sie zu einem Textplatzhalter (Inhalt bleibt über die Dateiwerkzeuge erreichbar).
- **Kein `thinking_budget`** (absichtlich).
- Der Denklevel-**Selektor** kommt weiterhin aus den Reasoning-Metadaten des Modells (llm-pi-ai + dsh-thinking-levels); dieser Transport steuert nur das Leitungsverhalten.
- Nach der Installation `dsh web` neu starten; der Übernahme-Listener komponiert beim Boot.

## Entwicklung

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest (config / identify / serialize / sse / translate / prompt-source / version-conditional)
npm run build       # tsc → lib/
node scripts/audit-host-faces.mjs   # 15-rc-Abhängigkeitsflächen-Audit
```

## Upstream-Vorschlag

Dieses Plugin dient zugleich als Referenzimplementierung für die llm-pi-ai-/pi-ai-Kompatibilitätslücken: Custom-URLs sollten `supportsDeveloperRole: false` als Voreinstellung haben, die Empfangsseite sollte `</think>`-Inhalt teilen, `compat` sollte `supportsDeveloperRole` für Gateways exponieren, die es wirklich unterstützen — und die Host-Projektionsschicht könnte dasselbe fähigkeitsbewusste Dateiblock-Gate heranzüchten, das dieses Plugin je Route anwendet.
