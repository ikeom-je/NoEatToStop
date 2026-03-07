import { APIGatewayProxyEvent } from 'aws-lambda';

// 環境変数を先にセット
process.env.MEAL_SESSIONS_TABLE = 'MealSessions-test';
process.env.EATING_STATES_TABLE = 'EatingStates-test';
process.env.SYSTEM_SETTINGS_TABLE = 'SystemSettings-test';

// DynamoDBクライアントをモック
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => {
  const mockSend = jest.fn();
  return {
    DynamoDBDocumentClient: {
      from: jest.fn().mockReturnValue({ send: mockSend }),
    },
    PutCommand: jest.fn(),
    GetCommand: jest.fn(),
    UpdateCommand: jest.fn(),
    QueryCommand: jest.fn(),
    ScanCommand: jest.fn(),
  };
});

import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

function createEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    headers: {},
    body: null,
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as any,
    resource: '',
    ...overrides,
  };
}

describe('API Handlers', () => {
  let handlers: typeof import('../../lib/lambda/api-handlers');
  let mockSend: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    // re-mock
    jest.mock('@aws-sdk/client-dynamodb', () => ({
      DynamoDBClient: jest.fn().mockImplementation(() => ({})),
    }));

    mockSend = jest.fn();
    jest.mock('@aws-sdk/lib-dynamodb', () => ({
      DynamoDBDocumentClient: {
        from: jest.fn().mockReturnValue({ send: mockSend }),
      },
      PutCommand: jest.fn().mockImplementation((input: any) => ({ input, type: 'Put' })),
      GetCommand: jest.fn().mockImplementation((input: any) => ({ input, type: 'Get' })),
      UpdateCommand: jest.fn().mockImplementation((input: any) => ({ input, type: 'Update' })),
      QueryCommand: jest.fn().mockImplementation((input: any) => ({ input, type: 'Query' })),
      ScanCommand: jest.fn().mockImplementation((input: any) => ({ input, type: 'Scan' })),
    }));

    handlers = require('../../lib/lambda/api-handlers');
  });

  describe('createMealSession', () => {
    it('should create session and return 201', async () => {
      mockSend.mockResolvedValue({});

      const event = createEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ childrenCount: 2 }),
      });

      const result = await handlers.createMealSession(event);
      expect(result.statusCode).toBe(201);

      const body = JSON.parse(result.body);
      expect(body.sessionId).toBeDefined();
      expect(body.status).toBe('active');
      expect(body.childrenCount).toBe(2);
    });
  });

  describe('getMealSession', () => {
    it('should return 400 when no sessionId', async () => {
      const event = createEvent({ pathParameters: null });
      const result = await handlers.getMealSession(event);
      expect(result.statusCode).toBe(400);
    });

    it('should return 404 when session not found', async () => {
      mockSend.mockResolvedValue({});

      const event = createEvent({
        pathParameters: { sessionId: 'nonexistent' },
      });
      const result = await handlers.getMealSession(event);
      expect(result.statusCode).toBe(404);
    });

    it('should return session when found', async () => {
      mockSend.mockResolvedValue({
        Item: { sessionId: 'session-001', status: 'active', startTime: '2025-02-07T10:00:00Z' },
      });

      const event = createEvent({
        pathParameters: { sessionId: 'session-001' },
      });
      const result = await handlers.getMealSession(event);
      expect(result.statusCode).toBe(200);

      const body = JSON.parse(result.body);
      expect(body.sessionId).toBe('session-001');
    });
  });

  describe('createEatingState', () => {
    it('should return 400 when required fields missing', async () => {
      const event = createEvent({
        httpMethod: 'POST',
        body: JSON.stringify({}),
      });
      const result = await handlers.createEatingState(event);
      expect(result.statusCode).toBe(400);
    });

    it('should create state and return 201', async () => {
      mockSend.mockResolvedValue({ Items: [] });

      const event = createEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          sessionId: 'session-001',
          state: 'chewing',
          confidence: 0.9,
          analysisSource: 'edge',
        }),
      });
      const result = await handlers.createEatingState(event);
      expect(result.statusCode).toBe(201);
    });
  });

  describe('getSetting', () => {
    it('should return 400 when no settingKey', async () => {
      const event = createEvent({ pathParameters: null });
      const result = await handlers.getSetting(event);
      expect(result.statusCode).toBe(400);
    });

    it('should return all configuration when key is "all"', async () => {
      mockSend.mockResolvedValue({ Items: [] });

      const event = createEvent({
        pathParameters: { settingKey: 'all' },
      });
      const result = await handlers.getSetting(event);
      expect(result.statusCode).toBe(200);

      const body = JSON.parse(result.body);
      expect(body.pauseThreshold).toBeDefined();
    });
  });

  describe('updateSetting', () => {
    it('should return 400 when no value', async () => {
      const event = createEvent({
        httpMethod: 'PUT',
        pathParameters: { settingKey: 'pauseThreshold' },
        body: JSON.stringify({}),
      });
      const result = await handlers.updateSetting(event);
      expect(result.statusCode).toBe(400);
    });

    it('should update setting and return 200', async () => {
      mockSend.mockResolvedValue({});

      const event = createEvent({
        httpMethod: 'PUT',
        pathParameters: { settingKey: 'pauseThreshold' },
        body: JSON.stringify({ settingValue: '15' }),
      });
      const result = await handlers.updateSetting(event);
      expect(result.statusCode).toBe(200);
    });
  });
});
