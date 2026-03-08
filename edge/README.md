# Edge — ライブ映像キャプチャ

Mac のカメラ映像を Docker 経由でキャプチャし、S3 経由で管理画面に配信する。
リアルタイムストリーミングではなく、数秒間隔の静止画フレーム更新方式。

## アーキテクチャ

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

| コンポーネント | 実行場所 | 役割 |
|---|---|---|
| `start-camera.sh` | ホスト (Mac) | Mac カメラ → RTSP 配信 |
| `mediamtx` | Docker | RTSP サーバー (TCP) |
| `frame-capture` | Docker | RTSP → JPEG → S3 アップロード |

---

## インストール

### 前提条件

| ツール | インストール方法 |
|---|---|
| macOS | 必須（avfoundation カメラドライバ使用） |
| Docker Desktop または Colima | `brew install --cask docker` または `brew install colima && colima start` |
| ffmpeg | `brew install ffmpeg` |
| AWS CLI v2 | `brew install awscli` |
| Node.js 20+ | `brew install node@20` |

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

**起動順序が重要**: MediaMTX → カメラ配信 → frame-capture の順に接続される。

### Step 1: Docker サービスを起動

```bash
cd edge
docker compose up mediamtx frame-capture -d --build
```

### Step 2: Mac カメラ配信を開始

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

### Step 3: frame-capture の接続確認

カメラ配信開始後、frame-capture コンテナが RTSP ストリームに接続するまで数秒かかる。
コンテナがカメラ起動前に起動していた場合は再起動する:

```bash
cd edge
docker compose restart frame-capture
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

```bash
# 1. カメラ配信を停止（start-camera.sh のターミナルで Ctrl+C）

# 2. Docker サービスを停止
cd edge
docker compose down
```

---

## 設定

### Edge 環境変数 (`edge/.env`)

| 変数 | デフォルト | 説明 |
|---|---|---|
| `VIDEO_BUCKET` | ― (必須) | S3 バケット名。CDK 出力の `VideoBucketName` |
| `AWS_REGION` | `ap-northeast-1` | AWS リージョン |
| `CAPTURE_INTERVAL` | `3` | フレームキャプチャ間隔（秒）。実際の更新間隔はキャプチャ処理時間を含むため、設定値より数秒長くなる |
| `AWS_ACCESS_KEY_ID` | ― (必須) | AWS 認証情報 |
| `AWS_SECRET_ACCESS_KEY` | ― (必須) | AWS 認証情報 |
| `AWS_SESSION_TOKEN` | ― | SSO/STS 使用時のみ |

### カメラ設定 (`start-camera.sh` 実行時の環境変数)

| 変数 | デフォルト | 説明 |
|---|---|---|
| `CAMERA_INDEX` | `0` | Mac カメラデバイスインデックス |

カメラの対応解像度・フレームレートは以下で確認:

```bash
ffmpeg -f avfoundation -list_devices true -i "" 2>&1
```

`start-camera.sh` 内の `-video_size` と `-framerate` をカメラがサポートする値に変更可能。

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
