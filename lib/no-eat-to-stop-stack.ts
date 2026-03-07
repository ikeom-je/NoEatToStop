import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iot from 'aws-cdk-lib/aws-iot';
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
      ],
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

    // Lambda統合
    mealSessionResource.addMethod('POST', new apigateway.LambdaIntegration(createSessionFn));
    mealSessionIdResource.addMethod('GET', new apigateway.LambdaIntegration(getSessionFn));

    eatingStateResource.addMethod('POST', new apigateway.LambdaIntegration(createStateFn));
    eatingStateSessionResource.addMethod('GET', new apigateway.LambdaIntegration(getStatesFn));

    settingKeyResource.addMethod('GET', new apigateway.LambdaIntegration(getSettingFn));
    settingKeyResource.addMethod('PUT', new apigateway.LambdaIntegration(updateSettingFn));

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
    // Outputs
    // ========================================

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
  }
}
