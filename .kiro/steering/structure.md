# Project Structure

## Root Directory Layout

```
no-eat-to-stop-system/
├── .env.local              # Local environment variables
├── .kiro/                  # Kiro IDE configuration and steering rules
├── PRFAQ.md               # Product requirements and FAQ (Japanese)
├── bin/                   # CDK application entry points
├── lib/                   # CDK stack definitions and constructs
├── prompt-history.md      # Prompt that the agent run with 
├── package.json           # Node.js dependencies and scripts
└── tsconfig.json          # TypeScript compiler configuration
```
## Development Settings(must)
- .env.local has the paramters and settings for this Project
- AWS account and related params in .env.local
- you must set aws account and related params like AWS Profile, Region and so on.
- If AWS Error occurs, check if aws params and other environ parames are correct.
- Environment variables for dvelopment in .env.local

## Prompt history
- Agent must add prompt in prompt-history.md after 1 prompt finishs to run all.


## Key Directories

### `/lib` - Infrastructure Code
- Contains CDK stack definitions
- `no-eat-to-stop-stack.ts` - Main infrastructure stack
- Defines AWS resources: S3, DynamoDB, Kinesis Video Streams, IAM roles, CloudFront

### `/bin` - Application Entry Points
- CDK application bootstrap files
- Entry points for deployment commands

### `/.kiro` - Development Configuration
- Steering rules for AI assistant guidance
- Project-specific IDE settings and specifications

## Infrastructure Architecture

The CDK stack creates a multi-stage environment with the following resources:

### Storage Layer
- **Video Bucket**: Stores meal session recordings (1-day lifecycle)
- **Web App Bucket**: Hosts Vue.js SPA with public read access
- **DynamoDB Tables**:
  - `MealSessions-{stage}`: Meal session metadata
  - `EatingStates-{stage}`: Real-time eating state records
  - `SystemSettings-{stage}`: Configuration settings

### Streaming & Processing
- **Kinesis Video Stream**: Real-time video feed from edge devices
- **Lambda Functions**: Video processing and AI analysis
- **CloudFront Distribution**: CDN for web application

### Security & Access
- **Edge Device Role**: IoT credentials for Raspberry Pi
- **Lambda Execution Role**: Permissions for video processing
- Least-privilege IAM policies for each component

## Naming Conventions

- **Resources**: PascalCase with descriptive names (`VideoBucket`, `MealSessionsTable`)
- **Files**: kebab-case for CDK stacks (`no-eat-to-stop-stack.ts`)
- **Environment**: Stage-based resource naming (`resource-name-{stage}`)

## Development Workflow

1. Modify infrastructure in `/lib` directory
2. Build TypeScript with `npm run build`
3. Deploy changes with `npm run deploy`
4. Test locally during development on macOS
5. Deploy to Raspberry Pi for production edge processing