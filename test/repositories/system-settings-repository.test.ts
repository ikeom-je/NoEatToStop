import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { SystemSettingsRepository } from '../../lib/repositories/system-settings-repository';
import { DEFAULT_SYSTEM_CONFIGURATION } from '../../lib/models/types';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('SystemSettingsRepository', () => {
  let repo: SystemSettingsRepository;

  beforeEach(() => {
    ddbMock.reset();
    repo = new SystemSettingsRepository(
      ddbMock as unknown as DynamoDBDocumentClient,
      'SystemSettings-test',
    );
  });

  describe('getSetting', () => {
    it('should return setting value when found', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: { settingKey: 'pauseThreshold', settingValue: '15', lastUpdated: '2025-02-07T10:00:00Z' },
      });
      const result = await repo.getSetting('pauseThreshold');
      expect(result).toBe('15');
    });

    it('should return null when not found', async () => {
      ddbMock.on(GetCommand).resolves({});
      const result = await repo.getSetting('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('putSetting', () => {
    it('should save setting with timestamp', async () => {
      ddbMock.on(PutCommand).resolves({});
      await repo.putSetting('pauseThreshold', '15');

      const call = ddbMock.commandCalls(PutCommand)[0];
      const item = call.args[0].input.Item!;
      expect(item.settingKey).toBe('pauseThreshold');
      expect(item.settingValue).toBe('15');
      expect(item.lastUpdated).toBeDefined();
    });
  });

  describe('getConfiguration', () => {
    it('should return defaults when no settings stored', async () => {
      ddbMock.on(ScanCommand).resolves({ Items: [] });
      const config = await repo.getConfiguration();
      expect(config).toEqual(DEFAULT_SYSTEM_CONFIGURATION);
    });

    it('should override defaults with stored values', async () => {
      ddbMock.on(ScanCommand).resolves({
        Items: [
          { settingKey: 'pauseThreshold', settingValue: '15', lastUpdated: '' },
          { settingKey: 'excludeAdults', settingValue: 'true', lastUpdated: '' },
          { settingKey: 'videoResolution', settingValue: '1920x1080', lastUpdated: '' },
        ],
      });

      const config = await repo.getConfiguration();
      expect(config.pauseThreshold).toBe(15);
      expect(config.excludeAdults).toBe(true);
      expect(config.videoResolution).toBe('1920x1080');
      // デフォルトが維持されていることを確認
      expect(config.confidenceThreshold).toBe(0.8);
    });
  });

  describe('saveConfiguration', () => {
    it('should save multiple settings', async () => {
      ddbMock.on(PutCommand).resolves({});
      await repo.saveConfiguration({
        pauseThreshold: 15,
        excludeAdults: true,
      });

      expect(ddbMock.commandCalls(PutCommand)).toHaveLength(2);
    });
  });
});
