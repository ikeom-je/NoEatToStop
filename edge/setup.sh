#!/bin/bash
set -e

echo "=== NoEatToStop Edge Device Setup ==="

# 環境変数確認
if [ -z "$AWS_REGION" ]; then
  export AWS_REGION="ap-northeast-1"
fi

if [ -z "$THING_NAME" ]; then
  export THING_NAME="noeatstop-edge-device"
fi

# 証明書ディレクトリ
CERTS_DIR="./certs"
CONFIG_DIR="./config"

echo "Region: $AWS_REGION"
echo "Thing Name: $THING_NAME"

# ディレクトリ作成
mkdir -p "$CERTS_DIR" "$CONFIG_DIR" greengrass-v2

# 証明書の確認
if [ ! -f "$CERTS_DIR/device.cert.pem" ] || [ ! -f "$CERTS_DIR/device.private.key" ]; then
  echo ""
  echo "IoT証明書が見つかりません。"
  echo "AWS IoT Coreで証明書を作成し、以下に配置してください:"
  echo "  $CERTS_DIR/device.cert.pem"
  echo "  $CERTS_DIR/device.private.key"
  echo "  $CERTS_DIR/AmazonRootCA1.pem"
  echo ""
  echo "AWS IoT Core コンソール → セキュリティ → 証明書 → 作成"
  echo ""

  # Amazon Root CA のダウンロード
  if [ ! -f "$CERTS_DIR/AmazonRootCA1.pem" ]; then
    echo "Amazon Root CA をダウンロードしています..."
    curl -o "$CERTS_DIR/AmazonRootCA1.pem" \
      "https://www.amazontrust.com/repository/AmazonRootCA1.pem"
    echo "Root CA ダウンロード完了"
  fi

  exit 1
fi

echo "証明書を確認しました"

# Greengrass config 生成
IOT_ENDPOINT=$(aws iot describe-endpoint \
  --endpoint-type iot:Data-ATS \
  --region "$AWS_REGION" \
  --query 'endpointAddress' \
  --output text 2>/dev/null || echo "")

if [ -z "$IOT_ENDPOINT" ]; then
  echo "Warning: AWS IoT エンドポイントを取得できませんでした。"
  echo "config/config.yaml を手動で設定してください。"
else
  cat > "$CONFIG_DIR/config.yaml" <<EOF
---
system:
  certificateFilePath: "/greengrass/v2/certs/device.cert.pem"
  privateKeyPath: "/greengrass/v2/certs/device.private.key"
  rootCaPath: "/greengrass/v2/certs/AmazonRootCA1.pem"
  rootpath: "/greengrass/v2"
  thingName: "${THING_NAME}"
services:
  aws.greengrass.Nucleus:
    componentType: "NUCLEUS"
    configuration:
      awsRegion: "${AWS_REGION}"
      iotRoleAlias: "GreengrassCoreTokenExchangeRoleAlias"
      iotDataEndpoint: "${IOT_ENDPOINT}"
      iotCredEndpoint: "https://credentials.iot.${AWS_REGION}.amazonaws.com"
EOF
  echo "Greengrass config を生成しました"
fi

echo ""
echo "セットアップ完了。以下のコマンドで起動できます:"
echo "  docker compose up -d"
echo ""
echo "USB カメラを使用する場合は docker-compose.yml の"
echo "volumes セクションのコメントを解除してください。"
