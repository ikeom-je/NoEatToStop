# Edge — ライブ映像キャプチャ

カメラ映像を Docker 経由でキャプチャし、S3 経由で管理画面に配信する。
リアルタイムストリーミングではなく、数秒間隔の静止画フレーム更新方式。

Mac 開発環境と Raspberry Pi 本番環境の両方に対応。

## RTSP 接続パターン

映像取得には 2 つの接続パターンがある。`edge/.env` の `RTSP_URL` 設定で切り替わる。

### パターン A: MediaMTX 経由（USB カメラ / Mac 内蔵カメラ）

`RTSP_URL` **未設定**時のデフォルト。ホスト側 ffmpeg でカメラ映像を MediaMTX に配信し、frame-capture が MediaMTX から取得する。

```
カメラ → ffmpeg (ホスト) → MediaMTX (Docker, :8554) → frame-capture (Docker) → S3
```

- Mac: `start-camera.sh` (avfoundation)
- RPi: `start-camera-rpi.sh` (v4l2 + mjpeg)

### パターン B: 外部 IP カメラ直接接続

`RTSP_URL` に外部カメラの RTSP アドレスを設定すると、frame-capture が直接 IP カメラに接続する。MediaMTX と start-camera スクリプトは不要。

```
IP カメラ (RTSP) → frame-capture (Docker) → S3
```

例: `RTSP_URL=rtsp://user:pass@192.168.0.213:554/stream2`

## アーキテクチャ

### Mac 開発環境（パターン A のみ）

Greengrass Core は Mac 上では使用しない（IPC の macOS 制限のため）。
映像パイプライン（frame-capture → S3 → 管理画面）の開発・動作確認が目的。

```
Mac Camera
  ↓ avfoundation (ホスト側 ffmpeg)
MediaMTX (Docker RTSP サーバー) ← rtsp://localhost:8554/camera
  ↓ RTSP
frame-capture (Docker)
  ↓ ffmpeg で1フレーム取得 → S3 PutObject
S3 (live-frames/latest.jpg)
  ↓ Lambda (presigned URL 生成)
管理画面 LiveVideo.vue (<img> タグで表示、定期リフレッシュ)
```

### Raspberry Pi 本番環境（パターン B: IP カメラ）

frame-capture が IP カメラに直接 RTSP 接続。MediaMTX 不要。
Greengrass Core は映像パイプラインとは独立して IoT Core (MQTT) 経由のクラウド連携を担う。

```
IP Camera (RTSP)
  ↓ RTSP 直接接続（RTSP_URL で指定）
frame-capture (Docker)
  ↓ ffmpeg で1フレーム取得 → S3 PutObject
S3 (live-frames/latest.jpg)
  ↓ Lambda (presigned URL 生成)
管理画面 LiveVideo.vue

Greengrass Core (Docker) ←── MQTT ──→ AWS IoT Core
  （Edge デバイス管理・状態監視。映像パイプラインとは独立）
```

### Raspberry Pi 本番環境（パターン A: USB カメラ）

```
USB Camera (/dev/video0)
  ↓ v4l2 + mjpeg (ホスト側 ffmpeg)
MediaMTX (Docker RTSP サーバー) ← rtsp://localhost:8554/camera
  ↓ RTSP
frame-capture (Docker)
  ↓ ffmpeg で1フレーム取得 → S3 PutObject
S3 (live-frames/latest.jpg)
  ↓ Lambda (presigned URL 生成)
管理画面 LiveVideo.vue

Greengrass Core (Docker) ←── MQTT ──→ AWS IoT Core
  （Edge デバイス管理・状態監視。映像パイプラインとは独立）
```

| コンポーネント | 実行場所 | Mac 開発 | RPi (USB カメラ) | RPi (IP カメラ) |
|---|---|---|---|---|
| `start-camera.sh` | ホスト (Mac) | Mac カメラ → RTSP | ― | ― |
| `start-camera-rpi.sh` | ホスト (RPi) | ― | USB カメラ → RTSP | ― |
| `mediamtx` | Docker | RTSP サーバー | RTSP サーバー | 不要 |
| `frame-capture` | Docker | RTSP → S3 | RTSP → S3 | RTSP → S3 |
| `greengrass-core` | Docker | **不使用** (※1) | IoT Greengrass V2 | IoT Greengrass V2 |

> ※1: Greengrass IPC は macOS / Colima 上では Unix ドメインソケットの制限により動作しない。Mac では映像パイプライン（frame-capture → S3）の開発・動作確認のみ行う。

---

## インストール

### 前提条件

#### Mac 開発環境

| ツール | インストール方法 |
|---|---|
| macOS | 必須（avfoundation カメラドライバ使用） |
| Docker Desktop または Colima | `brew install --cask docker` または `brew install colima && colima start` |
| ffmpeg | `brew install ffmpeg` |
| AWS CLI v2 | `brew install awscli` |
| Node.js 20+ | `brew install node@20` |

#### Raspberry Pi 本番環境

| ツール | インストール方法 |
|---|---|
| Raspberry Pi OS (64-bit) | aarch64 必須。Raspberry Pi Imager で書き込み |
| Docker Engine | 下記「RPi Docker インストール」参照 |
| Docker Compose V2 | Docker Engine に同梱 |
| ffmpeg | `sudo apt install -y ffmpeg`（USB カメラ使用時のみ必須） |
| AWS CLI v2 | `sudo apt install -y awscli` または pip 経由 |
| USB カメラ or IP カメラ | USB: `/dev/video0` として認識されること / IP: RTSP 対応であること |

**RPi Docker インストール:**

```bash
# Docker 公式インストールスクリプト
curl -fsSL https://get.docker.com | sh

# pi ユーザーを docker グループに追加（再ログイン必要）
sudo usermod -aG docker pi

# 動作確認
docker --version
docker compose version
```

### 1. AWS クラウドリソースのデプロイ

プロジェクトルートで実行:

```bash
# .env.local を作成（初回のみ）
cp .env.local.example .env.local
# AWS_PROFILE, AWS_DEFAULT_REGION, CDK_DEFAULT_REGION を編集

# CDK デプロイ
npm run deploy
```

デプロイ完了後、出力値を控える:

```
NoEatToStopStack-dev.VideoBucketName = noeatstop-videos-dev-XXXXXXXXXXXX
NoEatToStopStack-dev.ApiEndpoint = https://XXXXXXXX.execute-api.ap-northeast-1.amazonaws.com/prod/
NoEatToStopStack-dev.WebAppUrl = https://XXXXXXXX.cloudfront.net
```

### 2. Edge 環境変数の設定

```bash
cp edge/.env.example edge/.env
```

`edge/.env` を編集し、以下を追加:

```bash
# AWS リージョン
AWS_REGION=ap-northeast-1

# CDK デプロイ出力の VideoBucketName をそのまま設定（必須）
VIDEO_BUCKET=noeatstop-videos-dev-XXXXXXXXXXXX

# フレームキャプチャ間隔（秒）— 小さいほど更新が速いが S3 コスト増
CAPTURE_INTERVAL=3

# AWS 認証情報（IAM ユーザーまたは一時認証）
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_SESSION_TOKEN=...    # SSO/STS の場合のみ
```

`VIDEO_BUCKET` はコマンドでも取得可能:

```bash
aws cloudformation describe-stacks \
  --stack-name NoEatToStopStack-dev \
  --query "Stacks[0].Outputs[?OutputKey=='VideoBucketName'].OutputValue" \
  --output text
```

### 3. フロントエンドのデプロイ

```bash
npm run deploy:frontend
# または手動:
cd frontend
VITE_API_BASE_URL="https://XXXXXXXX.execute-api.ap-northeast-1.amazonaws.com/prod/" npm run build
aws s3 sync dist/ s3://noeatstop-webapp-dev-XXXXXXXXXXXX/ --delete
```

---

## 起動手順

**起動順序が重要（パターン A のみ）**: MediaMTX → カメラ配信 → frame-capture の順に接続される。
パターン B（IP カメラ直接）では frame-capture のみ起動すればよい。

### Mac 開発環境

#### Step 1: Docker サービスを起動

```bash
cd edge
docker compose up mediamtx frame-capture -d --build
```

#### Step 2: Mac カメラ配信を開始

別のターミナルで実行（フォアグラウンドで動作するため専用ターミナルが必要）:

```bash
./edge/start-camera.sh
```

初回実行時、macOS のカメラアクセス許可ダイアログが表示されたら許可する。

ffmpeg が以下のように出力されれば配信成功:

```
Stream #0:0: Video: h264, yuv422p, 640x480, 30 fps
frame=  125 fps= 25 q=15.0 ...
```

#### Step 3: frame-capture の接続確認

カメラ配信開始後、frame-capture コンテナが RTSP ストリームに接続するまで数秒かかる。
コンテナがカメラ起動前に起動していた場合は再起動する:

```bash
cd edge
docker compose restart frame-capture
```

### Raspberry Pi 本番環境

#### Step 1: AWS 認証情報の設定

Greengrass Core は `~/.aws/credentials` をコンテナにマウントして使用する。
AWS CLI の default プロファイルが設定済みであること:

```bash
aws sts get-caller-identity
# アカウント ID とユーザー情報が表示されれば OK
```

#### Step 2: edge/.env の設定

```bash
cd edge
cp .env.example .env
```

`edge/.env` を編集:

```bash
AWS_REGION=ap-northeast-1
THING_NAME=noeatstop-edge-device
THING_GROUP_NAME=noeatstop-devices-dev
THING_POLICY_NAME=noeatstop-device-policy-dev

# 初回プロビジョニング時は true（2回目以降は false に変更）
PROVISION=true

TES_ROLE_NAME=GreengrassV2TokenExchangeRole
TES_ROLE_ALIAS_NAME=GreengrassV2TokenExchangeRoleAlias

VIDEO_BUCKET=noeatstop-videos-dev-XXXXXXXXXXXX
CAPTURE_INTERVAL=3

# frame-capture 用 AWS 認証情報
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...

# 外部 IP カメラを使う場合（USB カメラの場合は未設定のまま）
# RTSP_URL=rtsp://user:pass@192.168.x.x:554/stream
```

#### Step 3: Greengrass Core の起動（初回プロビジョニング）

```bash
cd edge
docker compose up greengrass-core -d --build
```

初回起動時、Greengrass は以下を自動で行う:

- IoT Thing の証明書・秘密鍵の作成
- IoT Policy のアタッチ
- Token Exchange Role / Role Alias の作成
- AWS IoT Core への MQTT 接続

ログでプロビジョニング完了を確認:

```bash
docker logs noeatstop-gg-core --tail 20
# "Launched Nucleus successfully." が表示されれば成功
```

**初回プロビジョニング後**: `edge/.env` の `PROVISION=false` に変更する。
以降の再起動では既存の証明書・設定を再利用する。

#### Step 4: 映像キャプチャの起動

**パターン B（外部 IP カメラ）**: `RTSP_URL` を設定済みの場合

```bash
# frame-capture のみ起動（MediaMTX 不要）
docker compose up frame-capture -d --build
```

**パターン A（USB カメラ）**: `RTSP_URL` 未設定の場合

```bash
# MediaMTX + frame-capture を起動
docker compose up mediamtx frame-capture -d --build
```

USB カメラが接続されていることを確認:

```bash
ls /dev/video*
# /dev/video0 が存在すること

# カメラの対応フォーマット確認（任意）
v4l2-ctl --list-formats-ext -d /dev/video0
```

別のターミナルで配信を開始:

```bash
./edge/start-camera-rpi.sh
```

環境変数でカスタマイズ可能:

```bash
CAMERA_DEVICE=/dev/video0 VIDEO_SIZE=640x480 FRAMERATE=30 ./edge/start-camera-rpi.sh
```

#### Step 5: E2E テスト

すべてのサービスが起動した状態で実行:

```bash
./edge/e2e-test.sh
```

全 8 項目が PASS すれば正常（7 テストセクション、#4 に読み書き 2 サブ項目）:

```
=== テスト結果 ===
PASSED: 8 / FAILED: 0
すべてのテストに合格しました！
```

---

## 動作確認

### 1. frame-capture のログ

```bash
docker logs noeatstop-frame-capture --tail 5
```

正常時の出力例:

```
Frame capture started: interval=3s, bucket=noeatstop-videos-dev-XXXXXXXXXXXX
[2026-03-08T01:18:15.808Z] Frame uploaded to s3://noeatstop-videos-dev-XXXXXXXXXXXX/live-frames/latest.jpg
[2026-03-08T01:18:26.618Z] Frame uploaded to s3://noeatstop-videos-dev-XXXXXXXXXXXX/live-frames/latest.jpg
```

### 2. S3 のフレーム更新確認

```bash
aws s3 ls s3://${VIDEO_BUCKET}/live-frames/
# latest.jpg のタイムスタンプが CAPTURE_INTERVAL 秒ごとに更新されていること
```

### 3. API Gateway の presigned URL 取得

```bash
curl -s https://<API_GATEWAY_URL>/prod/video/latest-frame | python3 -m json.tool
```

正常時の出力例:

```json
{
  "url": "https://noeatstop-videos-dev-XXXXXXXXXXXX.s3.ap-northeast-1.amazonaws.com/live-frames/latest.jpg?X-Amz-Algorithm=..."
}
```

### 4. 管理画面での表示確認

1. ブラウザで CloudFront URL にアクセス
2. サイドメニューから「ライブ映像」を選択
3. 「映像開始」ボタンをクリック
4. カメラ映像のフレームが表示され、設定間隔で自動更新されることを確認

---

## 停止

### Mac

```bash
# 1. カメラ配信を停止（start-camera.sh のターミナルで Ctrl+C）

# 2. Docker サービスを停止
cd edge
docker compose down
```

### Raspberry Pi

```bash
# 1. カメラ配信を停止（start-camera-rpi.sh のターミナルで Ctrl+C）

# 2. Docker サービスを停止（Greengrass 含む全コンテナ）
cd edge
docker compose down
```

> **注意**: Greengrass の状態データは `/greengrass/v2` ボリュームに保存される。
> `docker compose down -v` でボリュームを削除すると証明書・設定が失われ、再プロビジョニングが必要になる。

---

## 設定

### Edge 環境変数 (`edge/.env`)

| 変数 | デフォルト | 説明 | Mac | RPi |
|---|---|---|---|---|
| `AWS_REGION` | `ap-northeast-1` | AWS リージョン | 必須 | 必須 |
| `VIDEO_BUCKET` | ― | S3 バケット名。CDK 出力の `VideoBucketName` | 必須 | 必須 |
| `CAPTURE_INTERVAL` | `3` | フレームキャプチャ間隔（秒） | 任意 | 任意 |
| `AWS_ACCESS_KEY_ID` | ― | frame-capture 用 AWS 認証情報 | 必須 | 必須 |
| `AWS_SECRET_ACCESS_KEY` | ― | frame-capture 用 AWS 認証情報 | 必須 | 必須 |
| `AWS_SESSION_TOKEN` | ― | SSO/STS 使用時のみ | 任意 | 任意 |
| `RTSP_URL` | `rtsp://mediamtx:8554/camera` | RTSP ソース URL。外部 IP カメラを直接指定する場合に設定。未設定時は MediaMTX 経由 | 任意 | 任意 |
| `THING_NAME` | `noeatstop-edge-device` | IoT Thing 名 | ― | 必須 |
| `THING_GROUP_NAME` | `noeatstop-devices-dev` | IoT Thing Group 名 | ― | 必須 |
| `PROVISION` | `true` | Greengrass 自動プロビジョニング | ― | 初回のみ true |
| `TES_ROLE_NAME` | `GreengrassV2TokenExchangeRole` | Token Exchange Role 名 | ― | 必須 |
| `TES_ROLE_ALIAS_NAME` | `GreengrassV2TokenExchangeRoleAlias` | Role Alias 名 | ― | 必須 |
| `THING_POLICY_NAME` | `noeatstop-device-policy-dev` | IoT Policy 名 | ― | 必須 |

### カメラ設定

#### Mac (`start-camera.sh`)

| 変数 | デフォルト | 説明 |
|---|---|---|
| `CAMERA_INDEX` | `0` | Mac カメラデバイスインデックス |

```bash
ffmpeg -f avfoundation -list_devices true -i "" 2>&1
```

#### Raspberry Pi (`start-camera-rpi.sh`)

| 変数 | デフォルト | 説明 |
|---|---|---|
| `CAMERA_DEVICE` | `/dev/video0` | カメラデバイスパス |
| `VIDEO_SIZE` | `640x480` | 解像度 |
| `FRAMERATE` | `30` | フレームレート (fps) |

```bash
# 接続されたカメラデバイスの確認
ls /dev/video*

# 対応フォーマット・解像度の確認
v4l2-ctl --list-formats-ext -d /dev/video0
```

### 管理画面の更新間隔

管理画面の「システム設定」ページで `liveVideoUpdateInterval`（秒）を変更可能。
この値は管理画面側のポーリング間隔であり、`CAPTURE_INTERVAL` とは独立。

**推奨**: `CAPTURE_INTERVAL` ≦ `liveVideoUpdateInterval` に設定する。
フレームが更新されるよりも速くポーリングしても同じ画像が返るだけになる。

---

## トラブルシューティング

### カメラが認識されない / 解像度エラー

```bash
# デバイス一覧と対応モードを確認
ffmpeg -f avfoundation -list_devices true -i "" 2>&1
```

出力例から対応する `video_size` と `framerate` を `start-camera.sh` に反映する。
macOS の「システム設定 → プライバシーとセキュリティ → カメラ」でターミナルアプリの許可も確認。

### frame-capture が 404 Not Found

```
[rtsp @ ...] method DESCRIBE failed: 404 Not Found
```

カメラ配信（`start-camera.sh`）が開始される前に frame-capture が起動した場合に発生。
カメラ配信開始後に再起動すれば解決:

```bash
cd edge
docker compose restart frame-capture
```

### frame-capture が S3 アップロードに失敗する

```bash
docker logs noeatstop-frame-capture --tail 20
```

よくある原因:
- `VIDEO_BUCKET` が未設定 → `edge/.env` を確認
- AWS 認証情報が無効（期限切れ等）→ `edge/.env` の認証情報を更新
- S3 への `PutObject` 権限がない → CDK でデプロイした `edgeDeviceRole` 以外の認証情報を使っている場合、対象バケットへの `s3:PutObject` 権限が必要

### MediaMTX に接続できない

```bash
docker logs noeatstop-mediamtx --tail 20
# ポート競合確認
lsof -i :8554
```

### 管理画面でフレームが表示されない

1. ブラウザの開発者ツール → Network タブで `/video/latest-frame` リクエストを確認
2. CORS エラーの場合は API Gateway の CORS 設定を確認
3. CloudFront のキャッシュが古い場合は `Ctrl+Shift+R` でハードリロード

---

## トラブルシューティング（Raspberry Pi 固有）

### Greengrass プロビジョニングが失敗する

```bash
docker logs noeatstop-gg-core 2>&1 | grep -i "error\|fail"
```

よくある原因:

- **AWS 認証情報が見つからない**: `~/.aws/credentials` に default プロファイルが設定されているか確認
- **IAM 権限不足**: Greengrass プロビジョニングには `iot:*`, `iam:*`, `greengrass:*`, `sts:*` 等の権限が必要。Admin 権限を推奨
- **既存の Thing と証明書の競合**: AWS IoT Core コンソールで既存の証明書を確認し、不要なものを削除

### Greengrass が UNHEALTHY になる

```bash
# AWS 側のステータス確認
aws greengrassv2 get-core-device \
  --core-device-thing-name noeatstop-edge-device \
  --region ap-northeast-1

# コンテナ内のログ確認
docker exec noeatstop-gg-core tail -50 /greengrass/v2/logs/greengrass.log
```

- コンテナが停止していないか `docker ps` で確認
- ネットワーク接続を確認（IoT Core への 8883 ポートのアウトバウンド通信が必要）

### USB カメラが認識されない

```bash
# デバイスの存在確認
ls -la /dev/video*

# v4l2 ユーティリティで詳細確認
sudo apt install -y v4l-utils
v4l2-ctl --list-devices

# カメラの対応フォーマット確認
v4l2-ctl --list-formats-ext -d /dev/video0
```

- USB カメラが挿さっているか物理的に確認
- `/dev/video0` がない場合は `dmesg | tail -20` でカーネルメッセージを確認
- MJPEG 非対応のカメラの場合、`start-camera-rpi.sh` の `-input_format` を `yuyv422` に変更

### Docker イメージのビルドが遅い / 失敗する

RPi 3B はメモリ 1GB のため、Docker ビルドにメモリが不足する場合がある:

```bash
# スワップの確認と拡大
free -h
sudo dphys-swapfile swapoff
sudo sed -i 's/CONF_SWAPSIZE=.*/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```

### 2回目以降の起動で PROVISION=true のまま起動してしまった

既にプロビジョニング済みの環境で `PROVISION=true` のまま起動すると、証明書が再作成される場合がある。
`edge/.env` の `PROVISION=false` に変更して再起動:

```bash
# .env を編集
sed -i 's/PROVISION=true/PROVISION=false/' edge/.env

# コンテナ再起動
docker compose restart greengrass-core
```
