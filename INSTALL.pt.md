# Guia de instalação (CLI oficial do DSH)

> ✅ **Revivido como 0.3.0 (2026-10-05).** Este guia cobre o takeover de transporte revivido — compatibilidade dinâmica com todos os rc de `0.1.0-rc.8` até `0.2.1-rc.4`.

Este guia usa somente o comando oficial `dsh plugin` do DSH.

Guias de instalação: [EN](./INSTALL.md) · [中文](./INSTALL.zh.md) · [日本語](./INSTALL.ja.md) · [한국어](./INSTALL.ko.md) · [DE](./INSTALL.de.md) · [ES](./INSTALL.es.md) · [FR](./INSTALL.fr.md) · [IT](./INSTALL.it.md) · [RU](./INSTALL.ru.md) · PT

READMEs: [EN](./README.md) · [中文](./README.zh.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [DE](./README.de.md) · [ES](./README.es.md) · [FR](./README.fr.md) · [IT](./README.it.md) · [RU](./README.ru.md) · [PT](./README.pt.md)

## 1. Instalar

```bash
# npm (recomendado)
dsh plugin --profile web add dsh-llm-openai-completions -w
# tgz local (sem conexão / builds anteriores)
dsh plugin --profile web add /caminho/para/dsh-llm-openai-completions-0.3.0.tgz -w
dsh web
```

No DSH Desktop: **Plugins → Adicionar plugin → colar o nome npm, uma URL do GitHub ou um caminho local absoluto** (o prefixo `file:` copia; o caminho nu vincula), depois ative e reinicie completamente o app de desktop.

## 2. Verificar a instalação

Confira a composição:

```bash
dsh --profile web --dump-default-config
```

Deve conter `llm-openai-completions` na árvore composta. Após a partida, a linha de log `[llm-openai-completions] short-circuit listener registered (prepend+global)` confirma que o ouvinte da cascata está no lugar.

## 3. Ligar

O interruptor vive na própria seção de ajustes do plugin (por padrão **desligado** — nada é assumido até você acionar):

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml (ou Ajustes → Plugins → dsh-llm-openai-completions)
llm-openai-completions:
  enabled: true
  providers:        # lista manual opcional em cima do conjunto auto-identificado
    - local-35b
```

As rotas entram na lista de takeover pela caixa por rota no painel de modelos do dsh-thinking-levels (escreve `providers` diretamente) ou editando a lista à mão; o interruptor `takeover` ali se reflete em `enabled` ao acionar.

## 4. Solução de problemas

| Sintoma | Ação |
| --- | --- |
| `dsh` não encontrado | Instale ou ative a CLI oficial do DSH. |
| O plugin aparece como "desativado" | Confira a composição do perfil. |
| `MISSING_CREDENTIAL` | Salve a referência `apiKeyEnv` da rota no serviço de credenciais (a página de Modelos web escreve ali) ou exporte-a no ambiente de lançamento. |
| `does not declare "<modalidade>" input` | A porta dura de modalidade recusou um anexo que o modelo não declara — adicione a modalidade ao `input` do modelo no llm-pi-ai ou troque de modelo. |
| O gateway personalizado devolve `Unexpected message role` | Confirme que a rota realmente está assumida (`enabled: true` e a rota identificada ou listada). |
| Texto de thinking misturado no corpo | Confirme que `compat.thinkingFormat` está bem configurado para o seu modelo. |

## 5. Remover

```bash
dsh plugin --profile web remove dsh-llm-openai-completions
```

Reinicie o DSH depois — o pi-ai atende cada rota sem mudanças (não há registro de adaptador a desfazer).
