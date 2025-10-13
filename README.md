# NoEatToStop System (食べてなかったら止まるシステム)

A smart monitoring system that controls TV power based on children's eating behavior during meals. The system uses computer vision to detect when a child stops eating and automatically turns off the TV to encourage focus on the meal.

## Architecture Overview

The system consists of three main layers:

1. **Edge Device Layer**: Raspberry Pi + IoT Greengrass + Camera
2. **Cloud Processing Layer**: KVS + Rekognition/Bedrock + Lambda
3. **Management & Control Layer**: Vue.js SPA + CloudFront + S3

## Technology Stack

- **Language**: TypeScript
- **Infrastructure**: AWS CDK (Cloud Development Kit)
- **Runtime**: Node.js (ES2020 target)
- **Frontend**: Vue.js v3 + Tailwind CSS
- **Database**: Amazon DynamoDB
- **Video Processing**: Amazon Kinesis Video Streams, Rekognition, Bedrock
- **Edge Computing**: AWS IoT Greengrass
- **Container Runtime**: Colima (Docker Desktop alternative for Mac)

## Prerequisites

### Required Tools

- **Node.js**: v18 or higher
- **npm**: Package manager
- **AWS CLI**: For AWS service integration
- **Colima**: Docker container runtime (Mac)
- **Docker CLI**: Container operations
- **AWS CDK**: Infrastructure deployment

### Colima Setup (Mac Development Environment)

This project uses Colima instead of Docker Desktop for running Greengrass Core containers on Mac.

```bash
# Install Colima and Docker CLI
brew install colima docker docker-compose

# Start Colima with recommended settings for Greengrass
colima start --cpu 4 --memory 8 --disk 50

# Verify Docker is working
docker ps

# Check Colima status
colima status
```

**Why Colima?**
- Free and open-source (MIT license)
- Lightweight and fast
- Compatible with Docker CLI
- Better resource management than Docker Desktop

### Greengrass Development Environment Setup

```bash
# 1. Clone the repository
git clone <repository-url>
cd no-eat-to-stop-system

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.local.example .env.local
# Edit .env.local with your AWS credentials

# 4. Start Colima (if not already running)
colima start --cpu 4 --memory 8

# 5. Start Greengrass Core container
source .env.local
docker run --rm -d \
  --name gg-dev-core \
  -v ~/.aws/credentials:/root/.aws/credentials:ro \
  -v $(pwd)/greengrass:/greengrass/v2 \
  -p 8883:8883 \
  -e AWS_REGION=${AWS_REGION} \
  -e PROVISION=true \
  -e THING_NAME=gg-dev-core \
  -e THING_GROUP_NAME=gg-dev-group \
  amazon/aws-iot-greengrass:latest

# 6. Verify container is running
docker logs gg-dev-core
```

For detailed Colima usage and troubleshooting, see [Environment Guide](.kiro/steering/environment.md).

## Project Structure

```
no-eat-to-stop-system/
├── .env.local              # Environment variables (not in git)
├── .kiro/                  # Kiro IDE configuration and steering rules
├── PRFAQ.md               # Product requirements and FAQ (Japanese)
├── bin/                   # CDK application entry points
├── lib/                   # CDK stack definitions and constructs
│   ├── models/            # TypeScript interfaces and data models
│   ├── repositories/      # DynamoDB data access layer
│   ├── services/          # Business logic services
│   └── lambda/            # Lambda function implementations
├── test/                  # Unit tests
├── package.json           # Node.js dependencies and scripts
└── tsconfig.json          # TypeScript compiler configuration
```

## System Components

### Infrastructure Layer (AWS CDK)
- **S3 Buckets**: Video storage with 1-day lifecycle, judgment data storage, web app hosting
- **DynamoDB Tables**: MealSessions, EatingStates, SystemSettings with GSI for time-based queries
- **Kinesis Video Streams**: Real-time video ingestion from edge devices
- **Lambda Functions**: Video processing, state management, API handlers
- **API Gateway**: RESTful API for frontend integration
- **CloudFront**: CDN for web application delivery
- **IAM Roles**: Least-privilege access for edge devices and Lambda functions

### Edge Layer (IoT Greengrass)
- **VideoProcessor Component**: Python-based component for local video processing
- **Computer Vision**: OpenCV for face/mouth detection and chewing analysis
- **AI Integration**: Amazon Bedrock (Claude 3 Sonnet) for eating behavior analysis
- **Local Processing**: Configurable thresholds for face detection, chewing detection
- **Session Management**: Meal start/end detection, multiple children tracking

### Frontend Layer (Vue.js)
- **Dashboard**: Real-time meal session monitoring
- **LiveVideo**: Video feed display with configurable update intervals
- **SystemSettings**: Comprehensive configuration interface
- **EmergencyControl**: Manual TV control override
- **TVControlStatus**: TV control request monitoring and status display

## Configuration Parameters

The system supports comprehensive runtime configuration through the SystemSettings DynamoDB table and management interface:

### Basic Settings
- **pauseThreshold**: Motion stop threshold (default: 10 seconds)
- **confidenceThreshold**: AI confidence threshold (default: 80%)
- **videoBufferDuration**: Video buffer time (default: 10 seconds)
- **analysisVideoDuration**: Analysis video duration (default: 20 seconds)
- **videoRetentionDays**: Video retention period (default: 1 day)

### Video Settings
- **videoResolution**: Camera resolution (default: 640x360)
- **videoFrameRate**: Frame rate (default: 30fps)
- **liveVideoUpdateInterval**: Real-time video update interval (default: 3 seconds)

### Recognition Settings
- **faceDetectionThreshold**: Face recognition threshold
- **mouthDetectionThreshold**: Mouth position recognition threshold
- **chewingDetectionThreshold**: Chewing detection threshold

### Target Settings
- **childCount**: Number of children to monitor
- **excludeAdults**: Adult detection exclusion flag

### Control Settings
- **tvControlMethod**: 'smart_tv_api' or 'alexa_voice'
- **tvControlRetryCount**: Retry count (default: 1)
- **tvControlRetryInterval**: Retry interval (default: 3 seconds)

## AWS Resources

The CDK stack creates the following AWS resources:

- **S3 Buckets**: 
  - Video storage with 1-day lifecycle policy
  - Judgment data storage for error analysis
  - Web app hosting with CloudFront distribution
- **DynamoDB Tables**: 
  - MealSessions (with GSI for user queries)
  - EatingStates (with timestamp-based queries)
  - SystemSettings (configuration management)
- **Kinesis Video Stream**: Real-time video ingestion
- **Lambda Functions**: Video processing, state management, API handlers
- **API Gateway**: RESTful API endpoints
- **CloudFront Distribution**: Web application CDN
- **IAM Roles**: Edge device role, Lambda execution roles
- **IoT Core Resources**: Things, Thing Groups, Certificates, Policies

## Development Commands

### Colima Management

```bash
# Start Colima
colima start --cpu 4 --memory 8

# Stop Colima
colima stop

# Restart Colima
colima restart

# Check Colima status
colima status

# Delete Colima (complete reset)
colima delete
```

### Greengrass Container Management

```bash
# Start Greengrass Core container
docker start gg-dev-core

# Stop Greengrass Core container
docker stop gg-dev-core

# View container logs
docker logs -f gg-dev-core

# Execute commands in container
docker exec -it gg-dev-core bash

# Remove container
docker rm -f gg-dev-core
```

### TypeScript Build

```bash
# Build TypeScript
npm run build

# Watch mode for development
npm run watch

# Run tests
npm run test
```

### CDK Deployment

```bash
# Deploy infrastructure only
npm run deploy

# Deploy frontend only
npm run deploy:frontend

# Deploy both infrastructure and frontend
npm run deploy:all

# Destroy infrastructure
npm run destroy

# Synthesize CDK template
npm run synth
```

## Deployment

### Infrastructure Deployment

```bash
# Deploy AWS infrastructure (S3, CloudFront, DynamoDB, Lambda, API Gateway, etc.)
npm run deploy
```

The CDK deployment will:
- Create all AWS resources defined in the stack
- Set up IAM roles and permissions
- Configure DynamoDB tables with GSI
- Deploy Lambda functions
- Create API Gateway endpoints
- Set up CloudFront distribution

### Frontend Deployment

```bash
# Build and deploy Vue.js app to S3/CloudFront
npm run deploy:frontend
```

The frontend deployment script will:
- Automatically retrieve the S3 bucket name and API Gateway URL from CloudFormation
- Update the frontend environment variables with the correct API URL
- Build the Vue.js application
- Upload all files to S3
- Invalidate CloudFront cache

### Complete Deployment

```bash
# Deploy both infrastructure and frontend in one command
npm run deploy:all
```

After deployment, the web application will be accessible via the CloudFront URL shown in the output.

## Environment Setup

### Prerequisites

1. **Install Colima and Docker CLI**:
   ```bash
   brew install colima docker docker-compose
   ```

2. **Start Colima**:
   ```bash
   colima start --cpu 4 --memory 8 --disk 50
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.local.example .env.local
   # Edit .env.local with your AWS credentials and configuration
   ```

4. **Install dependencies**:
   ```bash
   npm install
   ```

5. **Build the project**:
   ```bash
   npm run build
   ```

6. **Run tests**:
   ```bash
   npm test
   ```

### Greengrass Development on macOS

**Important**: Greengrass IPC (Inter-Process Communication) has fundamental limitations on macOS/Colima due to Unix domain socket restrictions. See [macOS IPC Limitations](docs/reports/MACOS_IPC_LIMITATIONS.md) for technical details.

**Recommended Development Approach**:

1. **Python Direct Execution** (Recommended for rapid development):
   ```bash
   ./lib/greengrass/test-component-local.sh
   ```
   - Full functionality (camera, Bedrock AI, DynamoDB, S3)
   - Fast iteration cycle
   - Easy debugging

2. **AWS IoT Console Deployment** (For integration testing):
   - Deploy components via AWS IoT Console
   - Test cloud-based deployment mechanisms

3. **Linux Environment** (For production testing):
   - Use Raspberry Pi or EC2
   - Full Greengrass functionality including IPC

For detailed setup instructions, see [Docker Development Guide](docs/guides/DOCKER_DEVELOPMENT_GUIDE.md).

## Error Handling

The system implements comprehensive error handling across all layers:

- **Camera failure**: System enters safe state, no TV control actions
- **Network disconnection**: Edge processing continues locally, syncs when reconnected
- **AI/Recognition errors**: Falls back to safe state (no control), logs for analysis
- **TV control failure**: Retry mechanism with configurable attempts and intervals
- **DynamoDB errors**: Exponential backoff retry with error logging
- **S3 upload failures**: Local buffering with retry queue

## Troubleshooting

### Colima Issues

**Docker command fails with "Cannot connect to the Docker daemon"**:
```bash
# Check Docker context
docker context ls

# Switch to Colima context
docker context use colima

# Verify Colima is running
colima status

# Start Colima if not running
colima start
```

**Colima won't start**:
```bash
# Check logs
colima logs

# Complete reset
colima delete
colima start --cpu 4 --memory 8 --disk 50
```

**Volume mount not working**:
```bash
# SSH into Colima VM to check mounts
colima ssh
ls -la /Users/$(whoami)/

# If home directory is not visible, restart Colima
exit
colima restart
```

**Architecture mismatch errors**:
```bash
# Check current architecture
colima status | grep Arch

# For x86_64 devices (Intel)
colima delete
colima start --arch x86_64 --cpu 4 --memory 8

# For arm64 devices (Apple Silicon)
colima delete
colima start --arch aarch64 --cpu 4 --memory 8
```

### Greengrass Issues

For Greengrass-specific troubleshooting:
- [IPC Troubleshooting Report](docs/reports/IPC_TROUBLESHOOTING_REPORT.md) - Comprehensive IPC connection troubleshooting
- [macOS IPC Limitations](docs/reports/MACOS_IPC_LIMITATIONS.md) - Technical details of macOS/Colima limitations
- [Docker Development Guide](docs/guides/DOCKER_DEVELOPMENT_GUIDE.md) - Complete development environment setup

### General Troubleshooting

For more troubleshooting tips, see:
- [Development Guide](.kiro/steering/development.md)
- [Environment Guide](.kiro/steering/environment.md)
- [IPC Troubleshooting Report](docs/reports/IPC_TROUBLESHOOTING_REPORT.md)
- [macOS IPC Limitations](docs/reports/MACOS_IPC_LIMITATIONS.md)

## Security Features

- **IAM Least-Privilege Access**: Minimal required permissions for each component
- **Data Encryption**: 
  - S3 server-side encryption (SSE-S3)
  - DynamoDB encryption at rest (AWS managed keys)
- **Video Retention**: Automatic deletion after 1 day via S3 lifecycle policies
- **Access Control**: Management interface authentication (future implementation)
- **Network Security**: 
  - HTTPS enforcement via CloudFront
  - API Gateway with IAM authorization
  - IoT Core certificate-based authentication

## Project Status

For current implementation status and next steps, see:
- [Implementation Tasks](.kiro/specs/no-eat-to-stop-implementation/tasks.md) - Detailed task list with progress tracking
- [Next Steps](NEXT_STEPS.md) - Quick reference for deployment and development
- [Project Completion Report](docs/reports/PROJECT_COMPLETION_REPORT.md) - Overall project status

## Documentation

For comprehensive documentation, see the [Documentation Index](docs/README.md):

### Quick Links
- **[Installation Guide](docs/INSTALLATION.md)** - システムのインストール手順
- **[User Manual](docs/USER_MANUAL.md)** - ユーザーマニュアル
- **[Docker Development Guide](docs/guides/DOCKER_DEVELOPMENT_GUIDE.md)** - Docker開発環境のセットアップ
- **[IPC Troubleshooting](docs/reports/IPC_TROUBLESHOOTING_REPORT.md)** - Greengrass IPC問題のトラブルシューティング
- **[macOS Limitations](docs/reports/MACOS_IPC_LIMITATIONS.md)** - macOS/Colima環境の制限事項

### Specifications
- [Requirements Document](.kiro/specs/no-eat-to-stop-system/requirements.md)
- [Design Document](.kiro/specs/no-eat-to-stop-system/design.md)
- [Implementation Tasks](.kiro/specs/no-eat-to-stop-implementation/tasks.md)
