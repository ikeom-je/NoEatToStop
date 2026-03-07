import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { MealSessionRepository } from '../../lib/repositories/meal-session-repository';
import { MealSession } from '../../lib/models/types';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('MealSessionRepository', () => {
  let repo: MealSessionRepository;

  const testSession: MealSession = {
    sessionId: 'session-001',
    startTime: '2025-02-07T10:00:00Z',
    status: 'active',
    childrenCount: 1,
  };

  beforeEach(() => {
    ddbMock.reset();
    repo = new MealSessionRepository(
      ddbMock as unknown as DynamoDBDocumentClient,
      'MealSessions-test',
    );
  });

  describe('create', () => {
    it('should create a meal session', async () => {
      ddbMock.on(PutCommand).resolves({});
      const result = await repo.create(testSession);

      expect(result).toEqual(testSession);
      const call = ddbMock.commandCalls(PutCommand)[0];
      expect(call.args[0].input.TableName).toBe('MealSessions-test');
      expect(call.args[0].input.Item).toEqual(testSession);
    });

    it('should fail if session already exists', async () => {
      ddbMock.on(PutCommand).rejects(new Error('ConditionalCheckFailedException'));
      await expect(repo.create(testSession)).rejects.toThrow('ConditionalCheckFailedException');
    });
  });

  describe('getById', () => {
    it('should return session when found', async () => {
      ddbMock.on(GetCommand).resolves({ Item: testSession });
      const result = await repo.getById('session-001');
      expect(result).toEqual(testSession);
    });

    it('should return null when not found', async () => {
      ddbMock.on(GetCommand).resolves({});
      const result = await repo.getById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update status', async () => {
      ddbMock.on(UpdateCommand).resolves({});
      await repo.updateStatus('session-001', 'completed');

      const call = ddbMock.commandCalls(UpdateCommand)[0];
      expect(call.args[0].input.ExpressionAttributeValues).toEqual({ ':status': 'completed' });
    });

    it('should update status with endTime', async () => {
      ddbMock.on(UpdateCommand).resolves({});
      await repo.updateStatus('session-001', 'completed', '2025-02-07T10:30:00Z');

      const call = ddbMock.commandCalls(UpdateCommand)[0];
      expect(call.args[0].input.ExpressionAttributeValues).toEqual({
        ':status': 'completed',
        ':endTime': '2025-02-07T10:30:00Z',
      });
    });
  });

  describe('updateMetrics', () => {
    it('should update specified metrics', async () => {
      ddbMock.on(UpdateCommand).resolves({});
      await repo.updateMetrics('session-001', {
        totalDuration: 1800,
        chewingDuration: 1200,
        chewingStopCount: 3,
      });

      const call = ddbMock.commandCalls(UpdateCommand)[0];
      expect(call.args[0].input.ExpressionAttributeValues).toMatchObject({
        ':totalDuration': 1800,
        ':chewingDuration': 1200,
        ':chewingStopCount': 3,
      });
    });

    it('should skip update when no metrics provided', async () => {
      await repo.updateMetrics('session-001', {});
      expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
    });
  });
});
