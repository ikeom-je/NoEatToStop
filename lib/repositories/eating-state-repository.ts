import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { EatingState } from '../models/types';

export class EatingStateRepository {
  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async create(state: EatingState): Promise<EatingState> {
    // TTL: 1日後に自動削除
    const item = {
      ...state,
      ttl: state.ttl || Math.floor(Date.now() / 1000) + 86400,
    };

    await this.docClient.send(new PutCommand({
      TableName: this.tableName,
      Item: item,
    }));
    return item;
  }

  async queryBySession(sessionId: string, limit?: number): Promise<EatingState[]> {
    const result = await this.docClient.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'sessionId = :sessionId',
      ExpressionAttributeValues: { ':sessionId': sessionId },
      ScanIndexForward: true,
      Limit: limit,
    }));
    return (result.Items as EatingState[]) || [];
  }

  async queryByTimeRange(sessionId: string, startTime: number, endTime: number): Promise<EatingState[]> {
    const result = await this.docClient.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'sessionId = :sessionId AND #ts BETWEEN :start AND :end',
      ExpressionAttributeNames: { '#ts': 'timestamp' },
      ExpressionAttributeValues: {
        ':sessionId': sessionId,
        ':start': startTime,
        ':end': endTime,
      },
      ScanIndexForward: true,
    }));
    return (result.Items as EatingState[]) || [];
  }

  async setErrorFlag(sessionId: string, timestamp: number, errorFlag: boolean): Promise<void> {
    await this.docClient.send(new UpdateCommand({
      TableName: this.tableName,
      Key: { sessionId, timestamp },
      UpdateExpression: 'SET errorFlag = :errorFlag',
      ExpressionAttributeValues: { ':errorFlag': errorFlag },
    }));
  }
}
