#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# .env.local から環境変数を読み込み
if [ -f "$PROJECT_ROOT/.env.local" ]; then
  echo "Loading .env.local..."
  set -a
  source "$PROJECT_ROOT/.env.local"
  set +a
else
  echo "Warning: .env.local not found. Using default values."
fi

STAGE=${ENVIRONMENT:-${1:-dev}}
REGION=${CDK_DEFAULT_REGION:-${AWS_DEFAULT_REGION:-ap-northeast-1}}

echo "=== NoEatToStop System Deployment ==="
echo "Stage: $STAGE"
echo "Region: $REGION"
echo "AWS Profile: ${AWS_PROFILE:-default}"
echo ""

# working ディレクトリ確認
mkdir -p "$PROJECT_ROOT/working"

# 1. Build backend
echo "[1/4] Building TypeScript..."
cd "$PROJECT_ROOT"
npm run build

# 2. Run tests
echo "[2/4] Running tests..."
npm test

# 3. Deploy CDK infrastructure
echo "[3/4] Deploying AWS infrastructure..."
npx cdk deploy "NoEatToStopStack-${STAGE}" \
  --context stage="${STAGE}" \
  --require-approval never \
  --outputs-file "working/cdk-outputs-${STAGE}.json"

# 4. Build and deploy frontend
echo "[4/4] Building and deploying frontend..."
cd "$PROJECT_ROOT/frontend"

# CDK outputs から API URL とバケット名を取得
OUTPUTS_FILE="$PROJECT_ROOT/working/cdk-outputs-${STAGE}.json"

API_URL=$(node -e "
  const data = require('${OUTPUTS_FILE}');
  const stack = data['NoEatToStopStack-${STAGE}'];
  console.log(stack.ApiEndpoint);
")

WEBAPP_BUCKET=$(node -e "
  const data = require('${OUTPUTS_FILE}');
  const stack = data['NoEatToStopStack-${STAGE}'];
  console.log(stack.WebAppBucketName);
")

WEBAPP_URL=$(node -e "
  const data = require('${OUTPUTS_FILE}');
  const stack = data['NoEatToStopStack-${STAGE}'];
  console.log(stack.WebAppUrl);
")

VITE_API_BASE_URL="${API_URL}" npm run build
aws s3 sync dist/ "s3://${WEBAPP_BUCKET}/" --delete --region "${REGION}"

cd "$PROJECT_ROOT"

echo ""
echo "=== Deployment Complete ==="
echo "Management UI: ${WEBAPP_URL}"
echo "API Endpoint:  ${API_URL}"
echo "CDK outputs:   working/cdk-outputs-${STAGE}.json"
