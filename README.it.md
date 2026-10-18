# dsh-llm-openai-completions

> ✅ **Rinato in vita come 0.3.0 (2026-10-05).** La presa in carico del trasporto è tornata con funzioni reali che pi-ai non può offrire: invio veramente multimodale (immagine/audio/video/PDF) con un cancello rigido di modalità, una giunzione di sorgente di prompt `llmOpenaiCompletions` per consumatori di tipo dsh-promptbook, chiavi via servizio credenziali e compatibilità dinamica di tutti gli rc da `0.1.0-rc.8` a `0.2.1-rc.2`. La vecchia architettura dell'era `settings.get` è andata in pensione — il giudizio è `enabled && providers.includes(route)` (appartenenza puramente manuale: la casella per rotta è la verità) e l'interruttore vive nella sezione impostazioni di questo plugin. Superfici di contratto: [AGENTS.md](./AGENTS.md).

**Posizionamento**: rinato come backend a cortocircuito che dsh-thinking-levels può azionare — parlante **tutti e tre i formati API principali** secondo la dichiarazione `api` di ciascuna rotta (OpenAI Chat Completions · Anthropic Messages · OpenAI Responses), costruito principalmente per il multimodale di Xiaomi MiMo: vero invio audio/video/PDF.

## Lingue del README / 说明文档

[English](./README.md) · [中文](./README.zh.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [Deutsch](./README.de.md) · [Español](./README.es.md) · [Français](./README.fr.md) · Italiano · [Русский](./README.ru.md)

Guide di installazione: [EN](./INSTALL.md) · [中文](./INSTALL.zh.md) · [日本語](./INSTALL.ja.md) · [한국어](./INSTALL.ko.md) · [DE](./INSTALL.de.md) · [ES](./INSTALL.es.md) · [FR](./INSTALL.fr.md) · [IT](./INSTALL.it.md) · [RU](./INSTALL.ru.md) — [Registro delle modifiche](./CHANGELOG.md)

**Presa in carico del trasporto compatibile OpenAI-completions per gateway personalizzati** (vLLM / LM Studio / proxy OpenAI self-hosted): il plugin cortocircuita la cascata `llm/stream` per le rotte prese in carico e le serve con un comportamento che non indovina mai — il piano dati (baseURL / models / `reasoningEfforts` / `compat` / `input`) resta in **llm-pi-ai**, letto in tempo reale tramite `settings.describe()`.

- `system` è **sempre** `role: "system"` — un gateway personalizzato non riceve mai `developer`, quindi l'errore 400 `Unexpected message role` è sparito anche con il thinking attivo (il `detectCompat` di pi-ai imposta `supportsDeveloperRole: true` per impostazione predefinita sugli URL non standard, il che rompe ogni gateway personalizzato non appena una tabella `reasoningEfforts` segna il modello come ragionante).
- Il thinking è guidato dal `compat.thinkingFormat` del modello:
  - modelli a interruttore (tabella `reasoningEfforts`, senza `supportsReasoningEffort`) → sempre `chat_template_kwargs.enable_thinking` (+ preserve), indipendentemente dal formato configurato — perché è l'unica cosa che i template Qwen3 di vLLM nudo onorano
  - `qwen` → `enable_thinking: boolean` di primo livello (niente `reasoning_effort`, niente budget)
  - `qwen-chat-template` → `chat_template_kwargs.enable_thinking` (+ preserve)
  - con capacità effort → passaggio diretto di `reasoning_effort` (stile Qwen3.8)
- Il lato ricezione divide il contenuto `</think>` in stile Qwen3 (vLLM rende il thinking in `content` senza campo `reasoning_content`) in un blocco di reasoning, e legge `reasoning_content` / `reasoning` / `reasoning_text`.
- Nessun `thinking_budget` viene inviato (deliberato: evitare sorprese di troncamento).

## 🎉 0.3.0 — Invio multimodale vero con cancello rigido di modalità

Il cortocircuito consuma la cascata **prima** che l'host proietti i blocchi file in maniglie di testo — i media arrivano strutturali e vengono codificati per il filo: nessuna patch all'host, nessuna ricostruzione di maniglie:

- **immagine** → parti `image_url` data-URI (numero e ordine multi-immagine preservati, testo intercalato nell'ordine di origine)
- **audio** → parti `input_audio` (base64 + formato)
- **video** → parti `video_url` data-URI (tetto in linea di 20 MB)
- **PDF** → parti `file` OpenAI
- **Cancello rigido di modalità**: ogni blocco multimediale dell'intera cronologia viene verificato contro la dichiarazione `input` llm-pi-ai del modello prima di qualsiasi lettura o invio; una modalità non dichiarata viene rifiutata ad alta voce (`INVALID_REQUEST`, nominando la modalità) invece di essere degradata silenziosamente in testo.
- Le chiamate one-shot (`session-title`) tolgono i blocchi multimediali e non pensano mai.
- I byte vengono dal servizio allegati (`readImage` / `readFileStream`); i modelli non vision continuano a rifiutare le immagini ad alta voce (`UNSUPPORTED_CONTENT`).

## 🎉 0.3.0 — La giunzione di sorgente di prompt `llmOpenaiCompletions`

`ctx.provide("llmOpenaiCompletions", { listHostedModels, registerPromptSource })` — lo stesso contratto che dsh-llm-mimo espone come `llmMimo`, per consumatori di tipo dsh-promptbook: sostituire il prompt di sistema e le descrizioni degli strumenti **realmente inviati** per `(provider, model)`, in modo deterministico (sicuro per la cache), solo testo (mai `name`/`parameters`), comportamento zero senza sorgente registrata. Garanzia di portata: consultato solo nel dispatch delle rotte prese in carico. Contratto completo: [AGENTS.md §1](./AGENTS.md).

## Tre facce di filo (per rotta `api`)

| faccia | endpoint | auth | thinking | modalità |
|---|---|---|---|---|
| `openai-completions` (predefinita) | `{base}/chat/completions` | Bearer | matrice thinkingFormat | immagine/audio/video/PDF |
| `anthropic-messages` | `{base}/v1/messages` | `x-api-key` + header di versione | off/one-shot → disabled | **solo immagine** |
| `openai-responses` | `{base}/responses` | Bearer | `reasoning.effort` (piega onesta) | immagine/audio/video/PDF |

- Tutte le facce: `max_tokens` = valore della richiesta → riga del modello → predefinito della rotta → 8192; il messaggio system iniziale viene estratto nel canale system della faccia e rimosso dall'elenco.
- Disciplina di accoppiamento anthropic: tool_use/tool_result devono accoppiarsi (cronologia rotta = `INVALID_REQUEST` ad alta voce); il thinking dell'assistente non viene riprodotto (nessun campo firma nell'harness — rigorosamente più debole della faccia chat).
- Confini responses: `stop` scartato (nessuna ortografia Responses); livelli di reasoning piegati onestamente; calibrazione tramite sonda contro endpoint MiMo reali in arrivo.

## Giudizio di presa in carico (unica fonte di verità)

```
takeover(route) = section.enabled === true
                  && section.providers.includes(route)
```

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml (o Impostazioni → Plugin → dsh-llm-openai-completions)
llm-openai-completions:
  enabled: true
  providers:        # l'elenco di presa in carico — l'unica verità (vedi sotto)
    - local-35b
```

- L'interruttore e l'elenco di presa in carico vivono nella **propria sezione impostazioni di questo plugin** (`.volatile()` — modificabile a runtime, modulo generato dall'host).
- **dsh-thinking-levels aziona entrambi i campi**: il suo interruttore `takeover` specchia `{enabled}` in questa sezione, e la casella di presa in carico per rotta del suo pannello modelli scrive `providers` direttamente — la casella è la verità; dispatch, `listHostedModels` e il filtro del livello di controllo leggono lo stesso insieme.
- Disattivare l'interruttore (o smontare il plugin) ricade su pi-ai invariato — nessuna registrazione di adattatore da disfare.
- La tua configurazione llm-pi-ai resta com'è (una configurazione condivisa; questo adattatore la legge soltanto — tabella completa dei campi: [docs/settings-spec.md](docs/settings-spec.md), contratto di presa in carico: [docs/takeover-spec.md](docs/takeover-spec.md)):

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
            thinkingFormat: qwen        # solo enable_thinking, niente reasoning_effort
```

## Anteprima

Schermata dal vivo — **alimentato insieme a dsh-thinking-levels**: il menu a tendina del livello "pensabile" del modello personalizzato (Predefinito/Off/On). Dimostra la catena rilevamento → presa in carico:

<figure>
  <img style="max-width:100%" alt="Menu a tendina del livello di thinking del modello personalizzato (Qwen3.6-35B-A3B, Predefinito/Off/On): catena rilevamento + presa in carico — la scheda di capacità di dsh-thinking-levels scrive input/reasoningEfforts/compat nella voce del modello llm-pi-ai, poi l'adattatore dsh-llm-openai-completions le legge e prende in carico il comportamento del filo (compat.thinkingFormat: qwen→enable_thinking, con capacità effort→passaggio diretto di reasoning_effort)" src="assets/自定义模型的可思考.png" />
  <figcaption>Scheda di capacità + catena di presa in carico con dsh-thinking-levels: una configurazione llm-pi-ai condivisa — la <strong>scheda rileva</strong> (scrive input/reasoningEfforts/compat), il <strong>trasporto prende il filo</strong> (invia enable_thinking / reasoning_effort secondo compat.thinkingFormat).</figcaption>
</figure>

## Installazione

Compatibilità host: **ogni rc da `0.1.0-rc.8` a `0.2.1-rc.2`**, condizionale per versione nel codice (facce di settings rilevate per forma, uno shim `ToolCallId`/`CallId`, risoluzione della chiave credentials → ambiente di lancio → `process.env`). Tutte le vie nella [guida di installazione](./INSTALL.it.md):

```bash
# npm (consigliato)
dsh plugin --profile web add dsh-llm-openai-completions -w
# tgz locale
dsh plugin --profile web add /percorso/di/dsh-llm-openai-completions-0.3.0.tgz -w
dsh web
```

## Limiti noti

- **Il supporto PDF dipende dall'endpoint** (MiMo chat lo rifiuta secco; alcuni relay lo accettano) — la dichiarazione `input` è un'affermazione di capacità; verifica il tuo endpoint prima di dichiarare `pdf`.
- **Gli allegati file non multimediali** (es. `.txt`) non hanno una forma di filo tra gateway; sulle rotte prese in carico degradano a un segnaposto testuale (il contenuto resta raggiungibile tramite gli strumenti file).
- **Niente `thinking_budget`** (deliberato).
- Il **selettore** del livello di thinking continua a venire dai metadati di reasoning del modello (llm-pi-ai + dsh-thinking-levels); questo trasporto controlla solo il comportamento del filo.
- Riavvia `dsh web` dopo l'installazione; l'ascoltatore di presa in carico si compone al boot.

## Sviluppo

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest (config / identify / serialize / sse / translate / prompt-source / version-conditional)
npm run build       # tsc → lib/
node scripts/audit-host-faces.mjs   # audit delle superfici di dipendenza 15-rc
```

## Proposta a monte

Questo plugin fa anche da implementazione di riferimento per le lacune di compatibilità llm-pi-ai / pi-ai: gli URL personalizzati dovrebbero avere `supportsDeveloperRole: false` per impostazione predefinita, il lato ricezione dovrebbe dividere il contenuto `</think>`, e `compat` dovrebbe esporre `supportsDeveloperRole` per i gateway che lo supportano davvero — e il livello di proiezione dell'host potrebbe coltivare lo stesso cancello di blocchi file consapevole delle capacità che questo plugin applica per rotta.
