# Greengrass Docker 開発環境ガイド

## 概要

このガイドでは、GitHub の `aws-greengrass-docker` リポジトリを使用して、Mac（Colima）上でGreengrass開発環境をセットアップする方法を説明します。

この方法では、Dockerfileからイメージをビルドし、コンテナ起動時に自動的にGreengrassがインストール・設定され、AWS IoT Coreに接続されます。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│                    macOS (Colima)                        │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Docker Container (aws-iot-greengrass)             │ │
│  │                                                     │ │
│  │  ┌──────────────────────────────────────────────┐  │ │
│  │  │  Greengrass Nucleus                          │  │ │
│  │  │  - Auto-provisioning                         │  │ │
│  │  │  - IoT Thing creation                        │  │ │
│  │  │  - Certificate generation                    │  │ │
│  │  │  - AWS IoT Core connection                   │  │ │
│  │  └──────────────────────────────────────────────┘  │ │
│  │                                                     │ │
│  │  ┌──────────────────────────────────────────────┐  │ │
│  │  │  VideoProcessor Component                    │  │ │
│  │  │  - Camera capture                            │  │ │
│  │  │  - Bedrock analysis                          │  │ │
│  │  │  - DynamoDB integration                      │  │ │
│  │  └──────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          │
                          │ MQTT over TLS (8883)
                          ↓
┌─────────────────────────────────────────────────────────┐
│                    AWS IoT Core                          │
│  - Thing: gg-dev-core-docker                            │
│  - Certificate-based authentication                      │
│  - Token Exchange Service                                │
└─────────────────────────────────────────────────────────┘
```

## 前提条件

- macOS（Apple Silicon または Intel）
- Colima がインストール済み
- Git がインストール済み
- AWS認証情報が設定済み（`~/.aws/credentials`）
- `.env.local` ファイルが設定済み

## セットアップ手順

### ステップ1: Colimaの起動

```bash
# Colimaが起動していない場合
colima start --cpu 4 --memory 8 --disk 50

# 起動確認
colima status
```

### ステップ2: Greengrass Dockerイメージのビルド

```bash
./lib/greengrass/setup-greengrass-docker.sh
```

このスクリプトは以下を実行します：

1. `aws-greengrass-docker` リポジトリをクローン
2. アーキテクチャを自動検出（x86_64 または aarch64）
3. Dockerfileからイメージをビルド

**出力例**:

```
=== Setting up Greengrass Docker Development Environment ===
✅ Loaded .env.local
✅ Colima is running
📥 Cloning aws-greengrass-docker repository...
✅ Repository cloned
🔍 Detected architecture: ARM64 (aarch64)
🔨 Building Greengrass Docker image for aarch64...
   This may take several minutes...
✅ Docker image built successfully
```

**所要時間**: 初回は5-10分程度

### ステップ3: Greengrassコンテナの起動

```bash
./lib/greengrass/run-greengrass-docker.sh
```

このスクリプトは以下を実行します：

1. Dockerコンテナを起動
2. コンテナ内でGreengrassインストーラが自動実行
3. IoT Thingの自動作成（`gg-dev-core-docker`）
4. 証明書の自動生成
5. AWS IoT Coreへの自動接続

**出力例**:

```
=== Running Greengrass Docker Container ===
✅ Loaded .env.local
✅ Colima is running
✅ Docker image found

📋 Configuration:
   Thing Name: gg-dev-core-docker
   Thing Group: no-eat-to-stop-devices-dev
   AWS Region: us-east-1
   TES Role: GreengrassV2TokenExchangeRole
   TES Role Alias: GreengrassCoreTokenExchangeRoleAlias

🚀 Starting Greengrass container...
   This will automatically provision the device and connect to AWS IoT Core

✅ Container started

⏳ Waiting for Greengrass to provision and start (60 seconds)...
   The container is:
   1. Installing Greengrass Nucleus
   2. Creating IoT Thing: gg-dev-core-docker
   3. Generating certificates
   4. Connecting to AWS IoT Core

✅ Greengrass Nucleus is running
```

**所要時間**: 初回は1-2分程度

### ステップ4: AWS IoT Consoleで確認

1. [AWS IoT Console](https://console.aws.amazon.com/iot/) を開く
2. 「管理」→「モノ」を選択
3. `gg-dev-core-docker` が作成されていることを確認
4. 「アクティビティ」タブで接続状態を確認

### ステップ5: コンポーネントのデプロイ

```bash
./lib/greengrass/deploy-to-docker.sh
```

このスクリプトは以下を実行します：

1. レシピファイルをコンテナにコピー
2. アーティファクトをコンテナにコピー
3. Python依存パッケージのインストール
4. Greengrass CLIでローカルデプロイ

**出力例**:

```
=== Deploying VideoProcessor Component to Greengrass Docker ===
✅ Greengrass container is running
✅ Greengrass CLI found
📁 Creating directories in container...
📋 Copying recipe file...
📦 Copying artifacts...
📦 Installing Python dependencies in container...
🚀 Creating local deployment...
✅ Deployment created

📊 Deployment Status:
SUCCEEDED

📊 Component List:
com.noeatstop.VideoProcessor 1.0.0 RUNNING
```

### ステップ6: コンポーネントの動作確認

```bash
# コンポーネントのログを確認
docker exec aws-iot-greengrass tail -f /greengrass/v2/logs/com.noeatstop.VideoProcessor.log

# デプロイステータスを確認
docker exec aws-iot-greengrass /greengrass/v2/bin/greengrass-cli deployment status

# コンポーネント一覧を確認
docker exec aws-iot-greengrass /greengrass/v2/bin/greengrass-cli component list
```

## 開発ワークフロー

### 日常的な開発フロー

```bash
# 1. コードを編集
vim lib/greengrass/artifacts/com.noeatstop.VideoProcessor/1.0.0/video_processor.py

# 2. コンテナが起動していることを確認
docker ps | grep aws-iot-greengrass

# 3. コンポーネントを再デプロイ
./lib/greengrass/deploy-to-docker.sh

# 4. ログを確認
docker exec aws-iot-greengrass tail -f /greengrass/v2/logs/com.noeatstop.VideoProcessor.log
```

### コンテナの再起動

```bash
# コンテナを停止
docker stop aws-iot-greengrass

# コンテナを削除
docker rm aws-iot-greengrass

# コンテナを再起動
./lib/greengrass/run-greengrass-docker.sh
```

### イメージの再ビルド

Greengrassのバージョンを更新する場合：

```bash
# 既存のイメージを削除
docker rmi aws-iot-greengrass:latest

# イメージを再ビルド
./lib/greengrass/setup-greengrass-docker.sh
```

## 便利なコマンド

### コンテナ管理

```bash
# コンテナの起動
./lib/greengrass/run-greengrass-docker.sh

# コンテナの停止
docker stop aws-iot-greengrass

# コンテナの削除
docker rm -f aws-iot-greengrass

# コンテナの再起動
docker restart aws-iot-greengrass

# コンテナ内でシェル実行
docker exec -it aws-iot-greengrass bash
```

### ログ確認

```bash
# Nucleusのログ（リアルタイム）
docker logs -f aws-iot-greengrass

# Nucleusのログ（最新100行）
docker logs --tail 100 aws-iot-greengrass

# コンポーネントのログ
docker exec aws-iot-greengrass tail -f /greengrass/v2/logs/com.noeatstop.VideoProcessor.log

# 全ログファイルの一覧
docker exec aws-iot-greengrass ls -la /greengrass/v2/logs/
```

### Greengrass CLI

```bash
# デプロイステータス
docker exec aws-iot-greengrass /greengrass/v2/bin/greengrass-cli deployment status

# コンポーネント一覧
docker exec aws-iot-greengrass /greengrass/v2/bin/greengrass-cli component list

# コンポーネントの詳細
docker exec aws-iot-greengrass /greengrass/v2/bin/greengrass-cli component details \
  --name com.noeatstop.VideoProcessor

# コンポーネントの再起動
docker exec aws-iot-greengrass /greengrass/v2/bin/greengrass-cli component restart \
  --names com.noeatstop.VideoProcessor

# コンポーネントの停止
docker exec aws-iot-greengrass /greengrass/v2/bin/greengrass-cli component stop \
  --names com.noeatstop.VideoProcessor
```

### AWS IoT Core確認

```bash
# Thing の詳細
aws iot describe-thing --thing-name gg-dev-core-docker

# Thing の証明書
aws iot list-thing-principals --thing-name gg-dev-core-docker

# Thing Group のメンバー
aws iot list-things-in-thing-group --thing-group-name no-eat-to-stop-devices-dev
```

## トラブルシューティング

### 問題1: Dockerイメージのビルドが失敗する

**症状**: `docker build` コマンドがエラーで終了する

**解決策**:

```bash
# Colimaのリソースを増やす
colima stop
colima start --cpu 4 --memory 8 --disk 50

# Dockerのキャッシュをクリア
docker system prune -a

# 再度ビルド
./lib/greengrass/setup-greengrass-docker.sh
```

### 問題2: コンテナが起動しない

**症状**: `docker ps` でコンテナが表示されない

**解決策**:

```bash
# ログを確認
docker logs aws-iot-greengrass

# コンテナを削除して再起動
docker rm -f aws-iot-greengrass
./lib/greengrass/run-greengrass-docker.sh
```

### 問題3: Greengrassのプロビジョニングが失敗する

**症状**: ログに "Provisioning failed" や "Certificate error" が表示される

**解決策**:

```bash
# AWS認証情報を確認
cat ~/.aws/credentials

# IAMロールの存在を確認
aws iam get-role --role-name GreengrassV2TokenExchangeRole

# Role Aliasの存在を確認
aws iot describe-role-alias --role-alias GreengrassCoreTokenExchangeRoleAlias

# 必要に応じてIoT Coreリソースを作成
./lib/greengrass/setup-iot-device.sh
```

### 問題4: コンポーネントがデプロイされない

**症状**: デプロイコマンドは成功するが、コンポーネントが起動しない

**解決策**:

```bash
# Greengrass Nucleusのログ確認
docker logs -f aws-iot-greengrass

# コンポーネントのログ確認
docker exec aws-iot-greengrass tail -100 /greengrass/v2/logs/com.noeatstop.VideoProcessor.log

# デプロイステータス確認
docker exec aws-iot-greengrass /greengrass/v2/bin/greengrass-cli deployment status

# レシピファイルの構文確認
docker exec aws-iot-greengrass cat /greengrass/v2/recipes/com.noeatstop.VideoProcessor-1.0.0.yaml
```

### 問題5: Python依存パッケージのインストールが失敗する

**症状**: `pip3 install` がエラーで終了する

**解決策**:

```bash
# コンテナ内で手動インストール
docker exec -it aws-iot-greengrass bash

# コンテナ内で実行
apt-get update
apt-get install -y python3-pip python3-dev build-essential
pip3 install --upgrade pip
pip3 install boto3 opencv-python-headless pillow

# コンテナから抜ける
exit

# コンポーネントを再デプロイ
./lib/greengrass/deploy-to-docker.sh
```

## 開発方法の比較

| 項目 | aws-greengrass-docker | Python直接実行 |
|------|----------------------|---------------|
| IoT Core接続 | ✅ 自動プロビジョニング | ❌ 不可 |
| コンポーネントデプロイ | ✅ 可能 | ❌ 不可 |
| Greengrass IPC | ✅ 完全サポート | ❌ 不可 |
| Bedrock統合 | ✅ 可能 | ✅ 可能 |
| DynamoDB統合 | ✅ 可能 | ✅ 可能 |
| セットアップ時間 | 🐢 初回10分 | 🚀 1分 |
| 開発速度 | 🐢 中速 | 🚀 高速 |
| デバッグ | 🔧 やや難しい | ✅ 容易 |
| 本番環境との近さ | ✅ 非常に近い | ⚠️ 差異あり |
| macOS制限 | ✅ なし | ✅ なし |

## 推奨開発フロー

```
1. Python直接実行で開発・デバッグ（高速イテレーション）
   ./lib/greengrass/test-component-local.sh
   ↓
2. aws-greengrass-dockerで統合テスト（本番環境に近い）
   ./lib/greengrass/run-greengrass-docker.sh
   ./lib/greengrass/deploy-to-docker.sh
   ↓
3. AWS IoT Consoleでクラウドデプロイ（複数デバイス）
   aws greengrassv2 create-deployment ...
   ↓
4. Raspberry Pi（実機）で本番テスト
```

## 環境変数

コンテナ起動時に使用される環境変数：

| 変数名 | 説明 | デフォルト値 |
|--------|------|-------------|
| `AWS_REGION` | AWSリージョン | `us-east-1` |
| `PROVISION` | 自動プロビジョニング | `true` |
| `THING_NAME` | IoT Thing名 | `gg-dev-core-docker` |
| `THING_GROUP_NAME` | Thing Group名 | `no-eat-to-stop-devices-dev` |
| `TES_ROLE_NAME` | Token Exchange Role名 | `GreengrassV2TokenExchangeRole` |
| `TES_ROLE_ALIAS_NAME` | Role Alias名 | `GreengrassCoreTokenExchangeRoleAlias` |
| `COMPONENT_DEFAULT_USER` | コンポーネント実行ユーザー | `ggc_user:ggc_group` |
| `DEPLOY_DEV_TOOLS` | 開発ツールのデプロイ | `true` |

## 参考資料

- [aws-greengrass-docker GitHub](https://github.com/aws-greengrass/aws-greengrass-docker)
- [AWS IoT Greengrass V2 ドキュメント](https://docs.aws.amazon.com/greengrass/v2/developerguide/)
- [Greengrass Docker イメージ](https://hub.docker.com/r/amazon/aws-iot-greengrass)
- [Colima ドキュメント](https://github.com/abiosoft/colima)

---

**最終更新**: 2026-02-07
