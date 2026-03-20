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
- Docker Compose: `edge/docker-compose.yml`（greengrass-core / mediamtx / frame-capture-dev）

### Mac vs RPi の違い
- **Mac 開発環境**: frame-capture → S3 パイプラインのみ。Greengrass Core は macOS 上で動作しない（IPC 制限）
- **RPi 本番環境**: Greengrass Core 単一コンテナ内で FrameCapture + ChewingAnalyzer を統合実行 + IoT Core MQTT 連携

### RTSP 接続パターン
- **パターン A（MediaMTX 経由）**: `RTSP_URL` 未設定時。ホスト側 ffmpeg でカメラ映像を MediaMTX に配信
  - Mac: `edge/start-camera.sh`（avfoundation）
  - RPi: `edge/start-camera-rpi.sh`（v4l2 + mjpeg）
- **パターン B（IP カメラ直接）**: `RTSP_URL` 設定時。FrameCapture が直接接続。MediaMTX・start-camera スクリプト不要

### 起動手順
- **Mac 開発**: `docker compose up mediamtx --profile dev frame-capture-dev -d --build` → `./start-camera.sh`
- **RPi 本番（IP カメラ）**: `docker compose up greengrass-core -d --build`（コンテナ1つのみ）
- **RPi 本番（USB カメラ）**: `docker compose up greengrass-core mediamtx -d --build` → `./start-camera-rpi.sh`
- **E2E テスト** (RPi のみ): `./edge/e2e-test.sh`（10項目: GG稼働・HEALTHY・MQTT・S3読書・GGログ・FrameCaptureプロセス・S3フレーム・ChewingAnalyzerプロセス・初期化確認）

### Greengrass コンポーネント
- **FrameCapture** (Node.js): RTSP → ffmpeg → `/tmp/frame.jpg` → S3 `live-frames/latest.jpg`
- **ChewingAnalyzer** (Python + OpenCV): `/tmp/frame.jpg` 監視 → 顔検出(Haar Cascade) → 口領域差分 → 咀嚼判定 → BB付き画像を S3 `live-frames/latest-analyzed.jpg` にアップロード

### ChewingAnalyzer 咀嚼判定ロジック
1. **顔検出**: OpenCV Haar Cascade（正面顔、minSize=60x60）
2. **口領域**: 顔矩形の下部 30%（`MOUTH_ROI_RATIO`）を口領域と仮定
3. **差分計算**: 前フレームとの口領域ピクセル差分量（`cv2.absdiff` → `np.sum`）
4. **咀嚼判定**: 直近5フレーム（`ANALYSIS_FRAME_COUNT`）の平均差分量が閾値（`CHEWING_MOTION_THRESHOLD=500`）超 → chewing
5. **状態**: chewing / chewing_stopped / meal_ended / waiting
6. **エビデンス**: 状態変化時にBB付き画像を S3 `evidence/` にアップロード

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
