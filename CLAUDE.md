# NoEatToStop System

子供の食事中の咀嚼動作を監視し、食事が止まったときにテレビの電源を自動制御するスマートシステム。

## プロジェクト構成

### 仕様書
- `.kiro/specs/requirements.md` - 要件定義
- `.kiro/specs/design.md` - 設計書
- `.kiro/specs/tasks.md` - 実装タスク

### 開発方針（Steering）
- `.kiro/steering/product.md` - プロダクト概要
- `.kiro/steering/architecture.md` - アーキテクチャ原則
- `.kiro/steering/development.md` - 開発ガイド・コーディング指針
- `.kiro/steering/git.md` - Git ワークフロー・コミット規約
- `.kiro/steering/structure.md` - ディレクトリ構成・命名規則
- `.kiro/steering/tech.md` - 技術スタック
- `.kiro/steering/testing.md` - テスト戦略
- `.kiro/steering/security.md` - セキュリティ標準
- `.kiro/steering/environment.md` - 開発環境（Colima/Greengrass）

## 開発ルール

- **言語**: ドキュメント・コメント・チャット応答は日本語
- **パッケージマネージャー**: npm（pnpmではない）
- **作業ディレクトリ**: 一時ファイル・中間データは `./working/` に配置
- **Git ブランチ**: `dev` が開発マージ用。機能ブランチは `dev` から作成し、e2eテストPASS後に `dev` へマージ
- **Git 管理外**: `.claude/`, `.mcp.json`, `.env.local`, `working/`, credentials系ファイル

## コマンド

```bash
npm run build          # TypeScript ビルド
npm run test           # 全テスト実行
npm run test:unit      # ユニットテスト
npm run deploy         # CDK デプロイ
npm run deploy:all     # 全体デプロイ
```
