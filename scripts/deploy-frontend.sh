#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# .env.local から環境変数を読み込み
if [ -f "$PROJECT_ROOT/.env.local" ]; then
  set -a
  source "$PROJECT_ROOT/.env.local"
  set +a
fi

STAGE=${ENVIRONMENT:-${1:-dev}}
REGION=${CDK_DEFAULT_REGION:-${AWS_DEFAULT_REGION:-ap-northeast-1}}
OUTPUTS_FILE="$PROJECT_ROOT/working/cdk-outputs-${STAGE}.json"

echo "=== Frontend Deployment (stage: $STAGE, region: $REGION) ==="

if [ ! -f "$OUTPUTS_FILE" ]; then
  echo "Error: CDK outputs not found at $OUTPUTS_FILE"
  echo "Run deploy-all.sh first, or deploy CDK manually."
  exit 1
fi

API_URL=$(node -e "
  const data = require('${OUTPUTS_FILE}');
  const stack = data['NoEatToStopStack-${STAGE}'];
  console.log(stack.ApiEndpoint);
")

echo "API URL: $API_URL"

# Build frontend
cd "$PROJECT_ROOT/frontend"
VITE_API_BASE_URL="${API_URL}" npm run build
cd "$PROJECT_ROOT"

# Deploy frontend via CDK
npx cdk deploy "NoEatToStopFrontend-${STAGE}" \
  --context stage="${STAGE}" \
  --require-approval never \
  --outputs-file "working/cdk-outputs-${STAGE}.json"

echo "Frontend deployed successfully."
