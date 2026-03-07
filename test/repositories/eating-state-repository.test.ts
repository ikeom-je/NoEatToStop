import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { EatingStateRepository } from '../../lib/repositories/eating-state-repository';
import { EatingState } from '../../lib/models/types';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('EatingStateRepository', () => {
  let repo: EatingStateRepository;

  const testState: EatingState = {
    sessionId: 'session-001',
    timestamp: 1707300000,
    state: 'chewing',
    confidence: 0.95,
    analysisSource: 'edge',
    metadata: {
      faceDetected: true,
      chewingDetected: true,
      childrenDetected: 1,
    },
  };

  beforeEach(() => {
    ddbMock.reset();
    repo = new EatingStateRepository(
      ddbMock as unknown as DynamoDBDocumentClient,
      'EatingStates-test',
    );
  });

  describe('create', () => {
    it('should create state with auto TTL', async () => {
      ddbMock.on(PutCommand).resolves({});
      const result = await repo.create(testState);

      expect(result.ttl).toBeDefined();
      expect(result.ttl!).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('should preserve provided TTL', async () => {
      ddbMock.on(PutCommand).resolves({});
      const customTtl = Math.floor(Date.now() / 1000) + 172800;
      const result = await repo.create({ ...testState, ttl: customTtl });

      expect(result.ttl).toBe(customTtl);
    });
  });

  describe('queryBySession', () => {
    it('should return states for a session', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [testState] });
      const results = await repo.queryBySession('session-001');

      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe('session-001');
    });

    it('should return empty array when no states', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      const results = await repo.queryBySession('nonexistent');

      expect(results).toHaveLength(0);
    });

    it('should respect limit parameter', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [testState] });
      await repo.queryBySession('session-001', 10);

      const call = ddbMock.commandCalls(QueryCommand)[0];
      expect(call.args[0].input.Limit).toBe(10);
    });
  });

  describe('queryByTimeRange', () => {
    it('should query with time range', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [testState] });
      const results = await repo.queryByTimeRange('session-001', 1707290000, 1707310000);

      expect(results).toHaveLength(1);
      const call = ddbMock.commandCalls(QueryCommand)[0];
      expect(call.args[0].input.ExpressionAttributeValues).toMatchObject({
        ':start': 1707290000,
        ':end': 1707310000,
      });
    });
  });

  describe('setErrorFlag', () => {
    it('should set error flag on a state', async () => {
      ddbMock.on(UpdateCommand).resolves({});
      await repo.setErrorFlag('session-001', 1707300000, true);

      const call = ddbMock.commandCalls(UpdateCommand)[0];
      expect(call.args[0].input.Key).toEqual({ sessionId: 'session-001', timestamp: 1707300000 });
      expect(call.args[0].input.ExpressionAttributeValues).toEqual({ ':errorFlag': true });
    });
  });
});
