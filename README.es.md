# dsh-llm-openai-completions

> ✅ **Revivido como 0.3.0 (2026-10-05).** La toma de control del transporte ha vuelto con funciones reales que pi-ai no puede ofrecer: envío verdadeiramente multimodal (imagen/audio/vídeo/PDF) con una compuerta dura de modalidad, una costura de fuente de prompt `llmOpenaiCompletions` para consumidores tipo dsh-promptbook, claves vía servicio de credenciales y compatibilidad dinámica de todos los rc entre `0.1.0-rc.8` – `0.2.1-rc.4`. La arquitectura de la era `settings.get` se retiró — el juicio es `enabled && providers.includes(route)` (pertenencia puramente manual: la casilla por ruta es la verdad) y el interruptor vive en la propia sección de ajustes de este plugin. Superficies de contrato: [AGENTS.md](./AGENTS.md).

**Posicionamiento**: revivido como backend de cortocircuito que dsh-thinking-levels puede accionar — hablando **los tres formatos API mainstream** según la declaración `api` de cada ruta (OpenAI Chat Completions · Anthropic Messages · OpenAI Responses), construido principalmente para el multimodal de Xiaomi MiMo: envío real de audio/vídeo/PDF.

## Idiomas del README / 说明文档

[English](./README.md) · [中文](./README.zh.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [Deutsch](./README.de.md) · Español · [Français](./README.fr.md) · [Italiano](./README.it.md) · [Русский](./README.ru.md)

Guías de instalación: [EN](./INSTALL.md) · [中文](./INSTALL.zh.md) · [日本語](./INSTALL.ja.md) · [한국어](./INSTALL.ko.md) · [DE](./INSTALL.de.md) · [ES](./INSTALL.es.md) · [FR](./INSTALL.fr.md) · [IT](./INSTALL.it.md) · [RU](./INSTALL.ru.md) — [Registro de cambios](./CHANGELOG.md)

**Toma de control de transporte compatible con OpenAI-completions para gateways personalizados** (vLLM / LM Studio / proxies OpenAI autoalojados): el plugin hace cortocircuito en la cascada `llm/stream` para las rutas tomadas y las sirve con un comportamiento que nunca adivina — el plano de datos (baseURL / models / `reasoningEfforts` / `compat` / `input`) permanece en **llm-pi-ai**, leído en vivo vía `settings.describe()`.

- `system` es **siempre** `role: "system"` — un gateway personalizado nunca recibe `developer`, así que el 400 `Unexpected message role` desaparece incluso con thinking activado (el `detectCompat` de pi-ai pone `supportsDeveloperRole: true` por defecto para URLs no estándar, lo que rompe cada gateway personalizado en cuanto una tabla `reasoningEfforts` marca el modelo como de razonamiento).
- El thinking lo dirige el `compat.thinkingFormat` del modelo:
  - modelos toggle (tabla `reasoningEfforts`, sin `supportsReasoningEffort`) → siempre `chat_template_kwargs.enable_thinking` (+ preserve), sin importar el formato configurado — porque es lo único que honran las plantillas Qwen3 de vLLM desnudo
  - `qwen` → `enable_thinking: boolean` de nivel superior (sin `reasoning_effort`, sin presupuesto)
  - `qwen-chat-template` → `chat_template_kwargs.enable_thinking` (+ preserve)
  - con capacidad de effort → paso directo de `reasoning_effort` (estilo Qwen3.8)
- El lado de recepción divide el contenido `</think>` estilo Qwen3 (vLLM renderiza el thinking en `content` sin campo `reasoning_content`) en un bloque de razonamiento, y lee `reasoning_content` / `reasoning` / `reasoning_text`.
- No se envía `thinking_budget` (deliberado: evitar sorpresas de truncamiento).

## 🎉 0.3.0 — Envío multimodal verdadero con compuerta dura de modalidad

El cortocircuito consume la cascada **antes** de que el host projete los bloques file a manejadores de texto, así que los medios llegan estructurales y se codifican para el cable — sin parches de host, sin reconstrucción de manejadores:

- **imagen** → partes `image_url` data-URI (conteo y orden multiimagen preservados, texto intercalado en orden de origen)
- **audio** → partes `input_audio` (base64 + formato)
- **vídeo** → partes `video_url` data-URI (límite en línea de 20 MB)
- **PDF** → partes `file` de OpenAI
- **Compuerta dura de modalidad**: cada bloque de medios del historial completo se verifica contra la declaración `input` de llm-pi-ai del modelo antes de leer o enviar nada; una modalidad no declarada se rechaza en voz alta (`INVALID_REQUEST`, nombrando la modalidad) en vez de degradarse silenciosamente a texto.
- Las llamadas de una sola vez (`session-title`) quitan los bloques de medios y nunca piensan.
- Los bytes vienen del servicio de adjuntos (`readImage` / `readFileStream`); los modelos sin visión siguen rechazando imágenes en voz alta (`UNSUPPORTED_CONTENT`).

## 🎉 0.3.0 — La costura de fuente de prompt `llmOpenaiCompletions`

`ctx.provide("llmOpenaiCompletions", { listHostedModels, registerPromptSource })` — el mismo contrato que dsh-llm-mimo expone como `llmMimo`, para consumidores tipo dsh-promptbook: reemplazar el prompt de sistema y las descripciones de herramientas **realmente despachadas** por `(provider, model)`, determinísticamente (seguro para caché), solo texto (nunca `name`/`parameters`), comportamiento cero sin fuente registrada. Garantía de alcance: consultado solo en rutas tomadas. Contrato completo: [AGENTS.md §1](./AGENTS.md).

## Tres caras de cable (por ruta `api`)

| cara | endpoint | auth | thinking | modalidades |
|---|---|---|---|---|
| `openai-completions` (por defecto) | `{base}/chat/completions` | Bearer | matriz thinkingFormat | imagen/audio/vídeo/PDF |
| `anthropic-messages` | `{base}/v1/messages` | `x-api-key` + header de versión | off/una vez → disabled | **solo imagen** |
| `openai-responses` | `{base}/responses` | Bearer | `reasoning.effort` (pliegue honesto) | imagen/audio/vídeo/PDF |

- Todas las caras: `max_tokens` = valor de la petición → fila del modelo → por defecto de la ruta → 8192; el mensaje system inicial se extrae al canal system de la cara y se elimina de la lista.
- Disciplina de emparejamiento anthropic: tool_use/tool_result deben emparejarse (historial roto = `INVALID_REQUEST` en voz alta); el thinking del asistente no se reproduce (sin campo de firma en el harness — estrictamente más débil que la cara chat).
- Límites de responses: `stop` descartado (sin ortografía Responses); niveles de reasoning plegados honestamente; calibración por sonda contra endpoints MiMo reales pendiente.

## Juicio de toma de control (única fuente de verdad)

```
takeover(route) = section.enabled === true
                  && section.providers.includes(route)
```

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml (o Ajustes → Plugins → dsh-llm-openai-completions)
llm-openai-completions:
  enabled: true
  providers:        # la lista de toma de control — la única verdad (ver abajo)
    - local-35b
```

- El interruptor y la lista de toma de control viven en la **propia sección de ajustes de este plugin** (`.volatile()` — editable en tiempo de ejecución, formulario generado por el host).
- **dsh-thinking-levels acciona ambos campos**: su interruptor `takeover` refleja `{enabled}` en esta sección, y la casilla de toma de control por ruta de su panel de modelos escribe `providers` directamente — la casilla es la verdad; el dispatch, `listHostedModels` y el filtro de la capa de control leen el mismo conjunto.
- Desactivar el interruptor (o desmontar el plugin) cae a pi-ai sin cambios — no hay registro de adaptador que deshacer.
- Tu configuración de llm-pi-ai queda como está (una configuración compartida; este adaptador solo la lee — tabla completa de campos: [docs/settings-spec.md](docs/settings-spec.md), contrato de toma de control: [docs/takeover-spec.md](docs/takeover-spec.md)):

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
            thinkingFormat: qwen        # solo enable_thinking, sin reasoning_effort
```

## Vista previa

Captura en vivo — **operado junto con dsh-thinking-levels**: el desplegable de nivel "pensable" del modelo personalizado (Predeterminado/Apagado/Encendido). Demuestra la cadena detección → toma de control:

<figure>
  <img style="max-width:100%" alt="Desplegable de nivel de thinking del modelo personalizado (Qwen3.6-35B-A3B, Predeterminado/Apagado/Encendido): cadena de detección + toma de control — la tarjeta de capacidades de dsh-thinking-levels escribe input/reasoningEfforts/compat en la entrada del modelo llm-pi-ai, y el adaptador dsh-llm-openai-completions las lee y toma el comportamiento del cable (compat.thinkingFormat: qwen→enable_thinking, con effort→paso directo de reasoning_effort)" src="assets/自定义模型的可思考.png" />
  <figcaption>Tarjeta de capacidades + cadena de toma de control con dsh-thinking-levels: una configuración llm-pi-ai compartida — la <strong>tarjeta detecta</strong> (escribe input/reasoningEfforts/compat), el <strong>transporte toma el cable</strong> (envía enable_thinking / reasoning_effort según compat.thinkingFormat).</figcaption>
</figure>

## Instalación

Compatibilidad de host: **cada rc desde `0.1.0-rc.8` hasta `0.2.1-rc.4`**, condicional por versión en el código (caras de settings detectadas por forma, un shim `ToolCallId`/`CallId`, resolución de clave credentials → entorno de lanzamiento → `process.env`). Todas las vías en la [guía de instalación](./INSTALL.es.md):

```bash
# npm (recomendado)
dsh plugin --profile web add dsh-llm-openai-completions -w
# tgz local
dsh plugin --profile web add /ruta/a/dsh-llm-openai-completions-0.3.0.tgz -w
dsh web
```

## Limitaciones conocidas

- **El soporte PDF depende del endpoint** (MiMo chat lo rechaza de plano; algunos relays lo aceptan) — la declaración `input` es una afirmación de capacidad; verifica tu endpoint antes de declarar `pdf`.
- **Los adjuntos de archivos no multimedia** (p. ej. `.txt`) no tienen forma de cable cruzando gateways; en rutas tomadas degradan a un marcador de texto (el contenido sigue accesible por las herramientas de archivos).
- **Sin `thinking_budget`** (deliberado).
- El **selector** de nivel de thinking sigue viniendo de los metadatos de razonamiento del modelo (llm-pi-ai + dsh-thinking-levels); este transporte solo controla el comportamiento del cable.
- Reinicia `dsh web` tras instalar; el oyente de toma de control se compone en el arranque.

## Desarrollo

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest (config / identify / serialize / sse / translate / prompt-source / version-conditional)
npm run build       # tsc → lib/
node scripts/audit-host-faces.mjs   # auditoría de superficies de dependencia 15-rc
```

## Propuesta aguas arriba

Este plugin sirve también como implementación de referencia para las brechas de compatibilidad de llm-pi-ai / pi-ai: las URLs personalizadas deberían tener `supportsDeveloperRole: false` por defecto, el lado de recepción debería dividir el contenido `</think>`, y `compat` debería exponer `supportsDeveloperRole` para gateways que de verdad lo soportan — y la capa de proyección del host podría cultivar la misma compuerta de bloques file consciente de capacidades que este plugin aplica por ruta.
