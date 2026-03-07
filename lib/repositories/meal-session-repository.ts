import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { MealSession, MealSessionStatus } from '../models/types';

export class MealSessionRepository {
  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async create(session: MealSession): Promise<MealSession> {
    await this.docClient.send(new PutCommand({
      TableName: this.tableName,
      Item: session,
      ConditionExpression: 'attribute_not_exists(sessionId)',
    }));
    return session;
  }

  async getById(sessionId: string): Promise<MealSession | null> {
    const result = await this.docClient.send(new GetCommand({
      TableName: this.tableName,
      Key: { sessionId },
    }));
    return (result.Item as MealSession) || null;
  }

  async updateStatus(sessionId: string, status: MealSessionStatus, endTime?: string): Promise<void> {
    const expressionParts: string[] = ['#status = :status'];
    const names: Record<string, string> = { '#status': 'status' };
    const values: Record<string, unknown> = { ':status': status };

    if (endTime) {
      expressionParts.push('endTime = :endTime');
      values[':endTime'] = endTime;
    }

    await this.docClient.send(new UpdateCommand({
      TableName: this.tableName,
      Key: { sessionId },
      UpdateExpression: `SET ${expressionParts.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }));
  }

  async updateMetrics(sessionId: string, metrics: Partial<Pick<MealSession, 'totalDuration' | 'chewingDuration' | 'chewingStopCount' | 'averageConfidence'>>): Promise<void> {
    const expressionParts: string[] = [];
    const values: Record<string, unknown> = {};

    if (metrics.totalDuration !== undefined) {
      expressionParts.push('totalDuration = :totalDuration');
      values[':totalDuration'] = metrics.totalDuration;
    }
    if (metrics.chewingDuration !== undefined) {
      expressionParts.push('chewingDuration = :chewingDuration');
      values[':chewingDuration'] = metrics.chewingDuration;
    }
    if (metrics.chewingStopCount !== undefined) {
      expressionParts.push('chewingStopCount = :chewingStopCount');
      values[':chewingStopCount'] = metrics.chewingStopCount;
    }
    if (metrics.averageConfidence !== undefined) {
      expressionParts.push('averageConfidence = :averageConfidence');
      values[':averageConfidence'] = metrics.averageConfidence;
    }

    if (expressionParts.length === 0) return;

    await this.docClient.send(new UpdateCommand({
      TableName: this.tableName,
      Key: { sessionId },
      UpdateExpression: `SET ${expressionParts.join(', ')}`,
      ExpressionAttributeValues: values,
    }));
  }
}
