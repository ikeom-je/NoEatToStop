#!/bin/bash
# Edge E2E テストスクリプト
# Greengrass Docker コンテナ + AWS IoT Core + S3 の疎通検証

set -e

REGION="${AWS_REGION:-ap-northeast-1}"
THING_NAME="${THING_NAME:-noeatstop-edge-device}"
VIDEO_BUCKET="${VIDEO_BUCKET:?VIDEO_BUCKET 環境変数を設定してください}"
PASSED=0
FAILED=0

pass() { echo "  ✓ $1"; PASSED=$((PASSED + 1)); }
fail() { echo "  ✗ $1"; FAILED=$((FAILED + 1)); }

echo "=== Edge E2E テスト ==="
echo ""

# 1. Docker コンテナ稼働確認
echo "[1] Greengrass Docker コンテナ稼働確認"
if docker ps --format '{{.Names}}' | grep -q noeatstop-gg-core; then
  pass "コンテナ noeatstop-gg-core が稼働中"
else
  fail "コンテナ noeatstop-gg-core が見つかりません"
fi

# 2. Greengrass Core デバイス ヘルスチェック
echo "[2] Greengrass Core デバイス ヘルスチェック"
STATUS=$(aws greengrassv2 get-core-device \
  --core-device-thing-name "$THING_NAME" \
  --region "$REGION" \
  --query 'status' --output text 2>/dev/null || echo "ERROR")
if [ "$STATUS" = "HEALTHY" ]; then
  pass "Core デバイス ステータス: HEALTHY"
else
  fail "Core デバイス ステータス: $STATUS (期待: HEALTHY)"
fi

# 3. IoT Core MQTT Publish テスト
echo "[3] IoT Core MQTT Publish テスト"
PAYLOAD=$(echo -n "{\"test\":\"e2e\",\"device\":\"$THING_NAME\",\"ts\":\"$(date -Iseconds)\"}" | base64)
if aws iot-data publish --topic "noeatstop/edge/e2e-test" --payload "$PAYLOAD" --region "$REGION" 2>/dev/null; then
  pass "MQTT Publish 成功 (topic: noeatstop/edge/e2e-test)"
else
  fail "MQTT Publish 失敗"
fi

# 4. S3 バケットアクセステスト
echo "[4] S3 バケットアクセステスト"
TEST_KEY="e2e-test/$(date +%s).txt"
if echo "e2e-test-$(date -Iseconds)" | aws s3 cp - "s3://$VIDEO_BUCKET/$TEST_KEY" --region "$REGION" 2>/dev/null; then
  pass "S3 書き込み成功"
  # 読み取り確認
  if aws s3 cp "s3://$VIDEO_BUCKET/$TEST_KEY" - --region "$REGION" 2>/dev/null | grep -q "e2e-test"; then
    pass "S3 読み取り成功"
  else
    fail "S3 読み取り失敗"
  fi
  # クリーンアップ
  aws s3 rm "s3://$VIDEO_BUCKET/$TEST_KEY" --region "$REGION" 2>/dev/null
else
  fail "S3 書き込み失敗"
fi

# 5. Greengrass 内部ログ確認（ローテーションログも含む）
echo "[5] Greengrass Nucleus ログ確認"
if docker exec noeatstop-gg-core test -d /greengrass/v2/logs; then
  if docker exec noeatstop-gg-core grep -rq "Successfully connected to AWS IoT Core" /greengrass/v2/logs/ 2>/dev/null; then
    pass "AWS IoT Core 接続ログ確認"
  else
    fail "AWS IoT Core 接続ログが見つかりません"
  fi
else
  fail "Greengrass ログディレクトリが見つかりません"
fi

# 6. frame-capture コンテナ稼働確認
echo "[6] frame-capture コンテナ稼働確認"
if docker ps --format '{{.Names}}' | grep -q noeatstop-frame-capture; then
  pass "コンテナ noeatstop-frame-capture が稼働中"
else
  fail "コンテナ noeatstop-frame-capture が見つかりません"
fi

# 7. frame-capture → S3 アップロード確認
echo "[7] frame-capture → S3 フレームアップロード確認"
if aws s3 ls "s3://$VIDEO_BUCKET/live-frames/latest.jpg" --region "$REGION" 2>/dev/null | grep -q "latest.jpg"; then
  pass "S3 に live-frames/latest.jpg が存在"
else
  fail "S3 に live-frames/latest.jpg が見つかりません"
fi

# 結果サマリー
echo ""
echo "=== テスト結果 ==="
echo "PASSED: $PASSED / FAILED: $FAILED"
if [ $FAILED -eq 0 ]; then
  echo "すべてのテストに合格しました！"
  exit 0
else
  echo "一部のテストが失敗しました。"
  exit 1
fi
