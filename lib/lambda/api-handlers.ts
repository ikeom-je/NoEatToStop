import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
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
