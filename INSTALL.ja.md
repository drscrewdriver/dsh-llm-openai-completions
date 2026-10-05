# インストールガイド（公式 DSH CLI）

> ✅ **0.3.0 で復活（2026-10-05）。** 本ガイドは復活したトランスポートテイクオーバーを対象——`0.1.0-rc.8` から `0.2.0-rc.2` まで全 rc 動的互換。

本ガイドは公式 `dsh plugin` コマンドのみを使用します。

インストールガイド：[EN](./INSTALL.md) · [中文](./INSTALL.zh.md) · 日本語 · [한국어](./INSTALL.ko.md) · [DE](./INSTALL.de.md) · [ES](./INSTALL.es.md) · [FR](./INSTALL.fr.md) · [IT](./INSTALL.it.md) · [RU](./INSTALL.ru.md)

README：[EN](./README.md) · [中文](./README.zh.md) · 日本語 · [한국어](./README.ko.md) · [DE](./README.de.md) · [ES](./README.es.md) · [FR](./README.fr.md) · [IT](./README.it.md) · [RU](./README.ru.md)

## 1. インストール

```bash
# npm（推奨）
dsh plugin --profile web add dsh-llm-openai-completions -w
# ローカル tgz（オフライン / プレリリースビルド）
dsh plugin --profile web add /path/to/dsh-llm-openai-completions-0.3.0.tgz -w
dsh web
```

DSH デスクトップ：**プラグイン → プラグインを追加 → npm 名・GitHub URL・ローカル絶対パスを貼り付け**（`file:` はコピー式、裸パスはリンク式）、有効化してデスクトップアプリを完全再起動。

## 2. インストール確認

構成を確認：

```bash
dsh --profile web --dump-default-config
```

構成ツリーに `llm-openai-completions` が含まれるはずです。起動後、ログに `[llm-openai-completions] short-circuit listener registered (prepend+global)` が出ればウォーターフォールリスナーの設置を確認できます。

## 3. スイッチを入れる

スイッチは本プラグイン自身の設定セクションにあります（デフォルト **オフ**——反転するまで何もテイクオーバーしません）：

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml（または 設定 → プラグイン → dsh-llm-openai-completions）
llm-openai-completions:
  enabled: true
  providers:        # 手動リスト、自動識別セットに重ねる（任意）
    - local-35b
```

ルートは dsh-thinking-levels のモデルパネルのルート毎チェックボックスからテイクオーバーリストに入ります（`providers` を直接書き込み）、またはリストを手動編集；そこの `takeover` スイッチは反転時に `enabled` へミラーされます。

## 4. トラブルシューティング

| 症状 | 対処 |
| --- | --- |
| `dsh` が見つからない | 公式 DSH CLI をインストールまたは有効化。 |
| プラグインが「無効」表示 | プロファイル構成を確認。 |
| `MISSING_CREDENTIAL` | ルートの `apiKeyEnv` 参照をクレデンシャルサービスに保存（Web のモデルページが書き込みます）するか、起動環境でエクスポート。 |
| `does not declare "<モーダル>" input` | モーダル硬性ゲートがモデル未宣言の添付を拒否——llm-pi-ai のモデル `input` にそのモーダルを追加するか、モデルを変更。 |
| カスタムゲートウェイが `Unexpected message role` を返す | ルートが実際にテイクオーバーされているか確認（`enabled: true` かつルートが識別・リスト済み）。 |
| 思考テキストが本文に混入 | モデルの `compat.thinkingFormat` 設定を確認。 |

## 5. 削除

```bash
dsh plugin --profile web remove dsh-llm-openai-completions
```

その後 DSH を再起動——pi-ai が全ルートをそのまま提供します（巻き戻すべきアダプター登録はありません）。
