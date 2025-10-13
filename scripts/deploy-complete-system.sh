#!/bin/bash

# Complete System Deployment Script
set -e

echo "Deploying NoEatToStop Complete System..."

# Build and deploy infrastructure
echo "Deploying AWS infrastructure..."
npm run build
npm run deploy

# Deploy frontend
echo "Deploying frontend..."
npm run deploy:frontend

# Run system tests
echo "Running system integration tests..."
npm run test:integration

# Deploy monitoring
echo "Setting up monitoring..."
aws events put-rule --name "NoEatToStopMetrics" --schedule-expression "rate(5 minutes)"
aws lambda add-permission --function-name NoEatToStopMonitoring --statement-id allow-cloudwatch --action lambda:InvokeFunction --principal events.amazonaws.com

# Create CloudWatch dashboard
aws cloudwatch put-dashboard --dashboard-name "NoEatToStop" --dashboard-body '{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["NoEatToStop", "MealDetectionAccuracy"],
          [".", "ChewingDetectionAccuracy"],
          [".", "TVControlSuccessRate"],
          [".", "SystemResponseTime"]
        ],
        "period": 300,
        "stat": "Average",
        "region": "ap-northeast-1",
        "title": "System Performance"
      }
    }
  ]
}'

echo "Complete system deployment finished!"
echo "Web App: <CDK output: WebAppUrl>"
echo "API: <CDK output: ApiEndpoint>"
