# Guida all'installazione (CLI ufficiale DSH)

> ✅ **Rinato in vita come 0.3.0 (2026-10-05).** Questa guida copre la presa in carico del trasporto rinata — compatibilità dinamica di tutti gli rc da `0.1.0-rc.8` a `0.2.1-rc.2`.

Questa guida usa solo il comando ufficiale `dsh plugin` di DSH.

Guide di installazione: [EN](./INSTALL.md) · [中文](./INSTALL.zh.md) · [日本語](./INSTALL.ja.md) · [한국어](./INSTALL.ko.md) · [DE](./INSTALL.de.md) · [ES](./INSTALL.es.md) · [FR](./INSTALL.fr.md) · IT · [RU](./INSTALL.ru.md)

README: [EN](./README.md) · [中文](./README.zh.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [DE](./README.de.md) · [ES](./README.es.md) · [FR](./README.fr.md) · [IT](./README.it.md) · [RU](./README.ru.md)

## 1. Installare

```bash
# npm (consigliato)
dsh plugin --profile web add dsh-llm-openai-completions -w
# tgz locale (offline / build pre-release)
dsh plugin --profile web add /percorso/di/dsh-llm-openai-completions-0.3.0.tgz -w
dsh web
```

Su DSH Desktop: **Plugin → Aggiungi plugin → incollare il nome npm, un URL GitHub o un percorso locale assoluto** (il prefisso `file:` copia; un percorso nudo collega), poi attivare e riavviare completamente l'app desktop.

## 2. Verificare l'installazione

Controlla la composizione:

```bash
dsh --profile web --dump-default-config
```

Deve contenere `llm-openai-completions` nell'albero composto. Dopo il boot, la riga di log `[llm-openai-completions] short-circuit listener registered (prepend+global)` conferma che l'ascoltatore della cascata è a posto.

## 3. Accenderlo

L'interruttore vive nella propria sezione impostazioni del plugin (predefinito **spento** — nulla viene preso finché non lo ribalti):

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml (o Impostazioni → Plugin → dsh-llm-openai-completions)
llm-openai-completions:
  enabled: true
  providers:        # elenco manuale opzionale sopra l'insieme auto-identificato
    - local-35b
```

Le rotte entrano nell'elenco di presa in carico tramite la casella per rotta del pannello modelli di dsh-thinking-levels (scrive `providers` direttamente) o modificando l'elenco a mano; l'interruttore `takeover` lì si specchia in `enabled` quando ribaltato.

## 4. Risoluzione dei problemi

| Sintomo | Azione |
| --- | --- |
| `dsh` non trovato | Installa o attiva la CLI ufficiale DSH. |
| Il plugin appare come "disattivato" | Controlla la composizione del profilo. |
| `MISSING_CREDENTIAL` | Conserva il riferimento `apiKeyEnv` della rotta nel servizio credenziali (la pagina Modelli web scrive lì) o esportalo nell'ambiente di lancio. |
| `does not declare "<modalità>" input` | Il cancello rigido di modalità ha rifiutato un allegato che il modello non dichiara — aggiungi la modalità all'`input` del modello in llm-pi-ai o cambia modello. |
| Il gateway personalizzato restituisce `Unexpected message role` | Conferma che la rotta sia realmente presa in carico (`enabled: true` e rotta identificata o elencata). |
| Testo di thinking mescolato al corpo | Conferma che `compat.thinkingFormat` sia impostato correttamente per il tuo modello. |

## 5. Rimuovere

```bash
dsh plugin --profile web remove dsh-llm-openai-completions
```

Riavvia DSH dopo — pi-ai serve ogni rotta invariata (nessuna registrazione di adattatore da disfare).
