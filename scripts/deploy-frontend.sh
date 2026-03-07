#!/bin/bash
set -e

STAGE=${1:-dev}
REGION=${AWS_REGION:-ap-northeast-1}
OUTPUTS_FILE="working/cdk-outputs-${STAGE}.json"

echo "=== Frontend Deployment (stage: $STAGE) ==="

if [ ! -f "$OUTPUTS_FILE" ]; then
  echo "Error: CDK outputs not found at $OUTPUTS_FILE"
  echo "Run deploy-all.sh first, or deploy CDK manually."
  exit 1
fi

API_URL=$(cat "$OUTPUTS_FILE" | node -e "
  const fs = require('fs');
  const data = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
  const stack = data['NoEatToStopStack-${STAGE}'];
  console.log(stack.ApiEndpoint);
")

WEBAPP_BUCKET=$(cat "$OUTPUTS_FILE" | node -e "
  const fs = require('fs');
  const data = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
  const stack = data['NoEatToStopStack-${STAGE}'];
  console.log(stack.WebAppBucketName);
")

echo "API URL: $API_URL"
echo "Bucket: $WEBAPP_BUCKET"

cd frontend
VITE_API_BASE_URL="${API_URL}" npm run build
aws s3 sync dist/ "s3://${WEBAPP_BUCKET}/" --delete --region "${REGION}"
cd ..

echo "Frontend deployed successfully."
