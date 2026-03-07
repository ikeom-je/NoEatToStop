import { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { SystemConfiguration, SystemSettingItem, DEFAULT_SYSTEM_CONFIGURATION } from '../models/types';

export class SystemSettingsRepository {
  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async getSetting(key: string): Promise<string | null> {
    const result = await this.docClient.send(new GetCommand({
      TableName: this.tableName,
      Key: { settingKey: key },
    }));
    if (!result.Item) return null;
    return (result.Item as SystemSettingItem).settingValue;
  }

  async putSetting(key: string, value: string): Promise<void> {
    const item: SystemSettingItem = {
      settingKey: key,
      settingValue: value,
      lastUpdated: new Date().toISOString(),
    };
    await this.docClient.send(new PutCommand({
      TableName: this.tableName,
      Item: item,
    }));
  }

  async getConfiguration(): Promise<SystemConfiguration> {
    const result = await this.docClient.send(new ScanCommand({
      TableName: this.tableName,
    }));

    const config = { ...DEFAULT_SYSTEM_CONFIGURATION };

    if (result.Items) {
      for (const item of result.Items as SystemSettingItem[]) {
        const key = item.settingKey as keyof SystemConfiguration;
        if (key in config) {
          const defaultValue = DEFAULT_SYSTEM_CONFIGURATION[key];
          if (typeof defaultValue === 'number') {
            (config as Record<string, unknown>)[key] = Number(item.settingValue);
          } else if (typeof defaultValue === 'boolean') {
            (config as Record<string, unknown>)[key] = item.settingValue === 'true';
          } else {
            (config as Record<string, unknown>)[key] = item.settingValue;
          }
        }
      }
    }

    return config;
  }

  async saveConfiguration(config: Partial<SystemConfiguration>): Promise<void> {
    const promises = Object.entries(config).map(([key, value]) =>
      this.putSetting(key, String(value))
    );
    await Promise.all(promises);
  }
}
