# Guide d'installation (CLI officielle DSH)

> ✅ **Ressuscité en 0.3.0 (2026-10-05).** Ce guide couvre la prise de contrôle du transport ressuscitée — compatibilité dynamique de tous les rc de `0.1.0-rc.8` à `0.2.1-rc.4`.

Ce guide n'utilise que la commande officielle `dsh plugin` de DSH.

Guides d'installation : [EN](./INSTALL.md) · [中文](./INSTALL.zh.md) · [日本語](./INSTALL.ja.md) · [한국어](./INSTALL.ko.md) · [DE](./INSTALL.de.md) · [ES](./INSTALL.es.md) · FR · [IT](./INSTALL.it.md) · [RU](./INSTALL.ru.md)

READMEs : [EN](./README.md) · [中文](./README.zh.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [DE](./README.de.md) · [ES](./README.es.md) · [FR](./README.fr.md) · [IT](./README.it.md) · [RU](./README.ru.md)

## 1. Installer

```bash
# npm (recommandé)
dsh plugin --profile web add dsh-llm-openai-completions -w
# tgz local (hors ligne / versions préliminaires)
dsh plugin --profile web add /chemin/vers/dsh-llm-openai-completions-0.3.0.tgz -w
dsh web
```

Sur DSH Desktop : **Plugins → Ajouter un plugin → coller le nom npm, une URL GitHub ou un chemin local absolu** (le préfixe `file:` copie ; un chemin nu lie), puis activer et redémarrer entièrement l'application de bureau.

## 2. Vérifier l'installation

Vérifiez la composition :

```bash
dsh --profile web --dump-default-config
```

Elle doit contenir `llm-openai-completions` dans l'arbre composé. Après le démarrage, la ligne de journal `[llm-openai-completions] short-circuit listener registered (prepend+global)` confirme que l'écouteur de cascade est en place.

## 3. L'allumer

L'interrupteur vit dans la propre section de réglages du plugin (par défaut **désactivé** — rien n'est pris tant que vous ne le basculez pas) :

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml (ou Réglages → Plugins → dsh-llm-openai-completions)
llm-openai-completions:
  enabled: true
  providers:        # liste manuelle optionnelle par-dessus l'ensemble auto-identifié
    - local-35b
```

Les routes entrent dans la liste de prise de contrôle via la case à cocher par route du panneau de modèles de dsh-thinking-levels (il écrit `providers` directement) ou en éditant la liste à la main ; l'interrupteur `takeover` là-bas se reflète dans `enabled` lorsqu'on le bascule.

## 4. Dépannage

| Symptôme | Action |
| --- | --- |
| `dsh` introuvable | Installez ou activez la CLI officielle DSH. |
| Le plugin apparaît comme « désactivé » | Vérifiez la composition du profil. |
| `MISSING_CREDENTIAL` | Rangez la référence `apiKeyEnv` de la route dans le service de credentials (la page Models web y écrit) ou exportez-la dans l'environnement de lancement. |
| `does not declare "<modalité>" input` | La porte dure de modalité a refusé une pièce jointe que le modèle ne déclare pas — ajoutez la modalité au `input` du modèle dans llm-pi-ai, ou changez de modèle. |
| La passerelle personnalisée renvoie `Unexpected message role` | Confirmez que la route est réellement prise (`enabled: true` et la route identifiée ou listée). |
| Texte de thinking mélangé au corps | Confirmez que `compat.thinkingFormat` est bien réglé pour votre modèle. |

## 5. Retirer

```bash
dsh plugin --profile web remove dsh-llm-openai-completions
```

Redémarrez DSH ensuite — pi-ai sert chaque route à l'identique (aucun enregistrement d'adaptateur à défaire).
