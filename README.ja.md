# dsh-llm-openai-completions

> ✅ **0.3.0 で復活（2026-10-05）。** トランスポートテイクオーバーが、pi-ai には無い本当の機能と共に帰ってきました：マルチモーダル真送信（画像/音声/動画/PDF）＋モーダル硬性ゲート、dsh-promptbook 系コンシューマ向けの `llmOpenaiCompletions` プロンプトソース口、クレデンシャルサービス鍵、そして `0.1.0-rc.8` – `0.2.1-rc.1` の全 rc 動的互換。旧 `settings.get` 時代のアーキテクチャは退役——判定は `enabled && providers.includes(route)`（純手動メンバーシップ：ルート毎チェックボックスが真実）で、スイッチは本プラグイン自身の設定セクションにあります。契約面：[AGENTS.md](./AGENTS.md)。

**ポジショニング**：dsh-thinking-levels が結合可能なショートサーキットバックエンドとして復活——ルート毎の `api` 宣言に応じた**三大主流 API フォーマットを全実装**（OpenAI Chat Completions · Anthropic Messages · OpenAI Responses）、シャオミ MiMo マルチモーダルのために構築：音声・動画・PDF の真送信。

## README languages / 说明文档

[English](./README.md) · [中文](./README.zh.md) · 日本語 · [한국어](./README.ko.md) · [Deutsch](./README.de.md) · [Español](./README.es.md) · [Français](./README.fr.md) · [Italiano](./README.it.md) · [Русский](./README.ru.md)

インストールガイド：[EN](./INSTALL.md) · [中文](./INSTALL.zh.md) · 日本語 · [한국어](./INSTALL.ko.md) · [DE](./INSTALL.de.md) · [ES](./INSTALL.es.md) · [FR](./INSTALL.fr.md) · [IT](./INSTALL.it.md) · [RU](./INSTALL.ru.md) — [変更履歴](./CHANGELOG.md)

**カスタムゲートウェイ向け OpenAI-completions 互換トランスポートテイクオーバー**（vLLM / LM Studio / セルフホスト OpenAI プロキシ）：テイクオーバーされたルートの `llm/stream` ウォーターフォールをショートサーキットし、推測しない挙動で提供します——データプレーン（baseURL / models / `reasoningEfforts` / `compat` / `input`）は **llm-pi-ai** に留まり、`settings.describe()` でリアルタイム読み取りされます。

- `system` は**常に** `role: "system"` —— カスタムゲートウェイに `developer` は送られないため、thinking 有効時も `Unexpected message role` 400 は消えています（pi-ai の `detectCompat` は標準でない URL に `supportsDeveloperRole: true` をデフォルト設定し、`reasoningEfforts` テーブルでモデルが推論可能とマークされると全ゲートウェイを壊します）。
- thinking はモデルの `compat.thinkingFormat` で制御：
  - トグル型モデル（`reasoningEfforts` テーブルあり、`supportsReasoningEffort` なし）→ 設定形式に関わらず常に `chat_template_kwargs.enable_thinking`（+ 保持）——素の vLLM の Qwen3 テンプレートが認めるのはこれだけ
  - `qwen` → トップレベル `enable_thinking: boolean`（`reasoning_effort` も budget もなし）
  - `qwen-chat-template` → `chat_template_kwargs.enable_thinking`（+ 保持）
  - effort 対応 → `reasoning_effort` パススルー（Qwen3.8 風）
- 受信側は Qwen3 風 `</think>` コンテンツ（vLLM は thinking を `reasoning_content` フィールドなしで `content` に描画）を reasoning ブロックに分割し、`reasoning_content` / `reasoning` / `reasoning_text` の 3 フィールドを認識します。
- `thinking_budget` は意図的に送信しません（切断の驚きを避けるため）。

## 🎉 0.3.0 — マルチモーダル真送信＋モーダル硬性ゲート

ショートサーキットは、ホストが file ブロックをテキストハンドルに投影する**前**にウォーターフォールを消費するため、メディアは構造ブロックのまま到着し直接ワイヤへエンコードされます——ホストパッチ不要、ハンドル再構築不要：

- **画像** → `image_url` data-URI パート（複数画像の数と順序を保持、テキストは元順でインターリーブ）
- **音声** → `input_audio` パート（base64 + フォーマット）
- **動画** → `video_url` data-URI パート（インライン上限 20 MB）
- **PDF** → OpenAI `file` パート
- **モーダル硬性ゲート**：送信前に履歴全体の全メディアブロックをモデルの llm-pi-ai `input` 宣言と照合；未宣言モーダルはテキストへ静默劣化する代わりに**大声で拒否**されます（`INVALID_REQUEST`、モーダル名を明示）。
- ワンショット呼び出し（`session-title`）はメディアブロックを剥がし、決して思考しません。
- バイトはアタッチメントサービスから（`readImage` / `readFileStream`）；非ビジョンモデルの画像は変わらず大声で拒否（`UNSUPPORTED_CONTENT`）。

## 🎉 0.3.0 — `llmOpenaiCompletions` プロンプトソース口

`ctx.provide("llmOpenaiCompletions", { listHostedModels, registerPromptSource })`——dsh-llm-mimo の `llmMimo` と同一契約で、dsh-promptbook 系コンシューマ向け：`(provider, model)` ごとに**実際に送出される**システムプロンプトとツール説明を置換。決定論的純関数（キャッシュ安全）、テキストのみ（`name`/`parameters` は触らない）、ソース未登録なら挙動ゼロ。スコープ保証：テイクオーバールートのディスパッチ内でのみ参照。完全契約：[AGENTS.md §1](./AGENTS.md)。

## 三つのワイヤ面（ルート毎の `api`）

| 面 | エンドポイント | 認証 | thinking | モーダル |
|---|---|---|---|---|
| `openai-completions`（既定） | `{base}/chat/completions` | Bearer | thinkingFormat マトリクス | 画像/音声/動画/PDF |
| `anthropic-messages` | `{base}/v1/messages` | `x-api-key` + バージョン header | off/ワンショット → disabled | **画像のみ** |
| `openai-responses` | `{base}/responses` | Bearer | `reasoning.effort`（正直に折りたたみ） | 画像/音声/動画/PDF |

- 全面共通：`max_tokens` = リクエスト値 → モデル行 → ルート既定 → 8192；leading system メッセージは各面の system チャネルへ抽出し、メッセージ列から剥がします。
- Anthropic ペア規律：tool_use/tool_result は必ずペア（壊れた履歴 = 大声の `INVALID_REQUEST`）；アシスタント思考は再生しません（harness に署名フィールドなし——chat 面より厳密に弱い）。
- Responses 境界：`stop` は破棄（Responses 綴りなし）；reasoning レベルは正直に折りたたみ；実機 MiMo エンドポイントへのプローブ校正は今後。

## テイクオーバー判定（単一の事実源）

```
takeover(route) = section.enabled === true
                  && section.providers.includes(route)
```

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml（または 設定 → プラグイン → dsh-llm-openai-completions）
llm-openai-completions:
  enabled: true
  providers:        # テイクオーバーリスト——唯一の真実（下記参照）
    - local-35b
```

- スイッチとテイクオーバーリストは本プラグイン**自身の設定セクション**にあります（`.volatile()`——実行時変更可、ホスト生成フォーム）。
- **dsh-thinking-levels が両フィールドを駆動**：その `takeover` スイッチは `{enabled}` を本セクションへミラーし、モデルパネルのルート毎テイクオーバーチェックボックスが `providers` を直接書き込みます——チェックボックスが真実であり、dispatch・`listHostedModels`・コントロール層ゲーティングは同じ集合を読みます。
- スイッチ解除（またはプラグイン取り外し）でそのまま pi-ai へフォールスルー——巻き戻すべきアダプター登録はありません。
- llm-pi-ai の設定はそのまま（1 つの共有設定；本アダプターは読むだけ——フィールド全表：[docs/settings-spec.md](docs/settings-spec.md)、テイクオーバー契約：[docs/takeover-spec.md](docs/takeover-spec.md)）：

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
            thinkingFormat: qwen        # enable_thinking のみ、reasoning_effort なし
```

## プレビュー

実機スクリーンショット——**dsh-thinking-levels との連携**：カスタムモデルの「思考可能」レベルドロップダウン（デフォルト/オフ/オン）。能力検出 → テイクオーバー連鎖の実演：

<figure>
  <img style="max-width:100%" alt="カスタムモデル思考レベルドロップダウン（Qwen3.6-35B-A3B、デフォルト/オフ/オン）：検出＋テイクオーバー連鎖——dsh-thinking-levels の能力カードが llm-pi-ai モデルエントリに input/reasoningEfforts/compat を書き込み、本アダプターが読み取ってワイヤ挙動を引き受けます（compat.thinkingFormat: qwen→enable_thinking、effort 対応→reasoning_effort パススルー）" src="assets/自定义模型的可思考.png" />
  <figcaption>能力カード＋テイクオーバー連鎖：1 つの共有 llm-pi-ai 設定——<strong>カードが検出</strong>し（input/reasoningEfforts/compat を書き込み）、<strong>トランスポートがワイヤを引き受ける</strong>（compat.thinkingFormat に応じ enable_thinking / reasoning_effort を送信）。</figcaption>
</figure>

## インストール

ホスト互換：**`0.1.0-rc.8` から `0.2.1-rc.1` までの全 rc**、コード内でバージョン条件付き互換（形状検出 settings 面、`ToolCallId`/`CallId` shim、クレデンシャル credentials → 起動環境 → `process.env` の 3 段チェーン）。全導入経路は[インストールガイド](./INSTALL.ja.md)へ：

```bash
# npm（推奨）
dsh plugin --profile web add dsh-llm-openai-completions -w
# ローカル tgz
dsh plugin --profile web add /path/to/dsh-llm-openai-completions-0.3.0.tgz -w
dsh web
```

## 既知の限界

- **PDF 対応はエンドポイント依存**（MiMo chat は即 400、一部リレーは受領）——`input` 宣言は能力宣言です；`pdf` を宣言する前にエンドポイントを確認してください。
- **非メディアファイル添付**（例：`.txt`）にはクロスゲートウェイのワイヤ形状がありません；テイクオーバールートではテキストプレースホルダへ劣化します（内容はファイルツール経由で引き続き到達可能）。
- **`thinking_budget` は送信しない**（意図的）。
- 思考レベルの**セレクター**は引き続きモデルの推論メタデータから（llm-pi-ai + dsh-thinking-levels）；本トランスポートが制御するのはワイヤ挙動のみです。
- インストール後 `dsh web` を再起動；テイクオーバーリスナーは boot 時に組み込まれます。

## 開発

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest（config / identify / serialize / sse / translate / prompt-source / version-conditional）
npm run build       # tsc → lib/
node scripts/audit-host-faces.mjs   # 15-rc 依存面オーディット
```

## 上流への提案

本プラグインは llm-pi-ai / pi-ai 互換ギャップのリファレンス実装も兼ねます：カスタム URL は `supportsDeveloperRole: false` をデフォルトに、受信側は `</think>` コンテンツを分割すべきで、`compat` は真に対応するゲートウェイ向けに `supportsDeveloperRole` を公開すべきです——そしてホスト投影層は、本プラグインがルート毎に適用するのと同じ能力認識 file ブロックゲートを育てられます。
