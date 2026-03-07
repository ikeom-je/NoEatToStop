import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { NoEatToStopStack } from '../lib/no-eat-to-stop-stack';

describe('NoEatToStopStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new NoEatToStopStack(app, 'TestStack', {
      env: { account: '123456789012', region: 'ap-northeast-1' },
      stage: 'test',
    });
    template = Template.fromStack(stack);
  });

  describe('S3 Buckets', () => {
    it('should create video bucket with lifecycle rules', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: Match.stringLikeRegexp('noeatstop-videos-test'),
        LifecycleConfiguration: {
          Rules: Match.arrayWith([
            Match.objectLike({
              Id: 'DeleteOldVideos',
              Prefix: 'daily/',
              ExpirationInDays: 1,
              Status: 'Enabled',
            }),
          ]),
        },
      });
    });

    it('should create web app bucket with block public access', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: Match.stringLikeRegexp('noeatstop-webapp-test'),
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
    });
  });

  describe('DynamoDB Tables', () => {
    it('should create MealSessions table with correct key schema', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'MealSessions-test',
        KeySchema: [
          { AttributeName: 'sessionId', KeyType: 'HASH' },
        ],
        BillingMode: 'PAY_PER_REQUEST',
      });
    });

    it('should create EatingStates table with sort key and TTL', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'EatingStates-test',
        KeySchema: [
          { AttributeName: 'sessionId', KeyType: 'HASH' },
          { AttributeName: 'timestamp', KeyType: 'RANGE' },
        ],
        BillingMode: 'PAY_PER_REQUEST',
        TimeToLiveSpecification: {
          AttributeName: 'ttl',
          Enabled: true,
        },
      });
    });

    it('should create SystemSettings table', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'SystemSettings-test',
        KeySchema: [
          { AttributeName: 'settingKey', KeyType: 'HASH' },
        ],
        BillingMode: 'PAY_PER_REQUEST',
      });
    });
  });

  describe('API Gateway', () => {
    it('should create REST API', () => {
      template.hasResourceProperties('AWS::ApiGateway::RestApi', {
        Name: 'noeatstop-api-test',
      });
    });

    it('should create API resources', () => {
      // meal-session, {sessionId}, eating-state, {sessionId}, tv-control, {sessionId}, should-control, history, settings, {settingKey}
      const resources = template.findResources('AWS::ApiGateway::Resource');
      expect(Object.keys(resources).length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Lambda Functions', () => {
    it('should create API handler Lambda functions', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'noeatstop-api-test',
        Runtime: 'nodejs18.x',
      });
    });

    it('should set environment variables on Lambda functions', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: Match.objectLike({
            MEAL_SESSIONS_TABLE: Match.anyValue(),
            EATING_STATES_TABLE: Match.anyValue(),
            SYSTEM_SETTINGS_TABLE: Match.anyValue(),
            VIDEO_BUCKET: Match.anyValue(),
          }),
        },
      });
    });
  });

  describe('CloudFront', () => {
    it('should create distribution with SPA error responses', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: Match.objectLike({
          DefaultRootObject: 'index.html',
          CustomErrorResponses: Match.arrayWith([
            Match.objectLike({
              ErrorCode: 404,
              ResponseCode: 200,
              ResponsePagePath: '/index.html',
            }),
          ]),
        }),
      });
    });
  });

  describe('IAM Roles', () => {
    it('should create edge device role', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'noeatstop-edge-device-test',
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Principal: { Service: 'credentials.iot.amazonaws.com' },
            }),
          ]),
        }),
      });
    });

    it('should create lambda execution role', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'noeatstop-lambda-test',
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Principal: { Service: 'lambda.amazonaws.com' },
            }),
          ]),
        }),
      });
    });
  });

  describe('IoT Core', () => {
    it('should create IoT thing group', () => {
      template.hasResourceProperties('AWS::IoT::ThingGroup', {
        ThingGroupName: 'noeatstop-devices-test',
      });
    });

    it('should create IoT policy', () => {
      template.hasResourceProperties('AWS::IoT::Policy', {
        PolicyName: 'noeatstop-device-policy-test',
      });
    });
  });

  describe('Outputs', () => {
    it('should export important values', () => {
      template.hasOutput('VideoBucketName', {});
      template.hasOutput('WebAppBucketName', {});
      template.hasOutput('WebAppUrl', {});
      template.hasOutput('ApiEndpoint', {});
      template.hasOutput('MealSessionsTableName', {});
      template.hasOutput('EatingStatesTableName', {});
      template.hasOutput('SystemSettingsTableName', {});
    });
  });
});
