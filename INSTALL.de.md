# Installationsleitfaden (Offizielle DSH CLI)

> ✅ **Wiederaufleben als 0.3.0 (2026-10-05).** Dieser Leitfaden deckt die wiederbelebte Transportübernahme ab — volle rc-dynamische Kompatibilität von `0.1.0-rc.8` bis `0.2.1-rc.1`.

Dieser Leitfaden nutzt nur den offiziellen DSH-`dsh plugin`-Befehl.

Installationsleitfäden: [EN](./INSTALL.md) · [中文](./INSTALL.zh.md) · [日本語](./INSTALL.ja.md) · [한국어](./INSTALL.ko.md) · DE · [ES](./INSTALL.es.md) · [FR](./INSTALL.fr.md) · [IT](./INSTALL.it.md) · [RU](./INSTALL.ru.md)

READMEs: [EN](./README.md) · [中文](./README.zh.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [DE](./README.de.md) · [ES](./README.es.md) · [FR](./README.fr.md) · [IT](./README.it.md) · [RU](./README.ru.md)

## 1. Installation

```bash
# npm (empfohlen)
dsh plugin --profile web add dsh-llm-openai-completions -w
# lokales tgz (offline / Vorab-Versionen)
dsh plugin --profile web add /pfad/zu/dsh-llm-openai-completions-0.3.0.tgz -w
dsh web
```

Auf DSH Desktop: **Plugins → Plugin hinzufügen → npm-Namen, GitHub-URL oder absoluten lokalen Pfad einfügen** (`file:`-Präfix kopiert; nackter Pfad verlinkt), dann aktivieren und die Desktop-App vollständig neu starten.

## 2. Installation prüfen

Komposition prüfen:

```bash
dsh --profile web --dump-default-config
```

Der Kompositionsbaum sollte `llm-openai-completions` enthalten. Nach dem Boot bestätigt die Logzeile `[llm-openai-completions] short-circuit listener registered (prepend+global)`, dass der Wasserfall-Listener sitzt.

## 3. Einschalten

Der Schalter liegt in der eigenen Einstellungssektion des Plugins (Standard **aus** — nichts wird übernommen, bis du umschaltest):

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml (oder Einstellungen → Plugins → dsh-llm-openai-completions)
llm-openai-completions:
  enabled: true
  providers:        # optionale manuelle Liste zusätzlich zur automatisch erkannten Menge
    - local-35b
```

Routen kommen über das Routing-Kontrollkästchen im Modellpanel von dsh-thinking-levels auf die Übernahmeliste (es schreibt `providers` direkt) oder durch manuelles Bearbeiten der Liste; der `takeover`-Schalter dort spiegelt beim Umschalten nach `enabled`.

## 4. Fehlerbehebung

| Symptom | Maßnahme |
| --- | --- |
| `dsh` nicht gefunden | Offizielle DSH-CLI installieren oder aktivieren. |
| Plugin zeigt „deaktiviert“ | Profilkomposition prüfen. |
| `MISSING_CREDENTIAL` | Die `apiKeyEnv`-Referenz der Route über den Credentials-Dienst ablegen (die Web-Modelseite schreibt dort) oder in der Launch-Umgebung exportieren. |
| `does not declare "<Modalität>" input` | Das Modalitätsgate hat einen vom Modell nicht deklarierten Anhang abgelehnt — Modalität in llm-pi-ai zum Modell-`input` hinzufügen oder Modell wechseln. |
| Custom-Gateway liefert `Unexpected message role` | Bestätigen, dass die Route wirklich übernommen wird (`enabled: true` und Route erkannt oder gelistet). |
| Thinking-Text im Fließtext | `compat.thinkingFormat` des Modells korrekt einstellen. |

## 5. Entfernen

```bash
dsh plugin --profile web remove dsh-llm-openai-completions
```

Danach DSH neu starten — pi-ai bedient jede Route unverändert (keine Adapter-Registrierung zum Rückgängigmachen).
