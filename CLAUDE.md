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

## 環境設定

- **`.env.local`** にAWSアカウント情報・リージョン・環境名などの個人設定を記載
- 開発・デプロイ時は必ず `.env.local` を読み込んで環境変数を使用すること
- `.env.local` はGit管理外（コミット禁止）

## Edge 環境（RTSP + IoT Greengrass）

- 詳細: `edge/README.md`
- Edge 環境変数: `edge/.env`（Git管理外）、テンプレート: `edge/.env.example`
- Docker Compose: `edge/docker-compose.yml`（greengrass-core / mediamtx / frame-capture）

### Mac vs RPi の違い
- **Mac 開発環境**: frame-capture → S3 パイプラインのみ。Greengrass Core は macOS 上で動作しない（IPC 制限）
- **RPi 本番環境**: frame-capture + Greengrass Core（IoT Core MQTT 連携）のフルスタック

### RTSP 接続パターン
- **パターン A（MediaMTX 経由）**: `RTSP_URL` 未設定時。ホスト側 ffmpeg でカメラ映像を MediaMTX に配信
  - Mac: `edge/start-camera.sh`（avfoundation）
  - RPi: `edge/start-camera-rpi.sh`（v4l2 + mjpeg）
- **パターン B（IP カメラ直接）**: `RTSP_URL` 設定時。frame-capture が直接接続。MediaMTX・start-camera スクリプト不要

### 起動手順
- **Mac 開発**: `docker compose up mediamtx frame-capture -d --build` → `./start-camera.sh`
- **RPi 本番（IP カメラ）**: `docker compose up greengrass-core frame-capture -d --build`
- **RPi 本番（USB カメラ）**: `docker compose up greengrass-core mediamtx frame-capture -d --build` → `./start-camera-rpi.sh`
- **E2E テスト** (RPi のみ): `./edge/e2e-test.sh`（8項目: GG稼働・HEALTHY・MQTT・S3読書・GGログ・frame-capture稼働・S3フレーム）

## 開発ルール

- **言語**: ドキュメント・コメント・チャット応答は日本語
- **パッケージマネージャー**: npm（pnpmではない）
- **作業ディレクトリ**: 一時ファイル・中間データは `./working/` に配置
- **Git ブランチ**: `dev` が開発マージ用。機能ブランチは `dev` から作成し、e2eテストPASS後に `dev` へマージ
- **Git 管理外**: `.claude/`, `.mcp.json`, `.env.local`, `working/`, credentials系ファイル
- **環境設定**: AWS認証・リージョン等は `.env.local` から読み込む。エラー時はまず `.env.local` の値を確認すること

## コマンド

```bash
npm run build          # TypeScript ビルド
npm run test           # 全テスト実行
npm run test:unit      # ユニットテスト
npm run deploy         # CDK デプロイ
npm run deploy:all     # 全体デプロイ
```
