# NoEatToStop System (食べてなかったら止まるシステム)

子供の食事中の咀嚼動作を監視し、食事が止まったときにテレビの電源を自動制御するスマートシステム。

## アーキテクチャ概要

### Mac 開発環境

映像キャプチャ（frame-capture → S3）のみ動作。Greengrass / IoT Core は使用しない。

```
Mac Camera (avfoundation)
  ↓ ffmpeg (ホスト側)
MediaMTX (Docker, RTSP サーバー)
  ↓ RTSP
frame-capture (Docker) ── ffmpeg で 1 フレーム取得 ──→ S3 (live-frames/latest.jpg)
                                                          ↓
                                              Lambda (presigned URL)
                                                          ↓
                                              管理画面 (Vue.js / CloudFront)
```

**用途**: フレームキャプチャ → S3 → 管理画面表示のパイプライン開発・動作確認

### Raspberry Pi 本番環境

Greengrass Core 単一コンテナ内で FrameCapture + ChewingAnalyzer を統合実行し、IoT Core (MQTT) でクラウドと双方向通信する。

```
IP Camera (RTSP) または USB Camera
  ↓ RTSP（直接 or MediaMTX 経由）
Greengrass Core (Docker)
  ├── FrameCapture ── ffmpeg で 1 フレーム取得 ──→ S3 (live-frames/latest.jpg)
  │        └── /tmp/frame.jpg
  ├── ChewingAnalyzer ── 顔検出 + 咀嚼判定 ──→ S3 (live-frames/latest-analyzed.jpg)
  │        └── OpenCV Haar Cascade → 口領域差分 → 状態判定
  │                                                     ↓
  └── IoT Core MQTT ←──→ AWS IoT Core           Lambda (presigned URL)
                                                        ↓
                                              管理画面 (Vue.js / CloudFront)
                                              ├── 生フレーム表示
                                              └── 検出BB付きフレーム表示（切替可）
```

**用途**: 本番稼働。映像キャプチャ + 咀嚼検出 + IoT Greengrass による Edge-Cloud 連携（単一コンテナ）

### Mac と RPi の主な違い

| 項目 | Mac 開発環境 | Raspberry Pi 本番環境 |
|------|-------------|---------------------|
| **目的** | パイプライン開発・UI 動作確認 | 本番稼働 |
| **Docker コンテナ** | mediamtx + frame-capture-dev | greengrass-core（FrameCapture 統合） |
| **Greengrass Core** | 不使用 | FrameCapture + ChewingAnalyzer 統合 + IoT Core MQTT |
| **カメラドライバ** | avfoundation (Mac 内蔵カメラ) | v4l2 (USB) または RTSP (IP カメラ) |
| **RTSP 取得** | 常に MediaMTX 経由 | MediaMTX 経由 or IP カメラ直接接続 |
| **Docker ランタイム** | Colima (または Docker Desktop) | Docker Engine |
| **カメラ配信スクリプト** | `start-camera.sh` | `start-camera-rpi.sh` (USB) / 不要 (IP カメラ) |
| **E2E テスト** | ― | `e2e-test.sh`（10項目: GG + IoT Core + S3 + ChewingAnalyzer 検証） |
| **OS / Arch** | macOS (x86_64 / arm64) | Raspberry Pi OS 64-bit (aarch64) |

## 技術スタック

- **言語**: TypeScript
- **IaC**: AWS CDK (Cloud Development Kit)
- **ランタイム**: Node.js (ES2020 target)
- **フロントエンド**: Vue.js v3 + Tailwind CSS
- **データベース**: Amazon DynamoDB
- **映像処理**: Edge OpenCV (Haar Cascade 顔検出 + 咀嚼判定) + Amazon Bedrock (将来)
- **Edge**: AWS IoT Greengrass V2 (Docker、Node.js 22 + Python 3.9 + OpenCV + ffmpeg 統合)
- **認証**: Amazon Cognito (User Pool + Managed Login + PKCE Authorization Code Flow)
- **CDN**: Amazon CloudFront（SPA 配信 + HTTPS）
- **Docker ランタイム**: Colima (Mac) / Docker Engine (RPi)

## 前提条件

### 共通

- **Node.js**: v18 以上
- **npm**: パッケージマネージャー
- **AWS CLI v2**: AWS サービス連携
- **AWS CDK**: インフラデプロイ
- **Docker CLI + Docker Compose V2**: コンテナ操作

### Mac 開発環境のみ

- **Colima** (推奨) または Docker Desktop: `brew install colima docker docker-compose`
- **ffmpeg**: `brew install ffmpeg`（カメラ → MediaMTX 配信用）

### Raspberry Pi 本番環境のみ

- **Raspberry Pi OS (64-bit)**: aarch64 必須
- **Docker Engine**: `curl -fsSL https://get.docker.com | sh`
- **ffmpeg**: `sudo apt install -y ffmpeg`（USB カメラ使用時のみ）
- **USB カメラ** または **IP カメラ (RTSP 対応)**

## クイックスタート

Edge 環境の詳細は [Edge README](edge/README.md) を参照。

```bash
# 1. Clone & install
git clone <repository-url>
cd NoEatToStop
npm install

# 2. 環境変数を設定
cp .env.local.example .env.local   # AWS 認証情報
cp edge/.env.example edge/.env     # Edge 環境変数（VIDEO_BUCKET, AWS 認証 等）

# 3-a. Mac 開発環境
colima start --cpu 4 --memory 8
cd edge
docker compose --profile dev up mediamtx frame-capture-dev -d --build
./start-camera.sh   # 別ターミナルで実行（Ctrl+C で停止）

# 3-b. RPi 本番環境（IP カメラ）— コンテナ1つのみ
cd edge
# edge/.env に RTSP_URL=rtsp://user:pass@<IP>:<port>/stream を設定
docker compose up greengrass-core -d --build

# 3-c. RPi 本番環境（USB カメラ）
cd edge
docker compose up greengrass-core mediamtx -d --build
./start-camera-rpi.sh   # 別ターミナルで実行（Ctrl+C で停止）
```

## 認証（Cognito）

管理画面は Amazon Cognito User Pool で保護されている。セルフサインアップは無効で、管理者が AWS CLI でユーザーを招待する。

### ログインフロー

1. CloudFront URL にアクセス → 未認証の場合 Cognito Managed Login にリダイレクト
2. メール / パスワードでログイン
3. `/callback` に認可コード付きでリダイレクト → PKCE でトークン交換
4. ID Token を `localStorage` に保存、API リクエスト時に Bearer ヘッダーとして自動付与
5. API Gateway の CognitoUserPoolsAuthorizer がトークンを検証
6. トークン期限切れ時は refresh_token で自動更新、失敗時はログアウト

### 初回ユーザー作成

CDK デプロイ後、`.env.local` の設定値を使ってユーザーを作成する:

```bash
source .env.local

# ユーザー作成（セルフサインアップは無効）
aws cognito-idp admin-create-user \
  --user-pool-id "$COGNITO_USER_POOL_ID" \
  --username user@example.com \
  --user-attributes Name=email,Value=user@example.com Name=email_verified,Value=true \
  --temporary-password 'TempPass123!' \
  --message-action SUPPRESS

# パスワードを永続化（初回ログイン時の強制変更をスキップ）
aws cognito-idp admin-set-user-password \
  --user-pool-id "$COGNITO_USER_POOL_ID" \
  --username user@example.com \
  --password 'YourPassword123!' \
  --permanent
```

### 認証関連の環境変数

フロントエンドビルド時に以下の `VITE_COGNITO_*` 変数が必要。`.env.local` に設定すること:

```bash
# Cognito 設定（CDK デプロイ後に出力される値を設定）
COGNITO_USER_POOL_ID=ap-northeast-1_xxxxxxxxx
VITE_COGNITO_DOMAIN=noeatstop-{stage}.auth.{region}.amazoncognito.com
VITE_COGNITO_CLIENT_ID=<UserPoolClientId>
VITE_COGNITO_REDIRECT_URI=https://<cloudfront-domain>/callback
VITE_COGNITO_LOGOUT_URI=https://<cloudfront-domain>/
```

CDK デプロイ後の Output（`UserPoolId`, `UserPoolClientId`, `CognitoDomainName`）から値を取得できる。

詳細は [設計書](.kiro/specs/design.md) の「認証アーキテクチャ」および [セキュリティ標準](.kiro/steering/security.md) を参照。

## Project Structure

```
no-eat-to-stop-system/
├── .env.local              # Environment variables (git excluded)
├── .kiro/                  # Kiro IDE configuration and steering rules
│   ├── specs/              # Specifications (requirements.md, design.md, tasks.md)
│   └── steering/           # Development guidelines and policies
├── PRFAQ.md               # Product requirements and FAQ (Japanese)
├── bin/                   # CDK application entry points
├── lib/                   # CDK stack definitions and constructs
│   ├── models/            # TypeScript interfaces and data models
│   ├── repositories/      # DynamoDB data access layer
│   ├── services/          # Business logic services
│   └── lambda/            # Lambda function implementations
├── edge/                  # Edge デバイス（RTSP + IoT Greengrass）
│   ├── docker-compose.yml # greengrass-core / mediamtx
│   ├── greengrass/        # Greengrass Core Docker ビルド（FrameCapture 統合）
│   ├── frame-capture/     # Mac 開発用 frame-capture（profiles: dev）
│   ├── start-camera.sh    # Mac カメラ → MediaMTX 配信
│   ├── start-camera-rpi.sh# RPi USB カメラ → MediaMTX 配信
│   ├── e2e-test.sh        # Edge E2E テスト
│   ├── .env               # Edge 環境変数 (git excluded)
│   └── .env.example       # Edge 環境変数テンプレート
├── docs/                  # User guides and documentation
├── scripts/               # Deployment and setup scripts
├── working/               # Temporary files (git excluded)
├── package.json           # Node.js dependencies and scripts
└── tsconfig.json          # TypeScript compiler configuration
```

## System Components

### Infrastructure Layer (AWS CDK)
- **S3 Buckets**: Video storage with 1-day lifecycle, judgment data storage, web app hosting
- **DynamoDB Tables**: MealSessions, EatingStates, SystemSettings, ChewingStates, TVControlEvents, FrameHistory, Labels
- **Lambda Functions**: API handlers (14個), IoT Topic Rule handlers, S3 Event handler
- **API Gateway**: RESTful API for frontend integration（全エンドポイント Cognito Authorizer で保護）
- **CloudFront**: CDN for web application delivery（SPA フォールバック対応）
- **Cognito User Pool**: 管理画面認証（PKCE Authorization Code Flow、Managed Login）
- **IoT Core**: MQTT トピックルール → Lambda → DynamoDB パイプライン
- **IAM Roles**: Least-privilege access for edge devices and Lambda functions

### Edge Layer (`edge/`)
- **Greengrass Core** (RPi): FrameCapture + ChewingAnalyzer を統合した単一コンテナ。Node.js 22 + ffmpeg でフレームキャプチャ、Python 3.9 + OpenCV で顔検出・咀嚼判定 + IoT Core MQTT 通信
- **MediaMTX**: RTSP リレーサーバー。USB カメラ / Mac カメラ使用時のみ必要
- **frame-capture-dev** (Mac 開発のみ): Greengrass が動作しない Mac 用の独立コンテナ（`--profile dev`）
- **AI Integration**: Amazon Bedrock (Claude) による咀嚼行動分析（クラウド側 Lambda で実行）

### Frontend Layer (Vue.js)
- **Dashboard**: Real-time meal session monitoring
- **LiveVideo**: Video feed display with configurable update intervals
- **SystemSettings**: Comprehensive configuration interface
- **EmergencyControl**: Manual TV control override
- **TVControlStatus**: TV control request monitoring and status display

## Configuration Parameters

The system supports comprehensive runtime configuration through the SystemSettings DynamoDB table and management interface:

### Basic Settings
- **pauseThreshold**: Motion stop threshold (default: 10 seconds)
- **confidenceThreshold**: AI confidence threshold (default: 80%)
- **videoBufferDuration**: Video buffer time (default: 10 seconds)
- **analysisVideoDuration**: Analysis video duration (default: 20 seconds)
- **videoRetentionDays**: Video retention period (default: 1 day)

### Video Settings
- **videoResolution**: Camera resolution (default: 640x360)
- **videoFrameRate**: Frame rate (default: 30fps)
- **liveVideoUpdateInterval**: Real-time video update interval (default: 3 seconds)

### Recognition Settings
- **faceDetectionThreshold**: Face recognition threshold
- **mouthDetectionThreshold**: Mouth position recognition threshold
- **chewingDetectionThreshold**: Chewing detection threshold

### Target Settings
- **childCount**: Number of children to monitor
- **excludeAdults**: Adult detection exclusion flag

### Control Settings
- **tvControlMethod**: 'smart_tv_api' or 'alexa_voice'
- **tvControlRetryCount**: Retry count (default: 1)
- **tvControlRetryInterval**: Retry interval (default: 3 seconds)

## AWS Resources

The CDK stack creates the following AWS resources:

- **S3 Buckets**:
  - Video storage with 1-day lifecycle policy（live-frames, evidence, frames, daily）
  - Web app hosting with CloudFront distribution
- **DynamoDB Tables**:
  - MealSessions, EatingStates, SystemSettings
  - ChewingStates, TVControlEvents, FrameHistory, Labels（TTL 自動削除）
- **Cognito**: User Pool, App Client (PKCE), Managed Login Domain, CognitoUserPoolsAuthorizer
- **Lambda Functions**: API handlers (14個), IoT Topic Rule handlers, S3 Event handler
- **API Gateway**: RESTful API endpoints（全メソッド Cognito Authorizer 適用）
- **CloudFront Distribution**: Web application CDN（SPA 404→index.html フォールバック）
- **IAM Roles**: Edge device role, Lambda execution roles
- **IoT Core Resources**: Things, Thing Groups, Certificates, Policies, Topic Rules

## Development Commands

### Colima 管理 (Mac のみ)

```bash
colima start --cpu 4 --memory 8   # 起動
colima stop                        # 停止
colima status                      # 状態確認
colima delete                      # 完全リセット
```

### Edge コンテナ管理

```bash
cd edge

# RPi: Greengrass Core 起動（FrameCapture 統合）
docker compose up greengrass-core -d --build

# RPi: 全サービス停止
docker compose down

# Greengrass Core のログ確認（FrameCapture ログも含む）
docker logs -f noeatstop-gg-core

# コンテナ内でコマンド実行
docker exec -it noeatstop-gg-core sh

# コンテナ再起動
docker compose restart greengrass-core
```

### TypeScript Build

```bash
# Build TypeScript
npm run build

# Watch mode for development
npm run watch

# Run tests
npm run test
```

### CDK Deployment

```bash
# Deploy infrastructure only
npm run deploy

# Deploy frontend only
npm run deploy:frontend

# Deploy both infrastructure and frontend
npm run deploy:all

# Destroy infrastructure
npm run destroy

# Synthesize CDK template
npm run synth
```

## Deployment

### Infrastructure Deployment

```bash
# Deploy AWS infrastructure (S3, CloudFront, DynamoDB, Lambda, API Gateway, etc.)
npm run deploy
```

The CDK deployment will:
- Create all AWS resources defined in the stack
- Set up IAM roles and permissions
- Configure DynamoDB tables with GSI
- Deploy Lambda functions
- Create API Gateway endpoints
- Set up CloudFront distribution

### Frontend Deployment

```bash
# Build and deploy Vue.js app to S3/CloudFront
npm run deploy:frontend
```

The frontend deployment script will:
- Automatically retrieve the S3 bucket name and API Gateway URL from CloudFormation
- Update the frontend environment variables with the correct API URL
- Build the Vue.js application
- Upload all files to S3
- Invalidate CloudFront cache

### Complete Deployment

```bash
# Deploy both infrastructure and frontend in one command
npm run deploy:all
```

After deployment, the web application will be accessible via the CloudFront URL shown in the output.

## 開発環境の注意事項

### Mac と RPi の開発スコープ

- **Mac 開発環境**: frame-capture-dev コンテナで S3 パイプラインの開発・UI 動作確認。Greengrass Core は Mac 上では動作しない（IPC の macOS 制限のため）
- **Raspberry Pi**: 本番環境。Greengrass Core 単一コンテナ内で FrameCapture + IoT Core MQTT のフルスタックが稼働
- **Greengrass コンポーネントのテスト**: RPi 実機 または EC2 (Linux) で実施すること

## Error Handling

The system implements comprehensive error handling across all layers:

- **Camera failure**: System enters safe state, no TV control actions
- **Network disconnection**: Edge processing continues locally, syncs when reconnected
- **AI/Recognition errors**: Falls back to safe state (no control), logs for analysis
- **TV control failure**: Retry mechanism with configurable attempts and intervals
- **DynamoDB errors**: Exponential backoff retry with error logging
- **S3 upload failures**: Local buffering with retry queue

## Troubleshooting

### Colima (Mac のみ)

**Docker command fails with "Cannot connect to the Docker daemon"**:
```bash
# Check Docker context
docker context ls

# Switch to Colima context
docker context use colima

# Verify Colima is running
colima status

# Start Colima if not running
colima start
```

**Colima won't start**:
```bash
# Check logs
colima logs

# Complete reset
colima delete
colima start --cpu 4 --memory 8 --disk 50
```

**Volume mount not working**:
```bash
# SSH into Colima VM to check mounts
colima ssh
ls -la /Users/$(whoami)/

# If home directory is not visible, restart Colima
exit
colima restart
```

**Architecture mismatch errors**:
```bash
# Check current architecture
colima status | grep Arch

# For x86_64 devices (Intel)
colima delete
colima start --arch x86_64 --cpu 4 --memory 8

# For arm64 devices (Apple Silicon)
colima delete
colima start --arch aarch64 --cpu 4 --memory 8
```

### Edge / Greengrass トラブルシューティング

Edge 固有の問題（Greengrass、frame-capture、カメラ）については [Edge README](edge/README.md) のトラブルシューティングセクションを参照。

## Security Features

- **IAM Least-Privilege Access**: Minimal required permissions for each component
- **Data Encryption**: 
  - S3 server-side encryption (SSE-S3)
  - DynamoDB encryption at rest (AWS managed keys)
- **Video Retention**: Automatic deletion after 1 day via S3 lifecycle policies
- **Access Control**: Amazon Cognito User Pool 認証（PKCE Authorization Code Flow + CognitoUserPoolsAuthorizer で全 API 保護）
- **Network Security**:
  - HTTPS enforcement via CloudFront
  - API Gateway with Cognito Authorizer（4XX レスポンスにも CORS ヘッダー付与）
  - IoT Core certificate-based authentication

## Project Status

For current implementation status and next steps, see:
- [Implementation Tasks](.kiro/specs/tasks.md) - Detailed task list with progress tracking

## Documentation

### Quick Links
- **[Installation Guide](docs/INSTALLATION.md)** - システムのインストール手順
- **[User Manual](docs/USER_MANUAL.md)** - ユーザーマニュアル
- **[Docker Development Guide](docs/guides/DOCKER_DEVELOPMENT_GUIDE.md)** - Docker開発環境のセットアップ

### Specifications
- [Requirements Document](.kiro/specs/requirements.md)
- [Design Document](.kiro/specs/design.md)
- [Implementation Tasks](.kiro/specs/tasks.md)
