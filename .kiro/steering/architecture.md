# Architecture Principles and Patterns

## Architecture Philosophy

### Core Principles

1. **Separation of Concerns**: 関心事を明確に分離し、各コンポーネントの責務を限定
2. **Loose Coupling**: コンポーネント間の依存を最小化し、変更の影響範囲を限定
3. **High Cohesion**: 関連する機能を1つのモジュールにまとめる
4. **Single Responsibility**: 各モジュールは1つの責務のみを持つ
5. **Open/Closed Principle**: 拡張に対して開き、修正に対して閉じる

### Design Goals

- **スケーラビリティ**: 負荷増加に対応できる設計
- **可用性**: 障害時も継続稼働できる冗長性
- **保守性**: 理解しやすく変更しやすいコード
- **テスタビリティ**: テストが容易な設計
- **コスト効率**: 必要最小限のリソースで最大の価値

## System Architecture

### Overall Architecture Pattern

このプロジェクトは**サーバーレスアーキテクチャ**を採用:

```
┌──────────────────────────────────────────────────────────┐
│  Edge (Host macOS + Docker)                              │
│                                                          │
│  ┌────────────┐    ┌────────────┐    ┌──────────────┐  │
│  │ Mac Camera │───→│  ffmpeg    │───→│  MediaMTX    │  │
│  │            │    │(avfoundat.)│RTSP│ (Docker:8554)│  │
│  └────────────┘    └────────────┘    └──────┬───────┘  │
│                                             │ RTSP     │
│  ┌────────────┐                    ┌────────┴───────┐  │
│  │ Greengrass │                    │ frame-capture  │  │
│  │   Core     │                    │ (Docker)       │  │
│  │            │                    │ ffmpeg→JPEG→S3 │  │
│  └──────┬─────┘                    └────────┬───────┘  │
│         │ IoT Core                          │ S3       │
└─────────┼───────────────────────────────────┼──────────┘
          │                                   │
          ↓                                   ↓
┌─────────────────────────────────────────────────────────┐
│           AWS Cloud                                      │
│                                                          │
│  ┌──────────────┐    ┌──────────────────────────┐      │
│  │     S3       │    │ Lambda                    │      │
│  │ live-frames/ │───→│ getLatestFrame            │      │
│  │ latest.jpg   │    │ (presigned URL 生成)       │      │
│  └──────────────┘    └────────────┬─────────────┘      │
│                                   │                      │
│  ┌──────────┐    ┌──────────┐    ↓                     │
│  │ Bedrock  │←───│ Lambda   │  ┌──────────┐            │
│  │ (Claude) │    │ Video    │  │   API    │            │
│  └──────────┘    │Processor │  │ Gateway  │            │
│                  └────┬─────┘  └────┬─────┘            │
│  ┌──────────┐         │             │                    │
│  │Rekognit. │←────────┘             │                    │
│  └──────────┘                       │                    │
│                                     │                    │
│  ┌──────────┐    ┌──────────┐      │                    │
│  │ DynamoDB │←───│    S3    │      │                    │
│  │  Tables  │    │  daily/  │      │                    │
│  └────┬─────┘    └──────────┘      │                    │
│       │                             │                    │
│       ↓                             ↓                    │
│  ┌──────────────────────────────────────┐               │
│  │   CloudFront + S3                     │               │
│  │   Vue.js SPA (LiveVideo.vue)          │               │
│  │   <img :src="presignedUrl">           │               │
│  └──────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────┘
```

### Key Components

1. **Edge Layer**: Host ffmpeg + Docker (MediaMTX, frame-capture, Greengrass)
2. **Live Video Pipeline**: frame-capture → S3 → Lambda (presigned URL) → フロントエンド
3. **Processing Layer**: Lambda（ビジネスロジック）
4. **AI Layer**: Amazon Bedrock / Rekognition（画像分析）
5. **Storage Layer**: DynamoDB + S3（データ永続化）
6. **API Layer**: API Gateway（RESTful API）
7. **Presentation Layer**: CloudFront + S3（Vue.js SPA）

## Layered Architecture

### Layer Responsibilities

```
┌─────────────────────────────────────┐
│     Presentation Layer              │  Vue.js Components
│  (UI Components, State Management)  │  - Dashboard.vue
│                                     │  - EmergencyControl.vue
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│        API Layer                    │  API Gateway + Lambda
│  (Request/Response Handling)        │  - Input validation
│                                     │  - Authentication
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Business Logic Layer           │  Lambda Functions
│  (Domain Logic, Use Cases)          │  - MealSessionService
│                                     │  - TVControlService
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Data Access Layer              │  Repositories
│  (Database Operations)              │  - MealSessionRepository
│                                     │  - SystemConfigRepository
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Infrastructure Layer           │  AWS Services
│  (External Services, Storage)       │  - DynamoDB
│                                     │  - S3, Bedrock
└─────────────────────────────────────┘
```

## Ports and Adapters Pattern (Hexagonal Architecture)

### Pattern Overview

ビジネスロジックを外部依存から分離し、テスタビリティと保守性を向上:

```
        ┌─────────────────────────┐
        │   External Systems      │
        │  (AWS Services, APIs)   │
        └───────────┬─────────────┘
                    │
        ┌───────────▼─────────────┐
        │      Adapters           │  具体的な実装
        │  - DynamoDBAdapter      │  - AWS SDK呼び出し
        │  - S3Adapter            │  - 外部API呼び出し
        │  - BedrockAdapter       │
        └───────────┬─────────────┘
                    │
        ┌───────────▼─────────────┐
        │       Ports             │  インターフェース
        │  - MealRepository       │  - 抽象化された契約
        │  - StorageService       │  - ビジネスロジックが依存
        │  - AIService            │
        └───────────┬─────────────┘
                    │
        ┌───────────▼─────────────┐
        │   Business Logic        │  ドメインロジック
        │  - MealSessionService   │  - 外部依存なし
        │  - TVControlService     │  - テスト容易
        └─────────────────────────┘
```

### Implementation Example

```typescript
// ✅ Good: ポートとアダプターパターン

// Port (Interface)
interface MealRepository {
  getMealSession(id: string): Promise<MealSession>;
  saveMealSession(session: MealSession): Promise<void>;
}

// Business Logic (依存はインターフェースのみ)
class MealSessionService {
  constructor(private repository: MealRepository) {}
  
  async endMealSession(sessionId: string): Promise<void> {
    const session = await this.repository.getMealSession(sessionId);
    session.endTime = new Date().toISOString();
    await this.repository.saveMealSession(session);
  }
}

// Adapter (具体的な実装)
class DynamoDBMealRepository implements MealRepository {
  constructor(private dynamodb: DynamoDBClient) {}
  
  async getMealSession(id: string): Promise<MealSession> {
    const result = await this.dynamodb.send(
      new GetItemCommand({
        TableName: 'MealSessions',
        Key: { sessionId: { S: id } }
      })
    );
    return this.mapToMealSession(result.Item);
  }
  
  async saveMealSession(session: MealSession): Promise<void> {
    await this.dynamodb.send(
      new PutItemCommand({
        TableName: 'MealSessions',
        Item: this.mapToDynamoDBItem(session)
      })
    );
  }
}

// Handler (アダプターを注入)
export const handler = async (event: APIGatewayEvent) => {
  const repository = new DynamoDBMealRepository(dynamodbClient);
  const service = new MealSessionService(repository);
  
  await service.endMealSession(event.pathParameters.id);
  
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Meal session ended' })
  };
};
```

### Benefits

1. **テスタビリティ**: モックリポジトリで簡単にテスト
2. **柔軟性**: DynamoDBからRDSへの移行が容易
3. **保守性**: ビジネスロジックが外部依存から独立
4. **再利用性**: 同じビジネスロジックを異なるアダプターで使用可能

## Event-Driven Architecture

### Event Flow

```
┌──────────┐     Event      ┌──────────┐     Event      ┌──────────┐
│  Camera  │───────────────→│  Lambda  │───────────────→│ DynamoDB │
│  Capture │   Frame Data   │ Processor│  State Change  │  Update  │
└──────────┘                └──────────┘                └──────────┘
                                  │
                                  │ Event
                                  ↓
                            ┌──────────┐
                            │    TV    │
                            │ Control  │
                            └──────────┘
```

### Event Types

1. **Domain Events**: ビジネスロジックの状態変化
   - `MealSessionStarted`
   - `EatingStateChanged`
   - `MealSessionEnded`

2. **Integration Events**: システム間連携
   - `VideoFrameReceived`
   - `TVStatusChanged`

### Event Handling Pattern

```typescript
// ✅ Good: イベント駆動アーキテクチャ

interface DomainEvent {
  eventType: string;
  timestamp: string;
  payload: any;
}

class EventBus {
  private handlers: Map<string, Array<(event: DomainEvent) => Promise<void>>> = new Map();
  
  subscribe(eventType: string, handler: (event: DomainEvent) => Promise<void>) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
  }
  
  async publish(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.eventType) || [];
    await Promise.all(handlers.map(handler => handler(event)));
  }
}

// Usage
const eventBus = new EventBus();

eventBus.subscribe('EatingStateChanged', async (event) => {
  const { isEating } = event.payload;
  if (!isEating) {
    await tvControlService.turnOff();
  }
});

// Publish event
await eventBus.publish({
  eventType: 'EatingStateChanged',
  timestamp: new Date().toISOString(),
  payload: { isEating: false }
});
```

## Data Architecture

### Database Design Principles

1. **Single Table Design**: DynamoDBでは1テーブルに複数のエンティティを格納
2. **Access Pattern First**: クエリパターンを先に設計
3. **Denormalization**: 読み取りパフォーマンスを優先
4. **Composite Keys**: パーティションキー + ソートキーで柔軟なクエリ

### DynamoDB Table Structure

```typescript
// ✅ Good: アクセスパターンに最適化

// MealSessions Table
interface MealSessionItem {
  PK: string;           // "SESSION#<sessionId>"
  SK: string;           // "METADATA"
  userId: string;
  startTime: string;
  endTime: string | null;
  status: 'active' | 'completed';
  GSI1PK: string;       // "USER#<userId>"
  GSI1SK: string;       // "SESSION#<startTime>"
}

// EatingStates Table
interface EatingStateItem {
  PK: string;           // "SESSION#<sessionId>"
  SK: string;           // "STATE#<timestamp>"
  isEating: boolean;
  confidence: number;
  timestamp: string;
}

// Access Patterns:
// 1. Get meal session by ID: Query(PK = "SESSION#123", SK = "METADATA")
// 2. Get user's sessions: Query(GSI1, GSI1PK = "USER#456")
// 3. Get eating states: Query(PK = "SESSION#123", SK begins_with "STATE#")
```

### Data Lifecycle

```typescript
// ✅ Good: TTLで自動削除
const table = new Table(this, 'MealSessions', {
  partitionKey: { name: 'PK', type: AttributeType.STRING },
  sortKey: { name: 'SK', type: AttributeType.STRING },
  timeToLiveAttribute: 'expiresAt'
});

// アイテム作成時にTTLを設定
const expiresAt = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30日後
await dynamodb.putItem({
  TableName: 'MealSessions',
  Item: {
    PK: { S: `SESSION#${sessionId}` },
    SK: { S: 'METADATA' },
    expiresAt: { N: expiresAt.toString() },
    // ... other attributes
  }
});
```

## API Design

### RESTful API Principles

1. **リソース指向**: URLはリソースを表現
2. **HTTPメソッド**: GET, POST, PUT, DELETE を適切に使用
3. **ステートレス**: 各リクエストは独立
4. **統一インターフェース**: 一貫したAPI設計

### API Endpoint Structure

```
GET    /meal-sessions              # セッション一覧取得
POST   /meal-sessions              # セッション作成
GET    /meal-sessions/{id}         # セッション詳細取得
PUT    /meal-sessions/{id}         # セッション更新
DELETE /meal-sessions/{id}         # セッション削除

GET    /meal-sessions/{id}/states  # 食事状態一覧取得
POST   /meal-sessions/{id}/states  # 食事状態追加

GET    /tv-control/status          # TV状態取得
POST   /tv-control/on              # TV ON
POST   /tv-control/off             # TV OFF

GET    /settings                   # 設定取得
PUT    /settings                   # 設定更新
```

### API Response Format

```typescript
// ✅ Good: 一貫したレスポンス形式

// Success Response
{
  "success": true,
  "data": {
    "sessionId": "session-123",
    "userId": "user-456",
    "startTime": "2025-02-07T10:00:00Z"
  }
}

// Error Response
{
  "success": false,
  "error": {
    "code": "MEAL_SESSION_NOT_FOUND",
    "message": "Meal session not found: session-123",
    "details": {}
  }
}

// Pagination Response
{
  "success": true,
  "data": {
    "items": [...],
    "pagination": {
      "nextToken": "eyJsYXN0S2V5Ijp7InNlc3Npb25JZCI6InNlc3Npb24tMTIzIn19",
      "hasMore": true
    }
  }
}
```

## Error Handling Architecture

### Error Hierarchy

```typescript
// ✅ Good: エラー階層を定義

class ApplicationError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
    public details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

class NotFoundError extends ApplicationError {
  constructor(resource: string, id: string) {
    super(
      `${resource} not found: ${id}`,
      'NOT_FOUND',
      404,
      { resource, id }
    );
  }
}

class ValidationError extends ApplicationError {
  constructor(message: string, details: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

class UnauthorizedError extends ApplicationError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
  }
}
```

### Error Handling Pattern

```typescript
// ✅ Good: 統一されたエラーハンドリング

export const handler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  try {
    const result = await processRequest(event);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: result
      })
    };
  } catch (error) {
    logger.error('Request failed', { error });
    
    if (error instanceof ApplicationError) {
      return {
        statusCode: error.statusCode,
        body: JSON.stringify({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details
          }
        })
      };
    }
    
    // Unexpected error
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred'
        }
      })
    };
  }
};
```

## Caching Strategy

### Multi-Layer Caching

```
┌─────────────┐
│   Browser   │  Cache-Control: max-age=3600
└──────┬──────┘
       │
┌──────▼──────┐
│ CloudFront  │  TTL: 1 hour (static assets)
└──────┬──────┘
       │
┌──────▼──────┐
│ API Gateway │  Cache: 5 minutes (API responses)
└──────┬──────┘
       │
┌──────▼──────┐
│   Lambda    │  In-memory cache (session data)
└──────┬──────┘
       │
┌──────▼──────┐
│  DynamoDB   │  DAX (optional, for high throughput)
└─────────────┘
```

### Cache Implementation

```typescript
// ✅ Good: Lambda内メモリキャッシュ

class CachedRepository {
  private cache = new Map<string, { data: any; expiresAt: number }>();
  
  async get(key: string): Promise<any> {
    const cached = this.cache.get(key);
    
    if (cached && cached.expiresAt > Date.now()) {
      logger.debug('Cache hit', { key });
      return cached.data;
    }
    
    logger.debug('Cache miss', { key });
    const data = await this.fetchFromDatabase(key);
    
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + 60000 // 1分
    });
    
    return data;
  }
  
  invalidate(key: string): void {
    this.cache.delete(key);
  }
}
```

## Monitoring and Observability

### Three Pillars of Observability

1. **Logs**: 構造化ログ（Lambda Powertools）
2. **Metrics**: CloudWatch Metrics（カスタムメトリクス）
3. **Traces**: X-Ray（分散トレーシング）

### Monitoring Architecture

```typescript
// ✅ Good: 包括的な監視

// Custom Metrics
const metrics = new MetricUnits();
metrics.addMetric('MealSessionCreated', MetricUnit.Count, 1);
metrics.addMetric('VideoProcessingDuration', MetricUnit.Milliseconds, duration);

// Structured Logging
logger.info('Meal session created', {
  sessionId: session.id,
  userId: session.userId,
  duration: duration
});

// X-Ray Tracing
const segment = AWSXRay.getSegment();
const subsegment = segment.addNewSubsegment('ProcessVideoFrame');
try {
  await processFrame(frame);
  subsegment.close();
} catch (error) {
  subsegment.addError(error);
  subsegment.close();
  throw error;
}
```

## Scalability Patterns

### Horizontal Scaling

- **Lambda**: 自動スケーリング（同時実行数制限を設定）
- **DynamoDB**: オンデマンドキャパシティまたはオートスケーリング
- **API Gateway**: 自動スケーリング（レート制限を設定）

### Asynchronous Processing

```typescript
// ✅ Good: 非同期処理でスケーラビリティ向上

// 重い処理はSQSキューに送信
await sqs.sendMessage({
  QueueUrl: videoProcessingQueueUrl,
  MessageBody: JSON.stringify({
    sessionId: session.id,
    frameUrl: frameUrl
  })
});

// 別のLambdaが非同期に処理
export const videoProcessorHandler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    const { sessionId, frameUrl } = JSON.parse(record.body);
    await processVideoFrame(sessionId, frameUrl);
  }
};
```

## Deployment Architecture

### Infrastructure as Code

```typescript
// ✅ Good: CDKで全リソースを定義

export class NoEatToStopStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    
    // Storage Layer
    const videoBucket = new Bucket(this, 'VideoBucket', {
      encryption: BucketEncryption.S3_MANAGED,
      lifecycleRules: [{ expiration: Duration.days(1) }]
    });
    
    // Database Layer
    const mealSessionsTable = new Table(this, 'MealSessions', {
      partitionKey: { name: 'PK', type: AttributeType.STRING },
      sortKey: { name: 'SK', type: AttributeType.STRING }
    });
    
    // Processing Layer
    const videoProcessor = new Function(this, 'VideoProcessor', {
      runtime: Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: Code.fromAsset('lambda/video-processor'),
      environment: {
        TABLE_NAME: mealSessionsTable.tableName,
        BUCKET_NAME: videoBucket.bucketName
      }
    });
    
    // Permissions
    mealSessionsTable.grantReadWriteData(videoProcessor);
    videoBucket.grantReadWrite(videoProcessor);
  }
}
```

### Multi-Stage Deployment

```bash
# Development
cdk deploy --context stage=dev

# Staging
cdk deploy --context stage=staging

# Production
cdk deploy --context stage=prod
```

## Architecture Decision Records (ADR)

### When to Create ADR

重要なアーキテクチャ決定を行った場合は、`design/adr/`にADRを作成:

```markdown
# ADR-001: Use DynamoDB for Data Storage

## Status
Accepted

## Context
食事セッションデータと食事状態データを保存するデータベースが必要。
要件:
- 高速な読み書き
- スケーラビリティ
- サーバーレスアーキテクチャとの統合

## Decision
Amazon DynamoDBを使用する。

## Consequences
### Positive
- 自動スケーリング
- 低レイテンシ
- サーバーレスアーキテクチャとの親和性

### Negative
- 複雑なクエリが困難
- リレーショナルデータモデルが使えない
- アクセスパターンを事前に設計する必要がある
```

## Anti-Patterns to Avoid

### 避けるべきパターン

1. **God Object**: 全ての責務を持つ巨大なクラス
2. **Tight Coupling**: コンポーネント間の強い依存
3. **Premature Optimization**: 必要のない最適化
4. **Magic Numbers**: 意味不明な定数
5. **Callback Hell**: 深くネストしたコールバック

```typescript
// ❌ Bad: God Object
class MealSessionManager {
  createSession() { /* ... */ }
  endSession() { /* ... */ }
  processVideo() { /* ... */ }
  controlTV() { /* ... */ }
  sendNotification() { /* ... */ }
  generateReport() { /* ... */ }
  // ... 100+ methods
}

// ✅ Good: Single Responsibility
class MealSessionService {
  createSession() { /* ... */ }
  endSession() { /* ... */ }
}

class VideoProcessingService {
  processVideo() { /* ... */ }
}

class TVControlService {
  turnOn() { /* ... */ }
  turnOff() { /* ... */ }
}
```
