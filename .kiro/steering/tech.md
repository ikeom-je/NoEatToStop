# Technology Stack

## Core Technologies

- **Language**: TypeScript
- **Infrastructure**: AWS CDK (Cloud Development Kit)
- **Runtime**: Node.js (ES2020 target)
- **Package Manager**: npm

## AWS Services

- **Video Streaming**: Amazon Kinesis Video Streams (KVS)
- **Computer Vision**: Amazon Rekognition + Amazon Bedrock (Claude/Twelvelabs)
- **Storage**: Amazon S3 (video storage and web app hosting)
- **Database**: Amazon DynamoDB (meal sessions, eating states, system settings)
- **Edge Computing**: AWS IoT Greengrass (local Lambda functions)
- **CDN**: Amazon CloudFront
- **Monitoring**: Amazon Managed Grafana + QuickSight
- **TV Control**: Interface-based external system integration

## Frontend

- **Framework**: Vue.js v3
- **Styling**: Tailwind CSS
- **Architecture**: Single Page Application (SPA)
- **Hosting**: S3 + CloudFront
- **State Management**: Pinia (for TV control status, meal data, settings)

## Edge Device

- **Production**: Raspberry Pi with USB webcamera
- **Development**: macOS for testing
- **Processing**: Local object detection via IoT Greengrass
- **TV Control**: Mock interface for development and testing

## Build System & Commands

### Development Commands
```bash
# Build TypeScript
npm run build

# Watch mode for development
npm run watch

# Run tests
npm run test
```

### CDK Commands
```bash
# Deploy infrastructure
npm run deploy

# Deploy frontend only
npm run deploy:frontend

# Deploy both infrastructure and frontend
npm run deploy:all

# Destroy infrastructure
npm run destroy

# General CDK commands
npm run cdk -- <command>
```

### Deployment Process
- **Infrastructure**: AWS CDK for all AWS resources
- **Frontend**: Automated build and S3 upload with CloudFront distribution
- **Environment Variables**: Dynamic API URL injection from CloudFormation outputs
- **Build Pipeline**: Vue.js build → S3 upload → CloudFront invalidation

## TypeScript Configuration

- **Target**: ES2020
- **Module**: CommonJS
- **Strict mode**: Enabled with comprehensive type checking
- **Source maps**: Inline for debugging
- **Decorators**: Experimental decorators enabled

## Project Dependencies

- **CDK**: v2.100.0 (infrastructure as code)
- **Testing**: Jest with ts-jest for TypeScript support
- **AWS SDK**: Included via aws-cdk-lib