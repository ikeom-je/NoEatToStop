#!/bin/bash
set -e

STAGE=${1:-dev}
REGION=${AWS_REGION:-ap-northeast-1}

echo "=== NoEatToStop System Deployment (stage: $STAGE) ==="

# 1. Build backend
echo "[1/4] Building TypeScript..."
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
cd frontend

# Inject API URL from CDK outputs
API_URL=$(cat "../working/cdk-outputs-${STAGE}.json" | node -e "
  const fs = require('fs');
  const data = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
  const stack = data['NoEatToStopStack-${STAGE}'];
  console.log(stack.ApiEndpoint);
")

VITE_API_BASE_URL="${API_URL}" npm run build

# Get webapp bucket name
WEBAPP_BUCKET=$(cat "../working/cdk-outputs-${STAGE}.json" | node -e "
  const fs = require('fs');
  const data = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
  const stack = data['NoEatToStopStack-${STAGE}'];
  console.log(stack.WebAppBucketName);
")

aws s3 sync dist/ "s3://${WEBAPP_BUCKET}/" --delete --region "${REGION}"

cd ..

echo ""
echo "=== Deployment Complete ==="
echo "CDK outputs: working/cdk-outputs-${STAGE}.json"
