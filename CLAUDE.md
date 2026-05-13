# NoEatToStop

子供の食事中の咀嚼動作を Edge (IoT Greengrass + OpenCV) で監視し、食事停止時に AWS 経由でテレビ電源を自動制御するスマートシステム。

本ファイルは AI 開発エージェント（特に Claude Code）がセッション開始時に毎回読み込む軽量な指針。詳細仕様・実装パターンは下記の参照先を必要に応じて開く。

## 詳細情報の参照先

- `.kiro/specs/requirements.md` 要件定義（受入基準付き）
- `.kiro/specs/design.md` 設計書
- `.kiro/specs/tasks.md` 実装タスク
- `.kiro/steering/product.md` プロダクト概要
- `.kiro/steering/architecture.md` アーキテクチャ全体・Edge コンポーネント・ChewingAnalyzer アルゴリズム・MQTT/DynamoDB パイプライン
- `.kiro/steering/development.md` 開発ガイド・Lambda パターン・`.env.local` 変数一覧
- `.kiro/steering/git.md` Git ワークフロー・Conventional Commits・PR ガイドライン
- `.kiro/steering/structure.md` ディレクトリ構成・命名規則・CDK スタック構成
- `.kiro/steering/tech.md` 技術スタック・バージョン
- `.kiro/steering/testing.md` テスト戦略・E2E (Playwright)
- `.kiro/steering/security.md` セキュリティ・Cognito (PKCE) 認証・IAM 最小権限・PII 取扱い
- `.kiro/steering/environment.md` 開発環境（Colima / Greengrass）・Mac vs RPi 差異
- `edge/README.md` Edge 運用（RTSP・docker compose・起動手順・E2E テスト）

## 必ず守るルール

- 言語: ドキュメント・コメント・ユーザー応答はすべて日本語（コード識別子は英語）
- パッケージマネージャー: npm（pnpm 不使用）
- 一時ファイル・中間データ: `./working/` 配下にのみ配置（Git 管理外）
- Git 管理外: `.claude/`, `.mcp.json`, `.env.local`, `working/`, credentials 系
- ブランチ運用: `main` への直接コミット禁止。`feature → dev → main` の PR フロー。複数 AI が並行する前提のため必ず issue 番号付き作業ブランチ（例: `issue/21/...`）を `dev` から切る
- 並行作業時は git worktree (`.worktrees/<branch-name>/`) を活用
- issue close 前: 本文「完了条件」のチェックボックスを 1 件ずつ検証し `[x]` に更新してから close
- `.env.local` の取り扱い: 秘匿情報のため Read ツール直接使用禁止。Bash 経由で `source .env.local` または `sed` で必要な値のみ取得
- IAM は最小権限。リソース ARN を限定しワイルドカード禁止
- AWS アカウント ID / リージョン / URL はハードコードせず `.env.local` 経由

## 仕様駆動開発

実装の前後で次を必ず行う。

1. 着手前: 対象機能の `specs/requirements.md` 受入基準と `specs/tasks.md` を確認
2. 実装中: 関連 steering ファイルの規約に従う
3. 完了時: `tasks.md` の該当チェックボックスを `[x]` に更新し、関連ドキュメント（specs / steering / `.env.local.example` / `edge/README.md`）を同時更新

## 環境変数 `.env.local`

- AWS アカウント / リージョン / Cognito クライアント / テストユーザー資格情報 (`COGuser`, `COGpw`) などを格納
- テンプレ: `.env.local.example`（Edge は `edge/.env.example`）
- 利用手順: テンプレをコピー → 値を記入 → `source .env.local` で環境変数化してから開発・デプロイ
- フロントビルド時は `VITE_COGNITO_*` を `.env.local` に揃えてから `npm run deploy:all`
- エラー時はまず `.env.local` の値を確認

## 主要コマンド

```bash
source .env.local      # 環境変数を適用（作業前に必ず実行）
npm run build          # TypeScript ビルド
npm run test           # 全テスト
npm run test:unit      # ユニットテスト
npm run deploy         # CDK デプロイ
npm run deploy:all     # CDK + フロントエンド（VITE_COGNITO_* 設定後）
```

Edge 起動手順・E2E テスト (`./edge/e2e-test.sh`) は `edge/README.md` を参照。
