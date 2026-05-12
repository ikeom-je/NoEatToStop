# NoEatToStop System - 開発ガイド

子供の食事中の咀嚼動作を監視し、食事停止時にテレビ電源を自動制御するスマートシステム。

## 作業開始前のチェック（必読・全エージェント共通）

新しいタスク・Issue 対応・PR 作成に着手する前に、毎回必ず本セクションを再確認する。本プロジェクトは複数の AI エージェント・開発者が並行作業することを想定しており、各自が同じルールに従うことで仕様・規約・運用方針の一貫性を保つ。

1. **本ファイル（CLAUDE.md）を冒頭から再参照** — 仕様駆動開発ルール / 変更時の更新トリガー / 環境戦略 / 重要な設計原則
2. **対象機能の仕様書を確認** — `.kiro/specs/{requirements.md, design.md, tasks.md}`
3. **タスクに該当する steering ファイルを確認**:
   - 新機能・アーキ変更 → [architecture.md](.kiro/steering/architecture.md), [structure.md](.kiro/steering/structure.md)
   - 技術スタック・依存・環境変数 → [tech.md](.kiro/steering/tech.md), [development.md](.kiro/steering/development.md)
   - テスト追加・テスト変更 → [testing.md](.kiro/steering/testing.md)
   - PR 作成・コミット・ブランチ操作 → [git.md](.kiro/steering/git.md)
   - 開発環境（Colima / Greengrass）→ [environment.md](.kiro/steering/environment.md)
   - セキュリティ・認証 → [security.md](.kiro/steering/security.md)
4. **並行作業時は git worktree を使用** — `dev` から作業ブランチを切り、`.worktrees/<branch-name>/` を作成（[git.md](.kiro/steering/git.md) 参照）
5. **PR は `dev` をベースに作成** — レビュー後に `dev` へマージ、`main` への反映は `dev → main` の PR 経由のみ

> 仕様駆動開発の根幹: **仕様 → 設計 → 実装 → ドキュメント整合**。途中でルール確認を省略すると、複数エージェント間でドリフトが発生する。

## 仕様書

| ファイル | 内容 |
|---------|------|
| [.kiro/specs/requirements.md](.kiro/specs/requirements.md) | 要件定義（受入基準付き） |
| [.kiro/specs/design.md](.kiro/specs/design.md) | 設計書 |
| [.kiro/specs/tasks.md](.kiro/specs/tasks.md) | 実装タスク |

## 開発ルール（詳細は各ファイル参照）

| ファイル | 内容 |
|---------|------|
| [.kiro/steering/product.md](.kiro/steering/product.md) | プロダクト概要・対象ユーザー |
| [.kiro/steering/architecture.md](.kiro/steering/architecture.md) | アーキテクチャ原則・レイヤー・データモデル・API 設計 |
| [.kiro/steering/structure.md](.kiro/steering/structure.md) | ディレクトリ構成・命名規則・CDK スタック構成 |
| [.kiro/steering/tech.md](.kiro/steering/tech.md) | 技術スタック・バージョン・ビルドコマンド |
| [.kiro/steering/development.md](.kiro/steering/development.md) | 開発ガイド・Lambda パターン・`.env.local` 管理 |
| [.kiro/steering/testing.md](.kiro/steering/testing.md) | テスト戦略・E2E（Playwright）・カバレッジ目標 |
| [.kiro/steering/git.md](.kiro/steering/git.md) | Git ワークフロー・Conventional Commits・PR ガイドライン |
| [.kiro/steering/security.md](.kiro/steering/security.md) | セキュリティ標準・Cognito 認証・IAM 最小権限・PII 取扱い |
| [.kiro/steering/environment.md](.kiro/steering/environment.md) | 開発環境（Colima / Greengrass）・Mac vs RPi 差異 |

## 変更時のドキュメント更新トリガー

実装変更を加えたら、変更種別に応じて以下のドキュメントを必ず同時更新する。

| 変更したもの | 必ず更新するドキュメント |
|-----------|-------------------|
| 新 API パラメータ | `specs/requirements.md`（AC 追加）+ `specs/design.md`（パラメータ表）+ `steering/architecture.md` |
| 新 Lambda エンドポイント | `steering/architecture.md`（エンドポイント表）+ `specs/requirements.md`（Req）+ `specs/design.md`（API） |
| 新環境変数 | `steering/development.md`（変数一覧）+ `.env.local.example`（テンプレ）+ 必要に応じて `specs/design.md` |
| 新 Lambda 関数 | `steering/architecture.md` + `steering/structure.md`（依存）+ `specs/design.md` |
| デプロイ手順・Edge 構成 | `steering/environment.md` または `steering/development.md` + `edge/README.md` |
| 新テストコマンド | `steering/testing.md` + `package.json` |
| 依存パッケージ | `steering/tech.md`（バージョン制約も） |
| Git / PR ルール | `steering/git.md` |
| バージョン更新 | `package.json` + `steering/product.md` |

## 環境戦略

単一 AWS アカウント内で 3 環境（dev / staging / prod）をスタック名サフィックスで分離。
開発フロー: `feature/* → dev → main`（dev は統合・検証、main は安定版、すべて PR 経由）

- ローカル設定: `.env.local`（Git 管理外）。テンプレ `.env.local.example` をコピーして編集し、`source .env.local` で適用
- 詳細・全変数表: [steering/development.md](.kiro/steering/development.md) の「環境設定ファイル」セクション

## 重要な設計原則

1. **仕様駆動開発**: `tasks.md` の AC を満たすテスト・実装を行い、完了時にチェックボックスを `[x]` に更新
2. **IAM 最小権限**: Lambda は必要なリソース ARN だけに権限付与（ワイルドカード禁止）
3. **環境変数で参照**: AWS アカウント ID・リージョン・URL は `.env.local` 経由。ハードコード禁止
4. **PII 不在ログ**: 構造化ログには個人情報を含めない（詳細 [security.md](.kiro/steering/security.md)）
5. **Edge → Cloud 認証**: Greengrass は IoT Core 証明書、フロントは Cognito PKCE
6. **言語**: ドキュメント・コメント・チャット応答は日本語（コードの識別子は英語）
7. **パッケージマネージャー**: npm（pnpm は使わない）
8. **作業ディレクトリ**: 一時ファイルは `./working/`（Git 管理外）

## コミット

- 形式: `<type>(<scope>): <内容>`（例: `feat(api): エビデンス取得エンドポイント追加`）
- 本文は日本語で「なぜ」を記述
- 詳細: [steering/git.md](.kiro/steering/git.md)

## デプロイ

```bash
source .env.local         # 環境変数を適用
npm run deploy:all        # CDK インフラ + フロントエンド
```

段階デプロイ・Edge デプロイは [steering/development.md](.kiro/steering/development.md) および [steering/environment.md](.kiro/steering/environment.md) を参照。
