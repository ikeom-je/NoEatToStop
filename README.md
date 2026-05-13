# NoEatToStop System (食べてなかったら止まるシステム)

子供の食事中の咀嚼動作を監視し、食事が止まったときにテレビの電源を自動制御するスマートシステム。

## 概要

エッジデバイス（Raspberry Pi）に接続したカメラ映像から子供の咀嚼動作を検出し、一定時間食事が止まったらクラウドからテレビ電源を制御することで、保護者の食事中の声かけ負担を軽減する。

| 機能 | 概要 | 動作場所 |
|------|------|---------|
| 映像キャプチャ | RTSP / USB カメラから 1 fps でフレーム取得 | Edge（Greengrass） |
| 咀嚼検出 | OpenCV Haar Cascade で顔→口領域の動きを判定 | Edge（Greengrass） |
| 状態同期 | 検出結果を IoT Core MQTT 経由でクラウド DynamoDB に記録 | Cloud |
| 管理画面 | リアルタイム映像・履歴・エビデンス画像・設定変更 | Cloud（CloudFront） |
| TV 制御 | 食事停止時に Smart TV API / Alexa 経由で電源 OFF | Cloud → 自宅機器 |

## 主な特徴

- **エッジ完結型咀嚼検出**: 顔→口領域→ピクセル差分による軽量アルゴリズム。クラウド推論不要
- **MQTT パイプライン**: Edge → IoT Core Topic Rule → Lambda → DynamoDB（TTL 自動削除付き）
- **PKCE 認証**: 管理画面は Amazon Cognito Managed Login + PKCE Authorization Code Flow で保護
- **エビデンス記録**: 状態変化時にバウンディングボックス付き画像を S3 に保存。管理画面で振り返り可能
- **設定の動的反映**: 管理画面から閾値や検出パラメータを変更すると Edge 側へ MQTT 経由で反映
- **Mac / RPi 両対応**: Mac はパイプライン開発用（frame-capture のみ）、RPi は本番（Greengrass フル稼働）

## アーキテクチャ

### Mac 開発環境

映像キャプチャ（frame-capture → S3）のみ動作。Greengrass / IoT Core は使用しない。

```
Mac Camera (avfoundation)
  ↓ ffmpeg
MediaMTX (Docker, RTSP)
  ↓ RTSP
frame-capture (Docker) → S3 (live-frames/latest.jpg)
                            ↓
                    Lambda (presigned URL)
                            ↓
                  管理画面 (Vue.js / CloudFront)
```

### Raspberry Pi 本番環境

Greengrass Core 単一コンテナ内で FrameCapture + ChewingAnalyzer を統合実行、IoT Core (MQTT) でクラウドと双方向通信。

```
IP Camera (RTSP) or USB Camera
  ↓ RTSP（直接 or MediaMTX 経由）
Greengrass Core (Docker)
  ├── FrameCapture        → /tmp/frame.jpg → S3 (live-frames/latest.jpg)
  ├── ChewingAnalyzer     → 顔検出 + 咀嚼判定 → S3 (latest-analyzed) + MQTT
  └── IoT Core MQTT ←──→ AWS IoT Core → Lambda → DynamoDB
                                              ↓
                                    管理画面 (Vue.js / CloudFront)
```

### Mac と RPi の主な違い

| 項目 | Mac 開発 | RPi 本番 |
|------|----------|----------|
| 目的 | パイプライン開発・UI 動作確認 | 本番稼働 |
| Greengrass Core | 不使用（macOS IPC 制限） | 統合実行 |
| カメラドライバ | avfoundation | v4l2 (USB) / RTSP (IP) |
| Docker ランタイム | Colima 推奨 | Docker Engine |
| カメラ配信 | `edge/start-camera.sh` | `edge/start-camera-rpi.sh` または IP カメラ直接 |

詳細は [.kiro/steering/environment.md](.kiro/steering/environment.md) と [edge/README.md](edge/README.md) を参照。

## 技術スタック

- 言語: TypeScript（Cloud）、Node.js + Python 3.9（Edge）
- IaC: AWS CDK
- フロントエンド: Vue.js 3 + Tailwind CSS + Pinia
- データベース: Amazon DynamoDB
- 映像処理: OpenCV Haar Cascade（Edge）、Amazon Bedrock（将来）
- Edge: AWS IoT Greengrass V2 + ffmpeg + OpenCV（Docker）
- 認証: Amazon Cognito（User Pool + Managed Login + PKCE）
- CDN: Amazon CloudFront

バージョン・全依存リストは [.kiro/steering/tech.md](.kiro/steering/tech.md) を参照。

## 前提条件

### 共通
- Node.js v18 以上
- npm（pnpm は不可）
- AWS CLI v2 + AWS CDK
- Docker CLI + Docker Compose V2

### Mac 開発環境
- Colima 推奨（4 CPU / 8 GB 以上）: `brew install colima docker docker-compose`
- ffmpeg: `brew install ffmpeg`

### Raspberry Pi 本番環境
- Raspberry Pi OS 64-bit (aarch64)
- Docker Engine: `curl -fsSL https://get.docker.com | sh`
- USB カメラ または IP カメラ（RTSP 対応）

詳細は [.kiro/steering/environment.md](.kiro/steering/environment.md) を参照。

## クイックスタート

```bash
# 1. Clone & install
git clone <repository-url>
cd NoEatToStop
npm install

# 2. 環境変数を設定（テンプレからコピーして値を記入）
cp .env.local.example .env.local
cp edge/.env.example edge/.env
# エディタで値を編集してから:
source .env.local

# 3. インフラ + フロントエンドをデプロイ
npm run deploy:all

# 4-a. Mac 開発: frame-capture パイプラインを起動
colima start --cpu 4 --memory 8
cd edge
docker compose --profile dev up mediamtx frame-capture-dev -d --build
./start-camera.sh   # 別ターミナルで実行

# 4-b. RPi 本番（IP カメラ）
cd edge
# edge/.env に RTSP_URL=rtsp://user:pass@<IP>:<port>/stream を設定
docker compose up greengrass-core -d --build

# 4-c. RPi 本番（USB カメラ）
cd edge
docker compose up greengrass-core mediamtx -d --build
./start-camera-rpi.sh
```

開発コマンド一覧は [.kiro/steering/development.md](.kiro/steering/development.md) を参照。

## 認証（Cognito）

管理画面は Amazon Cognito User Pool で保護されている。セルフサインアップは無効で、管理者が AWS CLI でユーザーを招待する。

```bash
source .env.local
aws cognito-idp admin-create-user \
  --user-pool-id "$COGNITO_USER_POOL_ID" \
  --username user@example.com \
  --user-attributes Name=email,Value=user@example.com Name=email_verified,Value=true \
  --temporary-password 'TempPass123!' \
  --message-action SUPPRESS
aws cognito-idp admin-set-user-password \
  --user-pool-id "$COGNITO_USER_POOL_ID" \
  --username user@example.com \
  --password 'YourPassword123!' --permanent
```

ログインフロー（PKCE Authorization Code Flow）と必要な `VITE_COGNITO_*` 環境変数の詳細は [.kiro/steering/security.md](.kiro/steering/security.md) を参照。

## システム構成

### Infrastructure（AWS CDK）
- S3 / DynamoDB（MealSessions / EatingStates / SystemSettings / ChewingStates / TVControlEvents / FrameHistory / Labels）
- Lambda（API ハンドラ + IoT Topic Rule ハンドラ + S3 Event ハンドラ）
- API Gateway（全エンドポイント Cognito Authorizer 適用）
- CloudFront（SPA 配信、404 → index.html フォールバック）
- Cognito User Pool（PKCE）
- IoT Core（Things / Policies / Topic Rules / Certificates）

### Edge
- Greengrass Core: FrameCapture（Node.js + ffmpeg）+ ChewingAnalyzer（Python + OpenCV）
- MediaMTX: RTSP リレー（USB / Mac カメラ使用時のみ）

### Frontend（Vue.js + Tailwind）
- ダッシュボード / ライブ映像 / 食事履歴 / 咀嚼状態 / エビデンス / 設定 / 緊急制御 / TV 制御 / エラー分析

ディレクトリ構造・スタック構成の詳細は [.kiro/steering/structure.md](.kiro/steering/structure.md) を参照。

## 設定パラメータ

管理画面の SystemSettings から動的に変更できる主要パラメータ:

- 食事停止判定: `pauseThreshold`（既定 10s）、`chewingDetectionThreshold`
- 映像: `videoResolution`（既定 640x360）、`videoFrameRate`、`liveVideoUpdateInterval`
- AI: `confidenceThreshold`（既定 80%）
- 対象: `childCount`、`excludeAdults`
- 制御: `tvControlMethod`（`smart_tv_api` / `alexa_voice`）、`tvControlRetryCount`、`tvControlRetryInterval`
- データ保持: `videoRetentionDays`（既定 1 日）

全パラメータ・既定値・データモデルは [.kiro/specs/design.md](.kiro/specs/design.md) と [.kiro/steering/architecture.md](.kiro/steering/architecture.md) を参照。

## トラブルシューティング

- **Docker daemon に接続できない** → `docker context use colima` で Colima にスイッチ
- **Colima が起動しない** → `colima delete && colima start --cpu 4 --memory 8 --disk 50`
- **Architecture mismatch**（Apple Silicon）→ `colima delete && colima start --arch aarch64 --cpu 4 --memory 8`
- **AWS 認証エラー** → `.env.local` のリージョン / プロファイル設定を確認、`source .env.local` を再実行
- **Edge / Greengrass 関連** → [edge/README.md](edge/README.md) のトラブルシューティング、または [.kiro/steering/environment.md](.kiro/steering/environment.md) を参照

## 貢献

1. 関連 issue を確認、または新規 issue を起票
2. `dev` から `issue/<番号>/<topic>` ブランチを作成
3. 変更を実装、テストを追加・更新
4. PR を作成（base: `dev`）
5. レビュー後にマージ。`main` への反映は `dev → main` の PR 経由のみ

ブランチ命名・コミット規約は [.kiro/steering/git.md](.kiro/steering/git.md)、テスト戦略・実行方法は [.kiro/steering/testing.md](.kiro/steering/testing.md) を参照。

## ドキュメント

- [Installation Guide](docs/INSTALLATION.md)
- [User Manual](docs/USER_MANUAL.md)
- [Docker Development Guide](docs/guides/DOCKER_DEVELOPMENT_GUIDE.md)
- [Edge README](edge/README.md)

仕様書: [requirements](.kiro/specs/requirements.md) / [design](.kiro/specs/design.md) / [tasks](.kiro/specs/tasks.md)

開発ガイドライン: [.kiro/steering/](.kiro/steering/) 配下
