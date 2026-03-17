# Docker上でのGreengrass Core セットアップガイド

## 概要

このガイドでは、Mac（Colima）上でDocker コンテナとしてGreengrass Coreを起動し、AWS IoT Coreに接続する方法を説明します。

## 前提条件

- macOS（Apple Silicon または Intel）
- Colima がインストール済み
- AWS認証情報が設定済み（`.env.local`）
- IoT Core リソースが作成済み（Thing、証明書、ロール）

## セットアップ手順

### 1. Colimaの起動

```bash
# Colimaが起動していない場合
colima start --cpu 4 --memory 8 --disk 50

# 起動確認
colima status
```

### 2. IoT Core接続情報の確認

既存のIoT Coreリソースを確認します：

```bash
# Thing の確認
aws iot describe-thing --thing-name gg-dev-core-local

# 証明書ファイルの確認
ls -la greengrass/v2/certs/
# 以下のファイルが必要:
# - device.pem.crt
# - private.pem.key
# - AmazonRootCA1.pem
# - iot-data-endpoint.txt
# - iot-cred-endpoint.txt
```

証明書がない場合は、セットアップスクリプトを実行：

```bash
./lib/greengrass/setup-iot-device.sh
```

### 3. Greengrass Coreコンテナの起動

```bash
./lib/greengrass/start-greengrass-with-iot-fixed.sh
```

このスクリプトは以下を実行します：

1. 環境変数の読み込み（`.env.local`）
2. Colimaの起動確認
3. 証明書ファイルの確認
4. IoTエンドポイントの読み込み
5. Greengrass設定ファイルの作成（`config.yaml`）
6. Dockerコンテナの起動
7. Greengrass Nucleusの起動確認

**出力例**:

```
=== Starting Greengrass Core with IoT Core Connection ===
✅ Loaded .env.local
✅ Colima is running
✅ Certificate files found
✅ IoT Data Endpoint: <YOUR_IOT_DATA_ENDPOINT>-ats.iot.<REGION>.amazonaws.com
✅ IoT Credential Endpoint: <YOUR_IOT_CREDENTIAL_ENDPOINT>.credentials.iot.<REGION>.amazonaws.com
📝 Creating Greengrass configuration...
✅ Configuration file created
🚀 Starting Greengrass Core container...
✅ Greengrass Core container started
```

### 4. コンテナの動作確認

```bash
# コンテナのステータス確認
docker ps | grep gg-dev-core

# ログの確認
docker logs -f gg-dev-core

# コンテナ内にアクセス
docker exec -it gg-dev-core bash
```

### 5. IoT Core接続の確認

AWS IoT Consoleで確認：

1. AWS IoT Console を開く
2. 管理 → モノ → `gg-dev-core-local` を選択
3. アクティビティ タブで接続状態を確認
4. Shadow タブでデバイスの状態を確認

コマンドラインで確認：

```bash
# Thing の詳細
aws iot describe-thing --thing-name gg-dev-core-local

# 接続状態の確認（ログから）
docker logs gg-dev-core | grep -i "connected"
```

### 6. コンポーネントのデプロイ

```bash
./lib/greengrass/local-deploy.sh
```

このスクリプトは以下を実行します：

1. レシピファイルをコンテナにコピー
2. アーティファクトをコンテナにコピー
3. Python依存パッケージのインストール
4. Greengrass CLIでローカルデプロイ
5. デプロイステータスの確認

**出力例**:

```
=== Deploying VideoProcessor Component Locally ===
✅ Greengrass container is running
📁 Creating directories in container...
📋 Copying recipe file...
📦 Copying artifacts...
📦 Installing Python dependencies in container...
✅ Greengrass CLI found
🚀 Creating local deployment...
✅ Deployment created
```

### 7. コンポーネントの動作確認

```bash
# コンポーネントのログ確認
docker exec gg-dev-core tail -f /greengrass/v2/logs/com.noeatstop.VideoProcessor.log

# デプロイステータス確認
docker exec gg-dev-core /greengrass/v2/bin/greengrass-cli deployment status

# コンポーネント一覧
docker exec gg-dev-core /greengrass/v2/bin/greengrass-cli component list
```

## トラブルシューティング

### 問題1: Greengrassコンテナが起動しない

**症状**: `docker ps`でコンテナが表示されない

**解決策**:

```bash
# ログを確認
docker logs gg-dev-core

# コンテナを削除して再起動
docker rm -f gg-dev-core
./lib/greengrass/start-greengrass-with-iot-fixed.sh
```

### 問題2: IoT Core接続エラー

**症状**: ログに "Connection refused" や "Certificate error" が表示される

**解決策**:

```bash
# 証明書ファイルの確認
ls -la greengrass/v2/certs/

# 証明書の権限確認
chmod 644 greengrass/v2/certs/*.crt
chmod 644 greengrass/v2/certs/*.pem
chmod 600 greengrass/v2/certs/*.key

# IoTエンドポイントの確認
cat greengrass/v2/certs/iot-data-endpoint.txt
cat greengrass/v2/certs/iot-cred-endpoint.txt

# 証明書の再作成
./lib/greengrass/setup-iot-device.sh
```

### 問題3: IPC サーバーが起動しない

**症状**: ログに "AWS_IO_SOCKET_NOT_CONNECTED" エラーが表示される

**原因**: macOS/Colima環境では、Unix domain socketの制限によりIPCサーバーが起動できません。

**解決策**:

これは既知の制限です。以下の代替案を使用してください：

1. **Python直接実行**（推奨）:
   ```bash
   ./lib/greengrass/test-component-local.sh
   ```

2. **実機（Raspberry Pi）でのテスト**:
   - Raspberry Pi上でGreengrassを実行
   - IPC制限なし

### 問題4: コンポーネントがデプロイされない

**症状**: デプロイコマンドは成功するが、コンポーネントが起動しない

**解決策**:

```bash
# Greengrass Nucleusのログ確認
docker logs -f gg-dev-core

# コンポーネントのログ確認
docker exec gg-dev-core tail -100 /greengrass/v2/logs/com.noeatstop.VideoProcessor.log

# デプロイステータス確認
docker exec gg-dev-core /greengrass/v2/bin/greengrass-cli deployment status

# コンポーネントの再起動
docker exec gg-dev-core /greengrass/v2/bin/greengrass-cli component restart \
  --names com.noeatstop.VideoProcessor
```

### 問題5: Bedrock APIエラー

**症状**: コンポーネントログに "Bedrock API error" が表示される

**解決策**:

```bash
# IAMロールの権限確認
aws iam get-role --role-name GreengrassV2TokenExchangeRole

# Bedrockモデルアクセスの確認
aws bedrock list-foundation-models --region us-east-1

# AWS認証情報の確認
docker exec gg-dev-core env | grep AWS
```

## 便利なコマンド

### コンテナ管理

```bash
# コンテナの起動
./lib/greengrass/start-greengrass-with-iot-fixed.sh

# コンテナの停止
docker stop gg-dev-core

# コンテナの削除
docker rm -f gg-dev-core

# コンテナの再起動
docker restart gg-dev-core

# コンテナ内でシェル実行
docker exec -it gg-dev-core bash
```

### ログ確認

```bash
# Nucleusのログ（リアルタイム）
docker logs -f gg-dev-core

# Nucleusのログ（最新100行）
docker logs --tail 100 gg-dev-core

# コンポーネントのログ
docker exec gg-dev-core tail -f /greengrass/v2/logs/com.noeatstop.VideoProcessor.log

# 全ログファイルの一覧
docker exec gg-dev-core ls -la /greengrass/v2/logs/
```

### Greengrass CLI

```bash
# デプロイステータス
docker exec gg-dev-core /greengrass/v2/bin/greengrass-cli deployment status

# コンポーネント一覧
docker exec gg-dev-core /greengrass/v2/bin/greengrass-cli component list

# コンポーネントの詳細
docker exec gg-dev-core /greengrass/v2/bin/greengrass-cli component details \
  --name com.noeatstop.VideoProcessor

# コンポーネントの再起動
docker exec gg-dev-core /greengrass/v2/bin/greengrass-cli component restart \
  --names com.noeatstop.VideoProcessor

# コンポーネントの停止
docker exec gg-dev-core /greengrass/v2/bin/greengrass-cli component stop \
  --names com.noeatstop.VideoProcessor
```

## Docker vs Python直接実行の比較

| 項目 | Docker上のGreengrass | Python直接実行 |
|------|---------------------|---------------|
| IoT Core接続 | ✅ 可能 | ❌ 不可 |
| コンポーネントデプロイ | ✅ 可能 | ❌ 不可 |
| Greengrass IPC | ⚠️ macOS制限あり | ❌ 不可 |
| Bedrock統合 | ✅ 可能 | ✅ 可能 |
| DynamoDB統合 | ✅ 可能 | ✅ 可能 |
| 開発速度 | 🐢 遅い | 🚀 高速 |
| デバッグ | 🔧 難しい | ✅ 容易 |
| 本番環境との近さ | ✅ 近い | ⚠️ 差異あり |

## 推奨開発フロー

```
1. Python直接実行で開発・デバッグ
   ./lib/greengrass/test-component-local.sh
   ↓
2. Docker上でGreengrass Coreで統合テスト
   ./lib/greengrass/start-greengrass-with-iot-fixed.sh
   ./lib/greengrass/local-deploy.sh
   ↓
3. AWS IoT Consoleでクラウドデプロイ
   aws greengrassv2 create-deployment ...
   ↓
4. Raspberry Pi（実機）で本番テスト
```

## 参考資料

- [AWS IoT Greengrass V2 ドキュメント](https://docs.aws.amazon.com/greengrass/v2/developerguide/)
- [Greengrass Docker イメージ](https://hub.docker.com/r/amazon/aws-iot-greengrass)
- [Colima ドキュメント](https://github.com/abiosoft/colima)
- [macOS制限事項](./MACOS_LIMITATIONS.md)

---

**最終更新**: 2026-02-07
