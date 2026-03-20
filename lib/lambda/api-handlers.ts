import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MealSessionRepository } from '../repositories/meal-session-repository';
import { EatingStateRepository } from '../repositories/eating-state-repository';
import { SystemSettingsRepository } from '../repositories/system-settings-repository';
import { MealStateManager } from '../services/meal-state-manager';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({});

const sessionRepo = new MealSessionRepository(docClient, process.env.MEAL_SESSIONS_TABLE!);
const stateRepo = new EatingStateRepository(docClient, process.env.EATING_STATES_TABLE!);
const settingsRepo = new SystemSettingsRepository(docClient, process.env.SYSTEM_SETTINGS_TABLE!);
const stateManager = new MealStateManager(sessionRepo, stateRepo, settingsRepo);

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}

export async function createMealSession(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const session = await stateManager.createSession(body.childrenCount || 1);
    return response(201, session);
  } catch (err) {
    return response(500, { error: (err as Error).message });
  }
}

export async function getMealSession(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const sessionId = event.pathParameters?.sessionId;
    if (!sessionId) return response(400, { error: 'sessionId is required' });

    const session = await sessionRepo.getById(sessionId);
    if (!session) return response(404, { error: 'Session not found' });

    return response(200, session);
  } catch (err) {
    return response(500, { error: (err as Error).message });
  }
}

export async function createEatingState(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const { sessionId, state, confidence, analysisSource, metadata } = body;

    if (!sessionId || !state) {
      return response(400, { error: 'sessionId and state are required' });
    }

    const result = await stateManager.recordState(sessionId, state, confidence || 0.5, analysisSource || 'edge', metadata);
    return response(201, result);
  } catch (err) {
    return response(500, { error: (err as Error).message });
  }
}

export async function getEatingStates(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const sessionId = event.pathParameters?.sessionId;
    if (!sessionId) return response(400, { error: 'sessionId is required' });

    const states = await stateRepo.queryBySession(sessionId);
    return response(200, states);
  } catch (err) {
    return response(500, { error: (err as Error).message });
  }
}

export async function getSetting(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const settingKey = event.pathParameters?.settingKey;
    if (!settingKey) return response(400, { error: 'settingKey is required' });

    if (settingKey === 'all') {
      const config = await settingsRepo.getConfiguration();
      return response(200, config);
    }

    const value = await settingsRepo.getSetting(settingKey);
    if (value === null) return response(404, { error: 'Setting not found' });

    return response(200, { settingKey, settingValue: value });
  } catch (err) {
    return response(500, { error: (err as Error).message });
  }
}

export async function updateSetting(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const settingKey = event.pathParameters?.settingKey;
    if (!settingKey) return response(400, { error: 'settingKey is required' });

    const body = JSON.parse(event.body || '{}');
    if (body.settingValue === undefined) {
      return response(400, { error: 'settingValue is required' });
    }

    await settingsRepo.putSetting(settingKey, String(body.settingValue));
    return response(200, { settingKey, settingValue: body.settingValue });
  } catch (err) {
    return response(500, { error: (err as Error).message });
  }
}

export async function getLatestFrame(): Promise<APIGatewayProxyResult> {
  try {
    const bucket = process.env.VIDEO_BUCKET;
    if (!bucket) return response(500, { error: 'VIDEO_BUCKET not configured' });

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: 'live-frames/latest.jpg',
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn: 60 });

    return response(200, { url });
  } catch (err) {
    return response(500, { error: (err as Error).message });
  }
}

export async function getLatestAnalyzedFrame(): Promise<APIGatewayProxyResult> {
  try {
    const bucket = process.env.VIDEO_BUCKET;
    if (!bucket) return response(500, { error: 'VIDEO_BUCKET not configured' });

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: 'live-frames/latest-analyzed.jpg',
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn: 60 });

    return response(200, { url });
  } catch (err) {
    return response(500, { error: (err as Error).message });
  }
}

export async function getChewingStates(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const tableName = process.env.CHEWING_STATES_TABLE;
    if (!tableName) return response(500, { error: 'CHEWING_STATES_TABLE not configured' });

    const deviceId = event.queryStringParameters?.deviceId || 'noeatstop-edge-device';
    const limit = Math.min(Number(event.queryStringParameters?.limit) || 50, 200);

    const result = await ddbClient.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'deviceId = :d',
      ExpressionAttributeValues: { ':d': { S: deviceId } },
      ScanIndexForward: false,
      Limit: limit,
    }));

    const items = (result.Items || []).map(item => ({
      deviceId: item.deviceId?.S,
      epochSeconds: Number(item.epochSeconds?.N),
      state: item.state?.S,
      prevState: item.prevState?.S,
      motionScore: Number(item.motionScore?.N),
      facesDetected: Number(item.facesDetected?.N),
      stoppedDuration: Number(item.stoppedDuration?.N),
      frameCount: Number(item.frameCount?.N),
      timestamp: item.timestamp?.S,
      expiresAt: Number(item.expiresAt?.N),
    }));

    return response(200, { items, count: items.length });
  } catch (err) {
    return response(500, { error: (err as Error).message });
  }
}

/**
 * IoT Rule から呼び出される Lambda ハンドラー
 * MQTT メッセージを ChewingStates DynamoDB テーブルに保存
 */
export async function handleChewingState(event: Record<string, unknown>): Promise<void> {
  const tableName = process.env.CHEWING_STATES_TABLE;
  if (!tableName) {
    console.error('CHEWING_STATES_TABLE not configured');
    return;
  }

  // SystemSettings から保管日数を取得（デフォルト 7 日）
  let retentionDays = 7;
  try {
    const val = await settingsRepo.getSetting('chewingStateRetentionDays');
    if (val) retentionDays = parseInt(val, 10) || 7;
  } catch {
    // デフォルト値を使用
  }

  const epochSeconds = typeof event.epochSeconds === 'number' ? event.epochSeconds : Math.floor(Date.now() / 1000);
  const expiresAt = epochSeconds + retentionDays * 86400;

  const item: Record<string, { S: string } | { N: string }> = {
    deviceId: { S: String(event.deviceId || 'unknown') },
    epochSeconds: { N: String(epochSeconds) },
    state: { S: String(event.state || '') },
    prevState: { S: String(event.prevState || '') },
    motionScore: { N: String(event.motionScore ?? 0) },
    facesDetected: { N: String(event.facesDetected ?? 0) },
    stoppedDuration: { N: String(event.stoppedDuration ?? 0) },
    frameCount: { N: String(event.frameCount ?? 0) },
    timestamp: { S: String(event.timestamp || new Date().toISOString()) },
    expiresAt: { N: String(expiresAt) },
  };

  await ddbClient.send(new PutItemCommand({
    TableName: tableName,
    Item: item,
  }));

  console.log(`ChewingState saved: ${event.state} (device=${event.deviceId}, ttl=${retentionDays}d)`);
}
