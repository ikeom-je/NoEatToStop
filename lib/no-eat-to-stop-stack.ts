import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iot from 'aws-cdk-lib/aws-iot';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface NoEatToStopStackProps extends cdk.StackProps {
  stage: string;
}

export class NoEatToStopStack extends cdk.Stack {
  public readonly videoBucket: s3.Bucket;
  public readonly webAppBucket: s3.Bucket;
  public readonly mealSessionsTable: dynamodb.Table;
  public readonly eatingStatesTable: dynamodb.Table;
  public readonly systemSettingsTable: dynamodb.Table;
  public readonly chewingStatesTable: dynamodb.Table;
  public readonly tvControlEventsTable: dynamodb.Table;
  public readonly frameHistoryTable: dynamodb.Table;
  public readonly labelsTable: dynamodb.Table;
  public readonly api: apigateway.RestApi;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: NoEatToStopStackProps) {
    super(scope, id, props);

    const { stage } = props;

    // ========================================
    // S3 Buckets
    // ========================================

    this.videoBucket = new s3.Bucket(this, 'VideoBucket', {
      bucketName: `noeatstop-videos-${stage}-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [
        {
          id: 'DeleteOldVideos',
          prefix: 'daily/',
          expiration: cdk.Duration.days(1),
        },
        {
          id: 'DeleteLiveFrames',
          prefix: 'live-frames/',
          expiration: cdk.Duration.days(1),
        },
        {
          id: 'DeleteFrameHistory',
          prefix: 'frames/',
          expiration: cdk.Duration.days(1),
        },
        {
          id: 'DeleteEvidence',
          prefix: 'evidence/',
          expiration: cdk.Duration.days(1),
        },
      ],
    });

    this.webAppBucket = new s3.Bucket(this, 'WebAppBucket', {
      bucketName: `noeatstop-webapp-${stage}-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // ========================================
    // DynamoDB Tables
    // ========================================

    this.mealSessionsTable = new dynamodb.Table(this, 'MealSessionsTable', {
      tableName: `MealSessions-${stage}`,
      partitionKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
    });

    this.eatingStatesTable = new dynamodb.Table(this, 'EatingStatesTable', {
      tableName: `EatingStates-${stage}`,
      partitionKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    this.systemSettingsTable = new dynamodb.Table(this, 'SystemSettingsTable', {
      tableName: `SystemSettings-${stage}`,
      partitionKey: { name: 'settingKey', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.tvControlEventsTable = new dynamodb.Table(this, 'TVControlEventsTable', {
      tableName: `TVControlEvents-${stage}`,
      partitionKey: { name: 'deviceId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'epochSeconds', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'expiresAt',
    });

    this.frameHistoryTable = new dynamodb.Table(this, 'FrameHistoryTable', {
      tableName: `FrameHistory-${stage}`,
      partitionKey: { name: 'deviceId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'epochMs', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'expiresAt',
    });

    this.labelsTable = new dynamodb.Table(this, 'LabelsTable', {
      tableName: `Labels-${stage}`,
      partitionKey: { name: 'deviceId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'epochMs', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'expiresAt',
    });

    this.chewingStatesTable = new dynamodb.Table(this, 'ChewingStatesTable', {
      tableName: `ChewingStates-${stage}`,
      partitionKey: { name: 'deviceId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'epochSeconds', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'expiresAt',
    });

    // ========================================
    // IAM Roles
    // ========================================

    const edgeDeviceRole = new iam.Role(this, 'EdgeDeviceRole', {
      roleName: `noeatstop-edge-device-${stage}`,
      assumedBy: new iam.ServicePrincipal('credentials.iot.amazonaws.com'),
    });

    edgeDeviceRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'kinesisvideo:PutMedia',
        'kinesisvideo:GetDataEndpoint',
        'kinesisvideo:DescribeStream',
      ],
      resources: ['*'],
    }));

    edgeDeviceRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:GetItem',
        'dynamodb:Query',
      ],
      resources: [
        this.systemSettingsTable.tableArn,
        this.mealSessionsTable.tableArn,
      ],
    }));

    edgeDeviceRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        's3:PutObject',
      ],
      resources: [
        `${this.videoBucket.bucketArn}/daily/*`,
        `${this.videoBucket.bucketArn}/live-frames/*`,
        `${this.videoBucket.bucketArn}/evidence/*`,
        `${this.videoBucket.bucketArn}/frames/*`,
      ],
    }));

    edgeDeviceRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        's3:GetObject',
        's3:DeleteObject',
      ],
      resources: [
        `${this.videoBucket.bucketArn}/commands/*`,
      ],
    }));

    const lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
      roleName: `noeatstop-lambda-${stage}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:PutItem',
        'dynamodb:GetItem',
        'dynamodb:Query',
        'dynamodb:UpdateItem',
        'dynamodb:Scan',
      ],
      resources: [
        this.mealSessionsTable.tableArn,
        this.eatingStatesTable.tableArn,
        this.systemSettingsTable.tableArn,
        this.chewingStatesTable.tableArn,
        this.tvControlEventsTable.tableArn,
        this.frameHistoryTable.tableArn,
        this.labelsTable.tableArn,
      ],
    }));

    lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'iot:Publish',
      ],
      resources: ['*'],
    }));

    lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'kinesisvideo:GetMedia',
        'kinesisvideo:GetDataEndpoint',
        'kinesisvideo:DescribeStream',
      ],
      resources: ['*'],
    }));

    lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'rekognition:DetectLabels',
        'rekognition:DetectFaces',
      ],
      resources: ['*'],
    }));

    lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'bedrock:InvokeModel',
      ],
      resources: ['*'],
    }));

    lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        's3:PutObject',
        's3:GetObject',
      ],
      resources: [
        `${this.videoBucket.bucketArn}/*`,
      ],
    }));

    // ========================================
    // Cognito User Pool
    // ========================================

    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `noeatstop-users-${stage}`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const cognitoDomain = userPool.addDomain('CognitoDomain', {
      cognitoDomain: { domainPrefix: `noeatstop-${stage}` },
    });

    const userPoolClient = userPool.addClient('WebAppClient', {
      userPoolClientName: `noeatstop-webapp-${stage}`,
      generateSecret: false,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: ['https://d2s0dqsd7u77p.cloudfront.net/callback'],
        logoutUrls: ['https://d2s0dqsd7u77p.cloudfront.net/'],
      },
      accessTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    // ========================================
    // API Gateway
    // ========================================

    this.api = new apigateway.RestApi(this, 'NoEatToStopApi', {
      restApiName: `noeatstop-api-${stage}`,
      description: 'NoEatToStop System API',
      deployOptions: {
        stageName: 'prod',
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // Authorizer 拒否時（4XX）にも CORS ヘッダーを返す
    this.api.addGatewayResponse('Default4xx', {
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type,Authorization'",
      },
    });

    // Lambda環境変数
    const lambdaEnv = {
      MEAL_SESSIONS_TABLE: this.mealSessionsTable.tableName,
      EATING_STATES_TABLE: this.eatingStatesTable.tableName,
      SYSTEM_SETTINGS_TABLE: this.systemSettingsTable.tableName,
      VIDEO_BUCKET: this.videoBucket.bucketName,
    };

    // API Lambda 関数
    const apiHandler = new lambda.Function(this, 'ApiHandler', {
      functionName: `noeatstop-api-${stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'dist/lib/lambda/api-handlers.createMealSession',
      code: lambda.Code.fromAsset('.', {
        exclude: ['node_modules', 'cdk.out', 'test', 'frontend', '.git'],
      }),
      role: lambdaExecutionRole,
      environment: lambdaEnv,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    // 各ハンドラ用Lambda
    const createSessionFn = apiHandler;
    const getSessionFn = new lambda.Function(this, 'GetSessionHandler', {
      functionName: `noeatstop-get-session-${stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'dist/lib/lambda/api-handlers.getMealSession',
      code: lambda.Code.fromAsset('.', {
        exclude: ['node_modules', 'cdk.out', 'test', 'frontend', '.git'],
      }),
      role: lambdaExecutionRole,
      environment: lambdaEnv,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    const createStateFn = new lambda.Function(this, 'CreateStateHandler', {
      functionName: `noeatstop-create-state-${stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'dist/lib/lambda/api-handlers.createEatingState',
      code: lambda.Code.fromAsset('.', {
        exclude: ['node_modules', 'cdk.out', 'test', 'frontend', '.git'],
      }),
      role: lambdaExecutionRole,
      environment: lambdaEnv,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    const getStatesFn = new lambda.Function(this, 'GetStatesHandler', {
      functionName: `noeatstop-get-states-${stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'dist/lib/lambda/api-handlers.getEatingStates',
      code: lambda.Code.fromAsset('.', {
        exclude: ['node_modules', 'cdk.out', 'test', 'frontend', '.git'],
      }),
      role: lambdaExecutionRole,
      environment: lambdaEnv,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    const getSettingFn = new lambda.Function(this, 'GetSettingHandler', {
      functionName: `noeatstop-get-setting-${stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'dist/lib/lambda/api-handlers.getSetting',
      code: lambda.Code.fromAsset('.', {
        exclude: ['node_modules', 'cdk.out', 'test', 'frontend', '.git'],
      }),
      role: lambdaExecutionRole,
      environment: lambdaEnv,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    const updateSettingFn = new lambda.Function(this, 'UpdateSettingHandler', {
      functionName: `noeatstop-update-setting-${stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'dist/lib/lambda/api-handlers.updateSetting',
      code: lambda.Code.fromAsset('.', {
        exclude: ['node_modules', 'cdk.out', 'test', 'frontend', '.git'],
      }),
      role: lambdaExecutionRole,
      environment: lambdaEnv,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    const getLatestFrameFn = new lambda.Function(this, 'GetLatestFrameHandler', {
      functionName: `noeatstop-get-latest-frame-${stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'dist/lib/lambda/api-handlers.getLatestFrame',
      code: lambda.Code.fromAsset('.', {
        exclude: ['node_modules', 'cdk.out', 'test', 'frontend', '.git'],
      }),
      role: lambdaExecutionRole,
      environment: lambdaEnv,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
    });

    const getLatestAnalyzedFrameFn = new lambda.Function(this, 'GetLatestAnalyzedFrameHandler', {
      functionName: `noeatstop-get-latest-analyzed-frame-${stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'dist/lib/lambda/api-handlers.getLatestAnalyzedFrame',
      code: lambda.Code.fromAsset('.', {
        exclude: ['node_modules', 'cdk.out', 'test', 'frontend', '.git'],
      }),
      role: lambdaExecutionRole,
      environment: lambdaEnv,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
    });

    // API リソース定義
    const mealSessionResource = this.api.root.addResource('meal-session');
    const mealSessionIdResource = mealSessionResource.addResource('{sessionId}');

    const eatingStateResource = this.api.root.addResource('eating-state');
    const eatingStateSessionResource = eatingStateResource.addResource('{sessionId}');

    const tvControlResource = this.api.root.addResource('tv-control');
    const tvControlSessionResource = tvControlResource.addResource('{sessionId}');
    tvControlSessionResource.addResource('should-control');
    tvControlSessionResource.addResource('history');

    const settingsResource = this.api.root.addResource('settings');
    const settingKeyResource = settingsResource.addResource('{settingKey}');

    // Cognito Authorizer
    const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
      identitySource: 'method.request.header.Authorization',
    });

    const authMethodOptions: apigateway.MethodOptions = {
      authorizationType: apigateway.AuthorizationType.COGNITO,
      authorizer: cognitoAuthorizer,
    };

    // Lambda統合
    mealSessionResource.addMethod('POST', new apigateway.LambdaIntegration(createSessionFn), authMethodOptions);
    mealSessionIdResource.addMethod('GET', new apigateway.LambdaIntegration(getSessionFn), authMethodOptions);

    eatingStateResource.addMethod('POST', new apigateway.LambdaIntegration(createStateFn), authMethodOptions);
    eatingStateSessionResource.addMethod('GET', new apigateway.LambdaIntegration(getStatesFn), authMethodOptions);

    settingKeyResource.addMethod('GET', new apigateway.LambdaIntegration(getSettingFn), authMethodOptions);
    settingKeyResource.addMethod('PUT', new apigateway.LambdaIntegration(updateSettingFn), authMethodOptions);

    const videoResource = this.api.root.addResource('video');
    const latestFrameResource = videoResource.addResource('latest-frame');
    latestFrameResource.addMethod('GET', new apigateway.LambdaIntegration(getLatestFrameFn), authMethodOptions);
    const latestAnalyzedFrameResource = videoResource.addResource('latest-analyzed-frame');
    latestAnalyzedFrameResource.addMethod('GET', new apigateway.LambdaIntegration(getLatestAnalyzedFrameFn), authMethodOptions);

    const getChewingStatesFn = new lambda.Function(this, 'GetChewingStatesHandler', {
      functionName: `noeatstop-get-chewing-states-${stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'dist/lib/lambda/api-handlers.getChewingStates',
      code: lambda.Code.fromAsset('.', {
        exclude: ['node_modules', 'cdk.out', 'test', 'frontend', '.git'],
      }),
      role: lambdaExecutionRole,
      environment: {
        ...lambdaEnv,
        CHEWING_STATES_TABLE: this.chewingStatesTable.tableName,
      },
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
    });

    const chewingStatesResource = this.api.root.addResource('chewing-states');
    chewingStatesResource.addMethod('GET', new apigateway.LambdaIntegration(getChewingStatesFn), authMethodOptions);

    // TV Control Events API
    const getTVControlEventsFn = new lambda.Function(this, 'GetTVControlEventsHandler', {
      functionName: `noeatstop-get-tv-control-events-${stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'dist/lib/lambda/api-handlers.getTVControlEvents',
      code: lambda.Code.fromAsset('.', {
        exclude: ['node_modules', 'cdk.out', 'test', 'frontend', '.git'],
      }),
      role: lambdaExecutionRole,
      environment: {
        ...lambdaEnv,
        TV_CONTROL_EVENTS_TABLE: this.tvControlEventsTable.tableName,
      },
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
    });

    const sendTVCommandFn = new lambda.Function(this, 'SendTVCommandHandler', {
      functionName: `noeatstop-send-tv-command-${stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'dist/lib/lambda/api-handlers.sendTVCommand',
      code: lambda.Code.fromAsset('.', {
        exclude: ['node_modules', 'cdk.out', 'test', 'frontend', '.git'],
      }),
      role: lambdaExecutionRole,
      environment: {
        ...lambdaEnv,
        TV_CONTROL_EVENTS_TABLE: this.tvControlEventsTable.tableName,
      },
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
    });

    // tv-control リソースの再構成（既存の session ベースを events ベースに変更）
    const tvControlEventsResource = tvControlResource.addResource('events');
    tvControlEventsResource.addMethod('GET', new apigateway.LambdaIntegration(getTVControlEventsFn), authMethodOptions);
    const tvControlCommandResource = tvControlResource.addResource('command');
    tvControlCommandResource.addMethod('POST', new apigateway.LambdaIntegration(sendTVCommandFn), authMethodOptions);

    // ========================================
    // S3 Event Notification → Lambda → DynamoDB (Frame History)
    // ========================================

    const frameHistoryEnv = {
      ...lambdaEnv,
      FRAME_HISTORY_TABLE: this.frameHistoryTable.tableName,
    };

    const handleFrameUploadFn = new lambda.Function(this, 'HandleFrameUploadHandler', {
      functionName: `noeatstop-handle-frame-upload-${stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'dist/lib/lambda/api-handlers.handleFrameUpload',
      code: lambda.Code.fromAsset('.', {
        exclude: ['node_modules', 'cdk.out', 'test', 'frontend', '.git'],
      }),
      role: lambdaExecutionRole,
      environment: frameHistoryEnv,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
    });

    // S3 Event Notification: frames/ prefix にオブジェクトが作成されたら Lambda をトリガー
    this.videoBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(handleFrameUploadFn),
      { prefix: 'frames/' },
    );

    // Frame History API
    const getFrameHistoryFn = new lambda.Function(this, 'GetFrameHistoryHandler', {
      functionName: `noeatstop-get-frame-history-${stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'dist/lib/lambda/api-handlers.getFrameHistory',
      code: lambda.Code.fromAsset('.', {
        exclude: ['node_modules', 'cdk.out', 'test', 'frontend', '.git'],
      }),
      role: lambdaExecutionRole,
      environment: frameHistoryEnv,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
    });

    const frameHistoryResource = this.api.root.addResource('frame-history');
    frameHistoryResource.addMethod('GET', new apigateway.LambdaIntegration(getFrameHistoryFn), authMethodOptions);

    // Labels API (Human-in-the-loop ラベリング)
    const labelsEnv = {
      ...lambdaEnv,
      LABELS_TABLE: this.labelsTable.tableName,
    };

    const saveLabelFn = new lambda.Function(this, 'SaveLabelHandler', {
      functionName: `noeatstop-save-label-${stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'dist/lib/lambda/api-handlers.saveLabel',
      code: lambda.Code.fromAsset('.', {
        exclude: ['node_modules', 'cdk.out', 'test', 'frontend', '.git'],
      }),
      role: lambdaExecutionRole,
      environment: labelsEnv,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
    });

    const getLabelsFn = new lambda.Function(this, 'GetLabelsHandler', {
      functionName: `noeatstop-get-labels-${stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'dist/lib/lambda/api-handlers.getLabels',
      code: lambda.Code.fromAsset('.', {
        exclude: ['node_modules', 'cdk.out', 'test', 'frontend', '.git'],
      }),
      role: lambdaExecutionRole,
      environment: labelsEnv,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
    });

    const labelsResource = this.api.root.addResource('labels');
    labelsResource.addMethod('POST', new apigateway.LambdaIntegration(saveLabelFn), authMethodOptions);
    labelsResource.addMethod('GET', new apigateway.LambdaIntegration(getLabelsFn), authMethodOptions);

    // ========================================
    // CloudFront Distribution
    // ========================================

    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'WebAppOAI');
    this.webAppBucket.grantRead(originAccessIdentity);

    this.distribution = new cloudfront.Distribution(this, 'WebAppDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(this.webAppBucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
    });

    // ========================================
    // IoT Core Resources
    // ========================================

    const iotThingGroup = new iot.CfnThingGroup(this, 'DeviceThingGroup', {
      thingGroupName: `noeatstop-devices-${stage}`,
      thingGroupProperties: {
        thingGroupDescription: 'NoEatToStop edge devices',
      },
    });

    const iotPolicy = new iot.CfnPolicy(this, 'DeviceIoTPolicy', {
      policyName: `noeatstop-device-policy-${stage}`,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: [
              'iot:Connect',
              'iot:Publish',
              'iot:Subscribe',
              'iot:Receive',
            ],
            Resource: ['*'],
          },
          {
            Effect: 'Allow',
            Action: [
              'greengrass:*',
            ],
            Resource: ['*'],
          },
        ],
      },
    });

    // ========================================
    // IoT Topic Rule → Lambda → DynamoDB
    // ========================================

    const chewingStateHandlerFn = new lambda.Function(this, 'ChewingStateHandler', {
      functionName: `noeatstop-chewing-state-handler-${stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'dist/lib/lambda/api-handlers.handleChewingState',
      code: lambda.Code.fromAsset('.', {
        exclude: ['node_modules', 'cdk.out', 'test', 'frontend', '.git'],
      }),
      role: lambdaExecutionRole,
      environment: {
        ...lambdaEnv,
        CHEWING_STATES_TABLE: this.chewingStatesTable.tableName,
      },
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
    });

    // IoT Rule が Lambda を呼び出す権限
    chewingStateHandlerFn.addPermission('IoTRuleInvoke', {
      principal: new iam.ServicePrincipal('iot.amazonaws.com'),
      sourceArn: `arn:aws:iot:${this.region}:${this.account}:rule/noeatstop_chewing_state_${stage}`,
    });

    new iot.CfnTopicRule(this, 'ChewingStateRule', {
      ruleName: `noeatstop_chewing_state_${stage}`,
      topicRulePayload: {
        sql: "SELECT * FROM 'noeatstop/+/chewing-state'",
        awsIotSqlVersion: '2016-03-23',
        actions: [
          {
            lambda: {
              functionArn: chewingStateHandlerFn.functionArn,
            },
          },
        ],
        ruleDisabled: false,
        description: 'ChewingAnalyzer の状態変化を DynamoDB に保存',
      },
    });

    // ========================================
    // IoT Topic Rule → Lambda → DynamoDB (TV Control Events)
    // ========================================

    const tvControlHandlerFn = new lambda.Function(this, 'TVControlEventHandler', {
      functionName: `noeatstop-tv-control-handler-${stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'dist/lib/lambda/api-handlers.handleTVControlEvent',
      code: lambda.Code.fromAsset('.', {
        exclude: ['node_modules', 'cdk.out', 'test', 'frontend', '.git'],
      }),
      role: lambdaExecutionRole,
      environment: {
        ...lambdaEnv,
        TV_CONTROL_EVENTS_TABLE: this.tvControlEventsTable.tableName,
      },
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
    });

    tvControlHandlerFn.addPermission('IoTRuleInvokeTVControl', {
      principal: new iam.ServicePrincipal('iot.amazonaws.com'),
      sourceArn: `arn:aws:iot:${this.region}:${this.account}:rule/noeatstop_tv_control_${stage}`,
    });

    new iot.CfnTopicRule(this, 'TVControlRule', {
      ruleName: `noeatstop_tv_control_${stage}`,
      topicRulePayload: {
        sql: "SELECT * FROM 'noeatstop/+/tv-control'",
        awsIotSqlVersion: '2016-03-23',
        actions: [
          {
            lambda: {
              functionArn: tvControlHandlerFn.functionArn,
            },
          },
        ],
        ruleDisabled: false,
        description: 'DeviceController の TV 制御イベントを DynamoDB に保存',
      },
    });

    // ========================================
    // Monitoring & Analytics
    // ========================================

    // SNS Topic for critical alerts
    const alertTopic = new sns.Topic(this, 'CriticalAlertTopic', {
      topicName: `noeatstop-critical-alerts-${stage}`,
      displayName: 'NoEatToStop Critical Alerts',
    });

    // CloudWatch Log Group for edge device
    const edgeLogGroup = new logs.LogGroup(this, 'EdgeDeviceLogGroup', {
      logGroupName: `/noeatstop/${stage}/edge-device`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Lambda error alarm
    const lambdaErrorAlarm = new cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
      alarmName: `noeatstop-lambda-errors-${stage}`,
      alarmDescription: 'Lambda function errors exceeding threshold',
      metric: apiHandler.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 5,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    lambdaErrorAlarm.addAlarmAction({
      bind: () => ({ alarmActionArn: alertTopic.topicArn }),
    });

    // CloudWatch Dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'MonitoringDashboard', {
      dashboardName: `NoEatToStop-${stage}`,
    });

    dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: `# NoEatToStop System Dashboard (${stage})`,
        width: 24,
        height: 1,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway Requests',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: 'Count',
            dimensionsMap: { ApiName: this.api.restApiName },
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: '4XXError',
            dimensionsMap: { ApiName: this.api.restApiName },
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: '5XXError',
            dimensionsMap: { ApiName: this.api.restApiName },
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'API Gateway Latency',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: 'Latency',
            dimensionsMap: { ApiName: this.api.restApiName },
            period: cdk.Duration.minutes(5),
            statistic: 'Average',
          }),
        ],
        width: 12,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Invocations & Errors',
        left: [
          apiHandler.metricInvocations({ period: cdk.Duration.minutes(5) }),
          apiHandler.metricErrors({ period: cdk.Duration.minutes(5) }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration',
        left: [
          apiHandler.metricDuration({ period: cdk.Duration.minutes(5) }),
        ],
        width: 12,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Read/Write Capacity',
        left: [
          this.mealSessionsTable.metricConsumedReadCapacityUnits({ period: cdk.Duration.minutes(5) }),
          this.eatingStatesTable.metricConsumedReadCapacityUnits({ period: cdk.Duration.minutes(5) }),
        ],
        right: [
          this.mealSessionsTable.metricConsumedWriteCapacityUnits({ period: cdk.Duration.minutes(5) }),
          this.eatingStatesTable.metricConsumedWriteCapacityUnits({ period: cdk.Duration.minutes(5) }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Custom Metrics - Detection Accuracy',
        left: [
          new cloudwatch.Metric({
            namespace: 'NoEatToStop',
            metricName: 'FaceDetectionAccuracy',
            dimensionsMap: { Stage: stage },
            period: cdk.Duration.minutes(5),
            statistic: 'Average',
          }),
          new cloudwatch.Metric({
            namespace: 'NoEatToStop',
            metricName: 'ChewingDetectionAccuracy',
            dimensionsMap: { Stage: stage },
            period: cdk.Duration.minutes(5),
            statistic: 'Average',
          }),
        ],
        width: 12,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'TV Control',
        left: [
          new cloudwatch.Metric({
            namespace: 'NoEatToStop',
            metricName: 'TVControlSuccessRate',
            dimensionsMap: { Stage: stage },
            period: cdk.Duration.minutes(5),
            statistic: 'Average',
          }),
          new cloudwatch.Metric({
            namespace: 'NoEatToStop',
            metricName: 'ChewingStopCount',
            dimensionsMap: { Stage: stage },
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Session Duration',
        left: [
          new cloudwatch.Metric({
            namespace: 'NoEatToStop',
            metricName: 'SessionDuration',
            dimensionsMap: { Stage: stage },
            period: cdk.Duration.minutes(5),
            statistic: 'Average',
          }),
        ],
        width: 12,
      }),
    );

    // ========================================
    // Outputs
    // ========================================

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });

    new cdk.CfnOutput(this, 'CognitoDomainName', {
      value: `${cognitoDomain.domainName}.auth.${this.region}.amazoncognito.com`,
      description: 'Cognito Hosted UI Domain',
    });

    new cdk.CfnOutput(this, 'VideoBucketName', {
      value: this.videoBucket.bucketName,
      description: 'Video storage bucket name',
    });

    new cdk.CfnOutput(this, 'WebAppBucketName', {
      value: this.webAppBucket.bucketName,
      description: 'Web application bucket name',
    });

    new cdk.CfnOutput(this, 'WebAppUrl', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: 'Web application URL',
    });

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.api.url,
      description: 'API Gateway endpoint URL',
    });

    new cdk.CfnOutput(this, 'MealSessionsTableName', {
      value: this.mealSessionsTable.tableName,
      description: 'MealSessions DynamoDB table name',
    });

    new cdk.CfnOutput(this, 'EatingStatesTableName', {
      value: this.eatingStatesTable.tableName,
      description: 'EatingStates DynamoDB table name',
    });

    new cdk.CfnOutput(this, 'SystemSettingsTableName', {
      value: this.systemSettingsTable.tableName,
      description: 'SystemSettings DynamoDB table name',
    });

    new cdk.CfnOutput(this, 'ChewingStatesTableName', {
      value: this.chewingStatesTable.tableName,
      description: 'ChewingStates DynamoDB table name (TTL enabled)',
    });

    new cdk.CfnOutput(this, 'TVControlEventsTableName', {
      value: this.tvControlEventsTable.tableName,
      description: 'TVControlEvents DynamoDB table name (TTL enabled)',
    });

    new cdk.CfnOutput(this, 'FrameHistoryTableName', {
      value: this.frameHistoryTable.tableName,
      description: 'FrameHistory DynamoDB table name (TTL enabled)',
    });
  }
}
