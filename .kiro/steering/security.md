# Security Standards and Best Practices

## Security Philosophy

### Core Principles

1. **Defense in Depth**: 多層防御で単一障害点を排除
2. **Least Privilege**: 必要最小限の権限のみ付与
3. **Zero Trust**: 全てのリクエストを検証、信頼しない
4. **Security by Design**: セキュリティを後付けではなく設計段階から組み込む
5. **Fail Secure**: エラー時は安全側に倒す

## Credential Management

### 絶対に守るべきルール

1. **認証情報をコードに含めない**
2. **認証情報をGitにコミットしない**
3. **認証情報をログに出力しない**
4. **認証情報を平文で保存しない**

### 環境変数の管理

```bash
# ✅ Good: .env.localで管理（.gitignoreに含める）
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=ap-northeast-1

# ❌ Bad: コードに直接記述
const accessKey = 'AKIAIOSFODNN7EXAMPLE';
```

### .env ファイルの分類

```
.env.example          # テンプレート（Gitにコミット可）
.env.local            # ローカル開発用（Gitにコミット禁止）
.env.credentials      # AWS認証情報（Gitにコミット禁止）
.env.production       # 本番環境用（Gitにコミット禁止）
```

### AWS認証情報の取り扱い

```typescript
// ✅ Good: AWS SDKのデフォルト認証チェーンを使用
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION
});

// ❌ Bad: 認証情報をコードに埋め込み
const client = new DynamoDBClient({
  region: 'ap-northeast-1',
  credentials: {
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
  }
});
```

## IAM Permissions (Least Privilege)

### Lambda実行ロールの原則

```typescript
// ✅ Good: 必要最小限の権限
new PolicyStatement({
  effect: Effect.ALLOW,
  actions: [
    'dynamodb:GetItem',
    'dynamodb:PutItem'
  ],
  resources: [
    `arn:aws:dynamodb:${region}:${account}:table/MealSessions-${stage}`
  ]
});

// ❌ Bad: 過剰な権限
new PolicyStatement({
  effect: Effect.ALLOW,
  actions: ['dynamodb:*'],
  resources: ['*']
});
```

### リソース固有の権限

```typescript
// ✅ Good: 特定のリソースのみアクセス許可
const videoProcessorRole = new Role(this, 'VideoProcessorRole', {
  assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
  inlinePolicies: {
    'KVSAccess': new PolicyDocument({
      statements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [
            'kinesisvideo:GetDataEndpoint',
            'kinesisvideo:GetMedia'
          ],
          resources: [
            videoStream.streamArn
          ]
        })
      ]
    })
  }
});

// ❌ Bad: 全リソースへのアクセス許可
new PolicyStatement({
  effect: Effect.ALLOW,
  actions: ['kinesisvideo:*'],
  resources: ['*']
});
```

### クロスアカウントアクセスの制限

```typescript
// ✅ Good: 特定のアカウントのみ許可
bucket.addToResourcePolicy(new PolicyStatement({
  effect: Effect.ALLOW,
  principals: [new AccountPrincipal('123456789012')],
  actions: ['s3:GetObject'],
  resources: [`${bucket.bucketArn}/*`]
}));
```

## Input Validation

### 全ての入力を検証

```typescript
// ✅ Good: 入力バリデーション
interface CreateMealSessionRequest {
  userId: string;
  startTime: string;
}

function validateCreateMealSessionRequest(input: any): CreateMealSessionRequest {
  if (!input.userId || typeof input.userId !== 'string') {
    throw new Error('Invalid userId');
  }
  
  if (!input.startTime || !isValidISO8601(input.startTime)) {
    throw new Error('Invalid startTime format');
  }
  
  // XSS対策: HTMLエスケープ
  const sanitizedUserId = escapeHtml(input.userId);
  
  return {
    userId: sanitizedUserId,
    startTime: input.startTime
  };
}

// ❌ Bad: 入力をそのまま使用
function createMealSession(input: any) {
  return dynamodb.putItem({
    TableName: 'MealSessions',
    Item: {
      userId: input.userId, // 検証なし
      startTime: input.startTime
    }
  });
}
```

### SQLインジェクション対策（該当する場合）

```typescript
// ✅ Good: パラメータ化クエリ
const result = await db.query(
  'SELECT * FROM users WHERE id = $1',
  [userId]
);

// ❌ Bad: 文字列連結
const result = await db.query(
  `SELECT * FROM users WHERE id = '${userId}'`
);
```

### NoSQLインジェクション対策

```typescript
// ✅ Good: 型チェックと検証
function getMealSession(sessionId: string) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new Error('Invalid sessionId');
  }
  
  return dynamodb.getItem({
    TableName: 'MealSessions',
    Key: { sessionId: { S: sessionId } }
  });
}

// ❌ Bad: オブジェクトをそのまま使用
function getMealSession(key: any) {
  return dynamodb.getItem({
    TableName: 'MealSessions',
    Key: key // 悪意のあるクエリが可能
  });
}
```

## API Security

### API Gateway認証（Cognito Authorizer）

本システムは Amazon Cognito User Pool + CognitoUserPoolsAuthorizer で全 API を保護している。

```typescript
// ✅ 実装済み: Cognito User Pool + PKCE Authorization Code Flow
const userPool = new cognito.UserPool(this, 'UserPool', {
  selfSignUpEnabled: false,  // 管理者招待のみ
  signInAliases: { email: true },
});

const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
  cognitoUserPools: [userPool],
  identitySource: 'method.request.header.Authorization',
});

// 全 API メソッドに Cognito Authorizer を適用
resource.addMethod('GET', integration, {
  authorizationType: apigateway.AuthorizationType.COGNITO,
  authorizer: cognitoAuthorizer,
});

// ❌ Bad: 認証なし
api.root.addMethod('GET', integration, {
  authorizationType: AuthorizationType.NONE
});
```

### フロントエンド認証実装

- **PKCE フロー**: `crypto.getRandomValues` + `crypto.subtle.digest` による手動実装（外部ライブラリ不使用）
- **トークン保存**: access_token / refresh_token → `localStorage`、code_verifier → `sessionStorage`
- **自動リフレッシュ**: axios response interceptor で 401 検出 → refresh_token でトークン更新 → リトライ
- **認証ガード**: Vue Router `beforeEach` で未認証ユーザーを Cognito ログイン画面にリダイレクト

### CORS設定

```typescript
// ✅ Good: 特定のオリジンのみ許可
defaultCorsPreflightOptions: {
  allowOrigins: [
    'https://app.example.com',
    'https://staging.example.com'
  ],
  allowMethods: ['GET', 'POST'],
  allowHeaders: ['Content-Type', 'Authorization'],
  allowCredentials: true
}

// ❌ Bad: 全てのオリジンを許可
defaultCorsPreflightOptions: {
  allowOrigins: ['*'],
  allowMethods: ['*'],
  allowHeaders: ['*']
}
```

### Rate Limiting

```typescript
// ✅ Good: レート制限を設定
const api = new RestApi(this, 'Api', {
  deployOptions: {
    throttlingRateLimit: 100,
    throttlingBurstLimit: 200
  }
});
```

## Data Protection

### データの暗号化

```typescript
// ✅ Good: S3バケットの暗号化
const videoBucket = new Bucket(this, 'VideoBucket', {
  encryption: BucketEncryption.S3_MANAGED,
  enforceSSL: true,
  blockPublicAccess: BlockPublicAccess.BLOCK_ALL
});

// ✅ Good: DynamoDBテーブルの暗号化
const table = new Table(this, 'MealSessions', {
  partitionKey: { name: 'sessionId', type: AttributeType.STRING },
  encryption: TableEncryption.AWS_MANAGED
});

// ❌ Bad: 暗号化なし
const bucket = new Bucket(this, 'VideoBucket', {
  encryption: BucketEncryption.UNENCRYPTED
});
```

### 転送中のデータ保護

```typescript
// ✅ Good: HTTPS強制
const distribution = new CloudFrontWebDistribution(this, 'Distribution', {
  viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
  originConfigs: [{
    s3OriginSource: {
      s3BucketSource: webAppBucket
    },
    behaviors: [{
      isDefaultBehavior: true,
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS
    }]
  }]
});

// ❌ Bad: HTTPを許可
viewerProtocolPolicy: ViewerProtocolPolicy.ALLOW_ALL
```

### 個人情報（PII）の取り扱い

```typescript
// ✅ Good: PIIをログに出力しない
logger.info('Processing meal session', {
  sessionId: session.id,
  // userIdは含めない
});

// ❌ Bad: PIIをログに出力
logger.info('Processing meal session', {
  sessionId: session.id,
  userId: session.userId,
  userName: session.userName,
  email: session.email
});
```

### データの最小化

```typescript
// ✅ Good: 必要なデータのみ保存
interface MealSession {
  sessionId: string;
  userId: string; // ハッシュ化されたID
  startTime: string;
  endTime: string | null;
  duration: number;
}

// ❌ Bad: 不要なデータを保存
interface MealSession {
  sessionId: string;
  userId: string;
  userName: string; // 不要
  email: string; // 不要
  phoneNumber: string; // 不要
  address: string; // 不要
  startTime: string;
  endTime: string | null;
}
```

## Logging and Monitoring

### セキュアなログ出力

```typescript
// ✅ Good: 構造化ログ、機密情報を除外
import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger({ serviceName: 'meal-service' });

logger.info('Meal session created', {
  sessionId: session.id,
  timestamp: new Date().toISOString()
  // 認証情報、PII、トークンは含めない
});

// ❌ Bad: 機密情報をログに出力
console.log('Request:', JSON.stringify(event)); // トークンやAPIキーが含まれる可能性
```

### セキュリティイベントの監視

```typescript
// ✅ Good: 異常なアクセスパターンを検出
const alarm = new Alarm(this, 'UnauthorizedAccessAlarm', {
  metric: api.metricClientError({
    statistic: 'Sum',
    period: Duration.minutes(5)
  }),
  threshold: 10,
  evaluationPeriods: 2,
  alarmDescription: 'High number of 4xx errors detected'
});

alarm.addAlarmAction(new SnsAction(securityTopic));
```

### CloudTrail有効化

```typescript
// ✅ Good: 全てのAPI呼び出しを記録
const trail = new Trail(this, 'CloudTrail', {
  isMultiRegionTrail: true,
  includeGlobalServiceEvents: true,
  managementEvents: ReadWriteType.ALL
});
```

## Dependency Management

### 依存関係の脆弱性スキャン

```bash
# 定期的に実行
npm audit
npm audit fix

# CI/CDで自動実行
npm audit --audit-level=high
```

### 依存関係の最小化

```typescript
// ✅ Good: 必要なモジュールのみインポート
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';

// ❌ Bad: 不要なモジュールを含む
import * as AWS from 'aws-sdk'; // SDK v2全体をインポート
```

### ロックファイルの管理

```bash
# ✅ Good: ロックファイルをコミット
git add package-lock.json
git commit -m "chore: update dependencies"

# ❌ Bad: ロックファイルを無視
echo "package-lock.json" >> .gitignore
```

## Lambda Security

### 環境変数の暗号化

```typescript
// ✅ Good: KMSで環境変数を暗号化
const kmsKey = new Key(this, 'LambdaEnvKey', {
  enableKeyRotation: true
});

const lambda = new Function(this, 'VideoProcessor', {
  runtime: Runtime.NODEJS_18_X,
  handler: 'index.handler',
  code: Code.fromAsset('lambda'),
  environment: {
    TABLE_NAME: table.tableName,
    API_KEY: 'encrypted-value'
  },
  environmentEncryption: kmsKey
});
```

### VPC設定（必要な場合）

```typescript
// ✅ Good: プライベートサブネットに配置
const lambda = new Function(this, 'DatabaseProcessor', {
  runtime: Runtime.NODEJS_18_X,
  handler: 'index.handler',
  code: Code.fromAsset('lambda'),
  vpc: vpc,
  vpcSubnets: {
    subnetType: SubnetType.PRIVATE_WITH_EGRESS
  },
  securityGroups: [lambdaSecurityGroup]
});
```

### Lambda実行タイムアウト

```typescript
// ✅ Good: 適切なタイムアウト設定
const lambda = new Function(this, 'VideoProcessor', {
  runtime: Runtime.NODEJS_18_X,
  handler: 'index.handler',
  code: Code.fromAsset('lambda'),
  timeout: Duration.seconds(30), // 必要最小限
  memorySize: 512
});

// ❌ Bad: 過度に長いタイムアウト
timeout: Duration.minutes(15) // リソースの無駄遣い
```

## Frontend Security

### XSS対策

```vue
<!-- ✅ Good: Vueの自動エスケープを使用 -->
<template>
  <div>{{ userInput }}</div>
</template>

<!-- ❌ Bad: v-htmlで生のHTMLを挿入 -->
<template>
  <div v-html="userInput"></div>
</template>
```

### CSRF対策

```typescript
// ✅ Good: CSRFトークンを検証
const api = new RestApi(this, 'Api', {
  defaultCorsPreflightOptions: {
    allowOrigins: ['https://app.example.com'],
    allowCredentials: true
  }
});

// リクエストヘッダーにCSRFトークンを含める
axios.post('/api/meal-sessions', data, {
  headers: {
    'X-CSRF-Token': csrfToken
  }
});
```

### Content Security Policy

```typescript
// ✅ Good: CloudFrontでCSPヘッダーを設定
const responseHeadersPolicy = new ResponseHeadersPolicy(this, 'SecurityHeaders', {
  securityHeadersBehavior: {
    contentSecurityPolicy: {
      contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';",
      override: true
    },
    strictTransportSecurity: {
      accessControlMaxAge: Duration.days(365),
      includeSubdomains: true,
      override: true
    },
    xContentTypeOptions: {
      override: true
    },
    xFrameOptions: {
      frameOption: HeadersFrameOption.DENY,
      override: true
    }
  }
});
```

## Secrets Management

### AWS Secrets Managerの使用

```typescript
// ✅ Good: Secrets Managerで機密情報を管理
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

async function getApiKey(): Promise<string> {
  const client = new SecretsManagerClient({ region: 'ap-northeast-1' });
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: 'api-key' })
  );
  return response.SecretString!;
}

// ❌ Bad: 環境変数に平文で保存
const apiKey = process.env.API_KEY;
```

### シークレットのローテーション

```typescript
// ✅ Good: 自動ローテーションを設定
const secret = new Secret(this, 'DatabasePassword', {
  generateSecretString: {
    secretStringTemplate: JSON.stringify({ username: 'admin' }),
    generateStringKey: 'password',
    excludePunctuation: true
  }
});

secret.addRotationSchedule('RotationSchedule', {
  automaticallyAfter: Duration.days(30)
});
```

## Incident Response

### セキュリティインシデント対応手順

1. **検知**: CloudWatch Alarms、GuardDuty、Security Hub
2. **隔離**: 影響を受けたリソースを隔離
3. **調査**: CloudTrail、アクセスログを分析
4. **対応**: 脆弱性を修正、パッチ適用
5. **復旧**: サービスを復旧
6. **事後分析**: インシデントレポート作成、再発防止策

### セキュリティ連絡先

```typescript
// プロジェクトのREADMEまたはドキュメントに記載
// セキュリティ問題の報告先: security@example.com
// 緊急連絡先: +81-XX-XXXX-XXXX
```

## Compliance

### データ保持ポリシー

```typescript
// ✅ Good: ライフサイクルポリシーで自動削除
const videoBucket = new Bucket(this, 'VideoBucket', {
  lifecycleRules: [
    {
      id: 'DeleteOldVideos',
      expiration: Duration.days(1),
      enabled: true
    }
  ]
});
```

### アクセスログの保存

```typescript
// ✅ Good: アクセスログを別バケットに保存
const logBucket = new Bucket(this, 'LogBucket', {
  encryption: BucketEncryption.S3_MANAGED,
  blockPublicAccess: BlockPublicAccess.BLOCK_ALL
});

const videoBucket = new Bucket(this, 'VideoBucket', {
  serverAccessLogsBucket: logBucket,
  serverAccessLogsPrefix: 'video-access-logs/'
});
```

## Security Checklist

### デプロイ前の確認事項

- [ ] 認証情報がコードに含まれていない
- [ ] IAMロールが最小権限になっている
- [ ] 全てのS3バケットが暗号化されている
- [ ] 全てのDynamoDBテーブルが暗号化されている
- [ ] API Gatewayに認証が設定されている
- [ ] CORS設定が適切に制限されている
- [ ] CloudFrontでHTTPSが強制されている
- [ ] ログに機密情報が含まれていない
- [ ] 依存関係の脆弱性スキャンが完了している
- [ ] セキュリティアラームが設定されている

### 定期的なセキュリティレビュー

- **毎週**: 依存関係の脆弱性スキャン
- **毎月**: IAMポリシーのレビュー
- **四半期**: セキュリティ監査
- **年次**: ペネトレーションテスト
