# dsh-llm-openai-completions

**カスタムゲートウェイ用 OpenAI-completions 互換アダプター**（vLLM / LM Studio / 自己ホスト OpenAI プロキシ）—— `llm-deepseek` および `llm-pi-ai` に並ぶ「第四のアダプタークラス」で、推測しない挙動を提供します：

- `system` 役割は**常に** `role: "system"` —— カスタムゲートウェイに `developer` は送られないため、thinking が有効でも `Unexpected message role` 400 は消えています（pi-ai の `detectCompat` は標準でない URL に `supportsDeveloperRole: true` をデフォルト設定し、`reasoningEfforts` テーブルでモデルが推論可能とマークされると全てのゲートウェイを壊します）。
- thinking はモデルの `compat.thinkingFormat` で制御：
  - `qwen` → `enable_thinking: boolean` を送信（Qwen3.6 風；`reasoning_effort` も budget もなし）
  - `qwen-chat-template` → `chat_template_kwargs.enable_thinking`（+ 保持）
  - effort 対応 → `reasoning_effort` のパースルー（Qwen3.8 風）
- 受信側で Qwen3 風の `</think>` コンテンツを分割 —— thinking テキストを reasoning block に分離（vLLM は thinking を `content` フィールドにレンダリングし、`reasoning_content` フィールドなし） —— thinking テキストが本文に混入しなくなります。

設定は **llm-pi-ai** 設定セクション（設定 → モデル）にあります：baseURL、models、`reasoningEfforts`、`compat.thinkingFormat`。本プラグインはあなたがリストしたプロバイダの wire 挙動のみを置換します。

## インストール

```bash
# npm（推奨）
dsh plugin --profile web add dsh-llm-openai-completions -w
# ローカル link（開発）
# dsh plugin --profile web add link:E:/test/rewrite-agently/dsh-llm-openai-completions -w
dsh web
```

## 有効化

本プラグインはあなたがリストしたプロバイダのストリームを置換します（デフォルトオフ；llm-pi-ai が所有する既存ルートは再登録されずラップされるため、衝突しません）。**ショートサーキット設定契約 —— `llm-openai-completions` 名前空間、フィールド、接管セマンティクス、wire 挙動 —— は [docs/settings-spec.md](docs/settings-spec.md) で指定されています。** 本接管メカニズムと連携したいサードパーティプラグイン（例：dsh-thinking-effort 制御層）は標準の **[docs/takeover-spec.md](docs/takeover-spec.md)**（接管制御仕様）に従ってください。

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml（または 設定 → プラグイン → dsh-llm-openai-completions）
llm-openai-completions:
  enabled: true
  providers:
    - local-35b
```

あなたの `local-35b / Qwen3.6-35B-A3B` 設定は llm-pi-ai にそのまま残ります：

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

## 既知の制限 (v0.1.0)

- **テキストのみ**：画像ブロックは `UNSUPPORTED_CONTENT` で拒否（画像バイトは添付サービスにあり、v1 では範囲外）。
- **`thinking_budget` なし**（意図的：切り落としの予期せぬ事態を避けるため）。
- thinking レベルの**セレクタ**は依然としてモデルの推論メタデータ由来（llm-pi-ai + dsh-thinking-levels の Off/On トグル）；本プラグインは wire 挙動を制御します。
- インストール後 `dsh web` を再起動；wrap は `llm/adapters-updated` で再適用されます。

## 開発

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest（serialize / sse / translate）
npm run build       # tsc → lib/
```

E2E チェック：`node <repo>/scripts/...` または tests 内のローカル SSE サーバーハネス（system 役割 / enable_thinking / `</think>` 分割を模擬 vLLM でテスト）。

## アップストリーム提案

本プラグインは llm-pi-ai / pi-ai の互換性ギャップの参照実装としても機能します：カスタム URL はデフォルトで `supportsDeveloperRole: false` になるべき、受信側は `escaped` コンテンツを分割するべき、`compat` は真にサポートするゲートウェイ向けに `supportsDeveloperRole` を公開するべきです。

## License

MIT
