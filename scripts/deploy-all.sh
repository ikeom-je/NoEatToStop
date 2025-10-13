#!/bin/bash

set -e

STAGE=${1:-dev}
echo "Deploying NoEatToStop system to stage: $STAGE"

# Build TypeScript
echo "Building TypeScript..."
npm run build

# Deploy infrastructure
echo "Deploying infrastructure..."
npm run deploy -- --context stage=$STAGE

# Deploy frontend
echo "Deploying frontend..."
STAGE=$STAGE npm run deploy:frontend

# Run post-deployment tests
echo "Running post-deployment tests..."
npm run test:e2e:headless

echo "✅ Deployment completed successfully!"
echo "🌐 Access the web app via the CloudFront URL shown above"
