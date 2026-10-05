# Guía de instalación (CLI oficial de DSH)

> ✅ **Revivido como 0.3.0 (2026-10-05).** Esta guía cubre la toma de control del transporte revivida — compatibilidad dinámica de todos los rc desde `0.1.0-rc.8` hasta `0.2.0-rc.2`.

Esta guía usa solo el comando oficial `dsh plugin` de DSH.

Guías de instalación: [EN](./INSTALL.md) · [中文](./INSTALL.zh.md) · [日本語](./INSTALL.ja.md) · [한국어](./INSTALL.ko.md) · [DE](./INSTALL.de.md) · ES · [FR](./INSTALL.fr.md) · [IT](./INSTALL.it.md) · [RU](./INSTALL.ru.md)

READMEs: [EN](./README.md) · [中文](./README.zh.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [DE](./README.de.md) · [ES](./README.es.md) · [FR](./README.fr.md) · [IT](./README.it.md) · [RU](./README.ru.md)

## 1. Instalar

```bash
# npm (recomendado)
dsh plugin --profile web add dsh-llm-openai-completions -w
# tgz local (sin conexión / compilaciones previas)
dsh plugin --profile web add /ruta/a/dsh-llm-openai-completions-0.3.0.tgz -w
dsh web
```

En DSH Desktop: **Plugins → Añadir plugin → pegar el nombre npm, una URL de GitHub o una ruta local absoluta** (el prefijo `file:` copia; la ruta desnuda enlaza), luego activar y reiniciar por completo la app de escritorio.

## 2. Verificar la instalación

Comprueba la composición:

```bash
dsh --profile web --dump-default-config
```

Debe contener `llm-openai-completions` en el árbol compuesto. Tras el arranque, la línea de registro `[llm-openai-completions] short-circuit listener registered (prepend+global)` confirma que el oyente de la cascada está en su sitio.

## 3. Encenderlo

El interruptor vive en la propia sección de ajustes del plugin (por defecto **apagado** — nada se toma hasta que lo acciones):

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml (o Ajustes → Plugins → dsh-llm-openai-completions)
llm-openai-completions:
  enabled: true
  providers:        # lista manual opcional encima del conjunto auto-identificado
    - local-35b
```

Las rutas entran en la lista de toma de control mediante la casilla por ruta del panel de modelos de dsh-thinking-levels (escribe `providers` directamente) o editando la lista a mano; el interruptor `takeover` allí se refleja en `enabled` al accionarlo.

## 4. Solución de problemas

| Síntoma | Acción |
| --- | --- |
| No se encuentra `dsh` | Instala o activa la CLI oficial de DSH. |
| El plugin aparece como "desactivado" | Revisa la composición del perfil. |
| `MISSING_CREDENTIAL` | Guarda la referencia `apiKeyEnv` de la ruta en el servicio de credenciales (la página de Modelos web escribe allí) o expórtala en el entorno de lanzamiento. |
| `does not declare "<modalidad>" input` | La compuerta dura de modalidad rechazó un adjunto que el modelo no declara — añade la modalidad al `input` del modelo en llm-pi-ai o cambia de modelo. |
| El gateway personalizado devuelve `Unexpected message role` | Confirma que la ruta realmente está tomada (`enabled: true` y la ruta identificada o listada). |
| Texto de thinking mezclado en el cuerpo | Confirma que `compat.thinkingFormat` está bien configurado para tu modelo. |

## 5. Eliminar

```bash
dsh plugin --profile web remove dsh-llm-openai-completions
```

Reinicia DSH después — pi-ai sirve cada ruta sin cambios (no hay registro de adaptador que deshacer).
