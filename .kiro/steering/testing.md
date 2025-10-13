# Testing Standards and Strategy

## Testing Philosophy

### Core Principles

1. **テストは仕様書**: テストコードは実装の意図を明確に表現する
2. **高速なフィードバック**: ユニットテストは1秒以内、統合テストは10秒以内を目標
3. **信頼性**: テストは決定的で、環境に依存せず、常に同じ結果を返す
4. **保守性**: テストコードも本番コードと同じ品質基準を適用

### Testing Pyramid

```
        /\
       /E2E\      <- 少数（重要なユーザーフロー）
      /------\
     /  統合  \    <- 中程度（サービス間連携）
    /----------\
   / ユニット  \  <- 多数（ビジネスロジック）
  /--------------\
```

- **ユニットテスト**: 70-80%（高速、詳細、外部依存なし）
- **統合テスト**: 15-25%（サービス連携、AWS SDK呼び出し）
- **E2Eテスト**: 5-10%（重要なユーザーフロー）

## Test Categories

### 1. Unit Tests (`test:unit`)

**目的**: ビジネスロジックの振る舞いを検証

**特徴**:
- 外部依存は全てモック
- 高速実行（全体で数秒）
- 決定的な結果

**実行コマンド**:
```bash
npm run test:unit
# または
turbo run test:unit
```

**配置場所**:
```
src/
├── services/
│   ├── meal-service.ts
│   └── __tests__/
│       └── meal-service.test.ts
```

**例**:
```typescript
// ✅ Good: 外部依存をモック
describe('MealService', () => {
  it('should calculate meal duration correctly', () => {
    const mockRepo = {
      getMealSession: jest.fn().mockResolvedValue({
        startTime: '2025-02-07T10:00:00Z',
        endTime: '2025-02-07T10:30:00Z'
      })
    };
    
    const service = new MealService(mockRepo);
    const duration = await service.calculateDuration('session-123');
    
    expect(duration).toBe(1800); // 30分 = 1800秒
  });
});
```

### 2. Integration Tests (`test:integ`)

**目的**: AWS SDK呼び出しやサービス間連携を検証

**特徴**:
- 実際のAWSサービスを使用（Bedrock、S3など）
- ステートレスな操作のみ
- 認証情報が必要

**実行コマンド**:
```bash
source .env.credentials && npm run test:integ
# または
source .env.credentials && turbo run test:integ
```

**Colima 環境での実行**:
```bash
# Colima が起動していることを確認
colima status

# Greengrass コンテナ内でテストを実行する場合
docker exec -it gg-dev-core bash
cd /workspace
source .env.credentials && npm run test:integ
```

**配置場所**:
```
src/
├── services/
│   └── __tests__/
│       └── integration/
│           └── bedrock-integration.test.ts
```

**例**:
```typescript
// ✅ Good: 実際のBedrockを呼び出し
describe('BedrockService Integration', () => {
  it('should analyze image with Claude', async () => {
    const service = new BedrockService();
    const result = await service.analyzeImage(testImageBuffer);
    
    expect(result.isEating).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
  });
});
```

### 3. E2E Tests (`test:e2e`)

**目的**: エンドツーエンドのユーザーフローを検証

**特徴**:
- データベースを含む全スタックを使用
- ステートフルな操作
- 実行時間が長い

**実行コマンド**:
```bash
# ローカルDBが必要
# Colima を使用する場合
colima start
docker compose up -d

source .env.credentials && npm run test:e2e
```

**Colima 環境での実行**:
```bash
# 1. Colima が起動していることを確認
colima status

# 2. 必要なサービスを起動（DynamoDB Local など）
docker compose up -d

# 3. フロントエンドの E2E テスト
cd frontend
npm run test:e2e:headless

# 4. サービスを停止
docker compose down
```

**配置場所**:
```
frontend/tests/e2e/
├── dashboard.spec.js
├── emergency.spec.js
└── settings.spec.js
```

**例**:
```javascript
// ✅ Good: 実際のユーザー操作をシミュレート
import { test, expect } from '@playwright/test';

test.describe('Dashboard E2E', () => {
  test('should display meal session data', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('meal-session-list')).toBeVisible();
    await expect(page.getByTestId('meal-session-item')).toHaveCount(1);
  });
});
```

## Test Naming Conventions

### ファイル命名

- **ユニットテスト**: `<module-name>.test.ts`
- **統合テスト**: `<module-name>-integration.test.ts`
- **E2Eテスト**: `<feature-name>.spec.js` (Playwright)

### テストケース命名

```typescript
// ✅ Good: 明確で読みやすい
describe('MealSessionRepository', () => {
  describe('createSession', () => {
    it('should create a new meal session with valid data', async () => {
      // ...
    });
    
    it('should throw error when userId is missing', async () => {
      // ...
    });
  });
});

// ❌ Bad: 曖昧で意図が不明
describe('MealSessionRepository', () => {
  it('test1', () => {
    // ...
  });
  
  it('works', () => {
    // ...
  });
});
```

### 命名パターン

- `should <expected behavior> when <condition>`
- `should throw <error> when <invalid condition>`
- `should return <result> for <input>`

## Test Structure (AAA Pattern)

### Arrange-Act-Assert

```typescript
it('should calculate total eating time correctly', async () => {
  // Arrange: テストデータとモックを準備
  const mockStates = [
    { state: 'eating', duration: 300 },
    { state: 'not_eating', duration: 60 },
    { state: 'eating', duration: 240 }
  ];
  const repository = createMockRepository(mockStates);
  const service = new AnalyticsService(repository);
  
  // Act: テスト対象の関数を実行
  const totalTime = await service.calculateTotalEatingTime('session-123');
  
  // Assert: 期待する結果を検証
  expect(totalTime).toBe(540); // 300 + 240 = 540秒
});
```

## Mocking Guidelines

### モックの原則

1. **外部依存のみモック**: ビジネスロジックはモックしない
2. **インターフェースでモック**: 具象クラスではなくインターフェースに依存
3. **最小限のモック**: 必要な部分だけモック

### TypeScript Mocking

```typescript
// ✅ Good: インターフェースベースのモック
interface MealRepository {
  getMealSession(id: string): Promise<MealSession>;
}

const mockRepository: MealRepository = {
  getMealSession: jest.fn().mockResolvedValue({
    id: 'session-123',
    userId: 'user-456',
    startTime: new Date()
  })
};

// ❌ Bad: 具象クラスの過度なモック
const mockRepository = new MealRepository();
jest.spyOn(mockRepository, 'getMealSession').mockResolvedValue(...);
jest.spyOn(mockRepository, 'updateSession').mockResolvedValue(...);
// ... 多数のメソッドをモック
```

### AWS SDK Mocking

```typescript
// ✅ Good: aws-sdk-client-mockを使用
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
});

it('should retrieve item from DynamoDB', async () => {
  ddbMock.on(GetCommand).resolves({
    Item: { id: '123', name: 'Test' }
  });
  
  const result = await repository.getItem('123');
  expect(result.name).toBe('Test');
});
```

## Test Data Management

### テストデータの原則

1. **自己完結**: 各テストは独立したデータを使用
2. **明示的**: マジックナンバーを避け、意図を明確に
3. **最小限**: テストに必要な最小限のデータのみ

### Factory Pattern

```typescript
// ✅ Good: ファクトリー関数でテストデータを生成
function createTestMealSession(overrides?: Partial<MealSession>): MealSession {
  return {
    id: 'test-session-123',
    userId: 'test-user-456',
    startTime: new Date('2025-02-07T10:00:00Z'),
    endTime: null,
    status: 'active',
    ...overrides
  };
}

it('should end active meal session', async () => {
  const session = createTestMealSession({ status: 'active' });
  // ...
});

it('should not end completed meal session', async () => {
  const session = createTestMealSession({ 
    status: 'completed',
    endTime: new Date('2025-02-07T10:30:00Z')
  });
  // ...
});
```

## Assertion Best Practices

### 明確なアサーション

```typescript
// ✅ Good: 具体的で明確
expect(result.status).toBe('completed');
expect(result.duration).toBeGreaterThan(0);
expect(result.eatingStates).toHaveLength(5);

// ❌ Bad: 曖昧で意図が不明
expect(result).toBeTruthy();
expect(result.status).not.toBe('active');
```

### エラーケースのテスト

```typescript
// ✅ Good: エラーメッセージも検証
await expect(service.getMealSession('invalid-id'))
  .rejects
  .toThrow('Meal session not found: invalid-id');

// ❌ Bad: エラーが投げられることだけ確認
await expect(service.getMealSession('invalid-id'))
  .rejects
  .toThrow();
```

## Test Coverage Guidelines

### カバレッジ目標

- **全体**: 80%以上
- **ビジネスロジック**: 90%以上
- **ユーティリティ関数**: 100%
- **UIコンポーネント**: 70%以上

### カバレッジ確認

```bash
npm run test:coverage
```

### カバレッジの注意点

1. **100%を目指さない**: カバレッジは手段であり目的ではない
2. **重要な部分を優先**: ビジネスロジックとエラーハンドリング
3. **テストの質を重視**: カバレッジが高くても意味のないテストは価値がない

## Flaky Tests Prevention

### 決定的なテストを書く

```typescript
// ✅ Good: 固定された時刻を使用
jest.useFakeTimers();
jest.setSystemTime(new Date('2025-02-07T10:00:00Z'));

const result = service.getCurrentTimestamp();
expect(result).toBe('2025-02-07T10:00:00Z');

// ❌ Bad: 実際の時刻に依存
const result = service.getCurrentTimestamp();
expect(result).toMatch(/2025-02-07/); // 日付が変わると失敗
```

### 非同期処理の適切な待機

```typescript
// ✅ Good: async/awaitで明示的に待機
it('should process video frame', async () => {
  const result = await videoProcessor.processFrame(frame);
  expect(result.isEating).toBe(true);
});

// ❌ Bad: setTimeoutで固定時間待機
it('should process video frame', (done) => {
  videoProcessor.processFrame(frame);
  setTimeout(() => {
    expect(result.isEating).toBe(true);
    done();
  }, 1000); // 環境によって不安定
});
```

## Test Execution Strategy

### ローカル開発時

```bash
# 変更したファイルのテストのみ実行（高速）
npm run test:unit -- --watch

# 全テスト実行（コミット前）
npm run test:unit
```

### Colima 環境でのテスト

```bash
# 1. Colima を起動
colima start --cpu 4 --memory 8

# 2. Greengrass コンテナを起動
docker run -d --name gg-dev-core \
  -v $(pwd):/workspace \
  amazon/aws-iot-greengrass:latest

# 3. コンテナ内でテストを実行
docker exec -it gg-dev-core bash
cd /workspace
npm run test:unit

# 4. 統合テスト（AWS 認証情報が必要）
source .env.credentials && npm run test:integ
```

### CI/CD環境

```bash
# 全カテゴリのテストを順次実行
npm run test:unit
source .env.credentials && npm run test:integ
source .env.credentials && npm run test:e2e
```

### Turboキャッシュの活用

```bash
# 変更がない場合はキャッシュから結果を取得
turbo run test:unit test:integ
```

## Testing Anti-Patterns

### 避けるべきパターン

1. **テストの相互依存**: テストAの結果がテストBに影響
2. **過度なモック**: ビジネスロジックまでモック
3. **実装の詳細をテスト**: 内部実装ではなく振る舞いをテスト
4. **巨大なテスト**: 1つのテストで複数のケースを検証
5. **不明確なテスト名**: 何をテストしているか分からない

```typescript
// ❌ Bad: 実装の詳細をテスト
it('should call repository.save exactly once', async () => {
  await service.createMealSession(data);
  expect(mockRepository.save).toHaveBeenCalledTimes(1);
});

// ✅ Good: 振る舞いをテスト
it('should create meal session with correct data', async () => {
  const session = await service.createMealSession(data);
  expect(session.userId).toBe(data.userId);
  expect(session.status).toBe('active');
});
```

## UI Component Testing

### Vue Component Testing

```typescript
// ✅ Good: ユーザーの視点でテスト
import { mount } from '@vue/test-utils';
import Dashboard from '@/components/Dashboard.vue';

describe('Dashboard', () => {
  it('should display meal session list', async () => {
    const wrapper = mount(Dashboard, {
      props: {
        sessions: [
          { id: '1', startTime: '2025-02-07T10:00:00Z' }
        ]
      }
    });
    
    expect(wrapper.find('[data-testid="meal-session-list"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="meal-session-item"]')).toHaveLength(1);
  });
});
```

### Playwright E2E Testing

```javascript
// ✅ Good: 実際のユーザー操作をシミュレート
import { test, expect } from '@playwright/test';

test.describe('Emergency Control', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/emergency');
  });
  
  test('should turn off TV when emergency button is clicked', async ({ page }) => {
    await page.getByTestId('emergency-off-button').click();
    await expect(page.getByTestId('tv-status')).toContainText('OFF');
    await expect(page.getByTestId('success-message')).toBeVisible();
  });
});
```

## Performance Testing

### Lambda実行時間の検証

```typescript
it('should process frame within 3 seconds', async () => {
  const startTime = Date.now();
  await videoProcessor.processFrame(frame);
  const duration = Date.now() - startTime;
  
  expect(duration).toBeLessThan(3000);
});
```

### メモリ使用量の監視

```typescript
it('should not leak memory during batch processing', async () => {
  const initialMemory = process.memoryUsage().heapUsed;
  
  for (let i = 0; i < 100; i++) {
    await processor.processFrame(frames[i]);
  }
  
  global.gc(); // --expose-gc フラグが必要
  const finalMemory = process.memoryUsage().heapUsed;
  const memoryIncrease = finalMemory - initialMemory;
  
  expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 50MB以下
});
```

## Test Documentation

### テストにコメントを追加する場合

- **なぜ**このテストが必要かを説明
- **何を**テストしているかはコードから明らか
- エッジケースや特殊な条件を明記

```typescript
it('should handle concurrent meal session updates', async () => {
  // 複数のLambda関数が同時に同じセッションを更新する可能性があるため、
  // 楽観的ロックを使用して整合性を保証する必要がある
  const updates = [
    service.updateSession('session-123', { status: 'paused' }),
    service.updateSession('session-123', { status: 'active' })
  ];
  
  await expect(Promise.all(updates)).rejects.toThrow('ConditionalCheckFailedException');
});
```
