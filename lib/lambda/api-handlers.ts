import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient, PutItemCommand, QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { IoTDataPlaneClient, PublishCommand } from '@aws-sdk/client-iot-data-plane';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MealSessionRepository } from '../repositories/meal-session-repository';
import { EatingStateRepository } from '../repositories/eating-state-repository';
import { SystemSettingsRepository } from '../repositories/system-settings-repository';
import { MealStateManager } from '../services/meal-state-manager';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({});
const iotClient = new IoTDataPlaneClient({});

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

    if (settingKey === 'all') {
      // 全設定保存（SystemSettings.vue の saveAll）
      await settingsRepo.saveConfiguration(body);

      // Edge に設定変更を MQTT push
      const analyzerSettings = {
        chewingMotionThreshold: body.chewingDetectionThreshold ?? body.chewingMotionThreshold,
        faceDetectionScale: body.faceDetectionThreshold,
        mouthRoiRatio: body.mouthDetectionThreshold,
        pauseThreshold: body.pauseThreshold,
        analysisFrameCount: body.analysisFrameCount,
      };

      const deviceId = body.deviceId || 'noeatstop-edge-device';
      try {
        await iotClient.send(new PublishCommand({
          topic: `noeatstop/${deviceId}/settings-update`,
          qos: 1,
          payload: Buffer.from(JSON.stringify(analyzerSettings)),
        }));
        console.log(`Settings MQTT push sent to ${deviceId}`);
      } catch (mqttErr) {
        console.warn('MQTT push failed (non-critical):', mqttErr);
      }

      return response(200, body);
    }

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
    confidence: { N: String(event.confidence ?? 0) },
    timestamp: { S: String(event.timestamp || new Date().toISOString()) },
    expiresAt: { N: String(expiresAt) },
  };

  await ddbClient.send(new PutItemCommand({
    TableName: tableName,
    Item: item,
  }));

  console.log(`ChewingState saved: ${event.state} (device=${event.deviceId}, confidence=${event.confidence}, ttl=${retentionDays}d)`);
}

/**
 * IoT Rule から呼び出される Lambda ハンドラー
 * TV 制御イベントを TVControlEvents DynamoDB テーブルに保存
 */
export async function handleTVControlEvent(event: Record<string, unknown>): Promise<void> {
  const tableName = process.env.TV_CONTROL_EVENTS_TABLE;
  if (!tableName) {
    console.error('TV_CONTROL_EVENTS_TABLE not configured');
    return;
  }

  const epochSeconds = typeof event.epochSeconds === 'number' ? event.epochSeconds : Math.floor(Date.now() / 1000);
  const expiresAt = epochSeconds + 30 * 86400; // 30日保持

  const item: Record<string, { S: string } | { N: string }> = {
    deviceId: { S: String(event.deviceId || 'unknown') },
    epochSeconds: { N: String(epochSeconds) },
    action: { S: String(event.action || '') },
    reason: { S: String(event.reason || '') },
    source: { S: String(event.source || 'edge') },
    success: { S: String(event.success ?? true) },
    method: { S: String(event.method || 'mock') },
    error: { S: String(event.error || '') },
    tvPower: { S: String(event.tvPower || '') },
    timestamp: { S: String(event.timestamp || new Date().toISOString()) },
    expiresAt: { N: String(expiresAt) },
  };

  await ddbClient.send(new PutItemCommand({
    TableName: tableName,
    Item: item,
  }));

  console.log(`TVControlEvent saved: ${event.action} (device=${event.deviceId}, source=${event.source})`);
}

/**
 * GET /tv-control/events — TV 制御イベント履歴を取得
 */
export async function getTVControlEvents(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const tableName = process.env.TV_CONTROL_EVENTS_TABLE;
    if (!tableName) return response(500, { error: 'TV_CONTROL_EVENTS_TABLE not configured' });

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
      action: item.action?.S,
      reason: item.reason?.S,
      source: item.source?.S,
      success: item.success?.S === 'true',
      method: item.method?.S,
      error: item.error?.S || undefined,
      tvPower: item.tvPower?.S,
      timestamp: item.timestamp?.S,
    }));

    return response(200, { items, count: items.length });
  } catch (err) {
    return response(500, { error: (err as Error).message });
  }
}

/**
 * POST /tv-control/command — 管理画面から TV 制御コマンドを送信
 * S3 にコマンドファイルを書き出し → Edge の DeviceController がポーリングで取得
 */
export async function sendTVCommand(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const action = body.action;
    if (!action || !['turn_on', 'turn_off'].includes(action)) {
      return response(400, { error: 'action must be turn_on or turn_off' });
    }

    const deviceId = body.deviceId || 'noeatstop-edge-device';
    const bucket = process.env.VIDEO_BUCKET;
    if (!bucket) return response(500, { error: 'VIDEO_BUCKET not configured' });

    const command = {
      action,
      reason: 'management_console',
      requestId: `console-${Date.now()}`,
      timestamp: new Date().toISOString(),
    };

    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: `commands/${deviceId}/tv.json`,
      Body: JSON.stringify(command),
      ContentType: 'application/json',
    }));

    return response(200, { message: 'Command sent', command });
  } catch (err) {
    return response(500, { error: (err as Error).message });
  }
}

/**
 * S3 Event Notification から呼び出される Lambda ハンドラー
 * frames/ にアップロードされたフレームのメタデータを FrameHistory テーブルに保存
 */
export async function handleFrameUpload(event: { Records: Array<{ s3: { bucket: { name: string }; object: { key: string; size: number } }; eventTime: string }> }): Promise<void> {
  const tableName = process.env.FRAME_HISTORY_TABLE;
  if (!tableName) {
    console.error('FRAME_HISTORY_TABLE not configured');
    return;
  }

  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    // frames/{deviceId}/{date}/{epochMs}.jpg からメタデータを抽出
    const parts = key.split('/');
    if (parts.length < 4) continue;

    const deviceId = parts[1];
    const fileName = parts[parts.length - 1];
    const epochMs = parseInt(fileName.replace('.jpg', ''), 10);
    if (isNaN(epochMs)) continue;

    // S3 オブジェクトのメタデータを取得
    let metadata: Record<string, string> = {};
    try {
      const head = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      metadata = head.Metadata || {};
    } catch {
      console.warn(`HeadObject failed for ${key}`);
    }

    const confidence = parseFloat(metadata['confidence'] || '0');
    const state = metadata['state'] || '';
    const motionScore = parseInt(metadata['motion_score'] || '0', 10);
    const facesDetected = parseInt(metadata['faces_detected'] || '0', 10);
    const frameCount = parseInt(metadata['frame_count'] || '0', 10);

    // presigned URL を生成（1時間有効）
    const presignedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: 3600 },
    );

    const expiresAt = Math.floor(epochMs / 1000) + 86400; // 1日後に TTL 削除

    const item: Record<string, { S: string } | { N: string }> = {
      deviceId: { S: deviceId },
      epochMs: { N: String(epochMs) },
      s3Key: { S: key },
      s3Bucket: { S: bucket },
      state: { S: state },
      confidence: { N: String(confidence) },
      motionScore: { N: String(motionScore) },
      facesDetected: { N: String(facesDetected) },
      frameCount: { N: String(frameCount) },
      timestamp: { S: record.eventTime },
      expiresAt: { N: String(expiresAt) },
    };

    await ddbClient.send(new PutItemCommand({
      TableName: tableName,
      Item: item,
    }));

    console.log(`FrameHistory saved: device=${deviceId}, confidence=${confidence}, state=${state}`);
  }
}

/**
 * GET /frame-history — フレーム履歴を取得（presigned URL 付き）
 */
export async function getFrameHistory(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const tableName = process.env.FRAME_HISTORY_TABLE;
    if (!tableName) return response(500, { error: 'FRAME_HISTORY_TABLE not configured' });

    const deviceId = event.queryStringParameters?.deviceId || 'noeatstop-edge-device';
    const limit = Math.min(Number(event.queryStringParameters?.limit) || 100, 500);

    const result = await ddbClient.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'deviceId = :d',
      ExpressionAttributeValues: { ':d': { S: deviceId } },
      ScanIndexForward: false,
      Limit: limit,
    }));

    const bucket = process.env.VIDEO_BUCKET;
    const items = await Promise.all((result.Items || []).map(async (item) => {
      const s3Key = item.s3Key?.S || '';
      let frameUrl = '';
      if (bucket && s3Key) {
        try {
          frameUrl = await getSignedUrl(
            s3Client,
            new GetObjectCommand({ Bucket: bucket, Key: s3Key }),
            { expiresIn: 3600 },
          );
        } catch { /* presigned URL 生成失敗は無視 */ }
      }

      return {
        deviceId: item.deviceId?.S,
        epochMs: Number(item.epochMs?.N),
        s3Key,
        frameUrl,
        state: item.state?.S,
        confidence: Number(item.confidence?.N),
        motionScore: Number(item.motionScore?.N),
        facesDetected: Number(item.facesDetected?.N),
        frameCount: Number(item.frameCount?.N),
        timestamp: item.timestamp?.S,
      };
    }));

    return response(200, { items, count: items.length });
  } catch (err) {
    return response(500, { error: (err as Error).message });
  }
}

/**
 * POST /labels — 検出画像に対するラベリングデータを保存
 */
export async function saveLabel(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const tableName = process.env.LABELS_TABLE;
    if (!tableName) return response(500, { error: 'LABELS_TABLE not configured' });

    const body = JSON.parse(event.body || '{}');
    const { deviceId, epochMs, s3Key, label, state, confidence, motionScore, facesDetected } = body;

    if (!epochMs || !label) {
      return response(400, { error: 'epochMs and label are required' });
    }

    const item: Record<string, { S: string } | { N: string }> = {
      deviceId: { S: String(deviceId || 'noeatstop-edge-device') },
      epochMs: { N: String(epochMs) },
      s3Key: { S: String(s3Key || '') },
      label: { S: String(label) },
      state: { S: String(state || '') },
      confidence: { N: String(confidence ?? 0) },
      motionScore: { N: String(motionScore ?? 0) },
      facesDetected: { N: String(facesDetected ?? 0) },
      labeledAt: { S: new Date().toISOString() },
      expiresAt: { N: String(Math.floor(Date.now() / 1000) + 90 * 86400) },
    };

    await ddbClient.send(new PutItemCommand({ TableName: tableName, Item: item }));
    return response(201, { message: 'Label saved', epochMs, label });
  } catch (err) {
    return response(500, { error: (err as Error).message });
  }
}

/**
 * GET /labels — ラベリングデータを取得
 */
export async function getLabels(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const tableName = process.env.LABELS_TABLE;
    if (!tableName) return response(500, { error: 'LABELS_TABLE not configured' });

    const deviceId = event.queryStringParameters?.deviceId || 'noeatstop-edge-device';
    const limit = Math.min(Number(event.queryStringParameters?.limit) || 100, 500);

    const result = await ddbClient.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'deviceId = :d',
      ExpressionAttributeValues: { ':d': { S: deviceId } },
      ScanIndexForward: false,
      Limit: limit,
    }));

    const items = (result.Items || []).map(item => ({
      deviceId: item.deviceId?.S,
      epochMs: Number(item.epochMs?.N),
      s3Key: item.s3Key?.S,
      label: item.label?.S,
      state: item.state?.S,
      confidence: Number(item.confidence?.N),
      motionScore: Number(item.motionScore?.N),
      facesDetected: Number(item.facesDetected?.N),
      labeledAt: item.labeledAt?.S,
    }));

    return response(200, { items, count: items.length });
  } catch (err) {
    return response(500, { error: (err as Error).message });
  }
}

/**
 * IoT Rule から呼び出される Lambda ハンドラー
 * フレーム変化イベントを FrameChangeEvents DynamoDB テーブルに保存
 */
export async function handleFrameChange(event: Record<string, unknown>): Promise<void> {
  const tableName = process.env.FRAME_CHANGE_EVENTS_TABLE;
  if (!tableName) {
    console.error('FRAME_CHANGE_EVENTS_TABLE not configured');
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  let epochSeconds = now;
  if (typeof event.timestamp === 'string') {
    const parsed = Math.floor(new Date(event.timestamp as string).getTime() / 1000);
    if (!isNaN(parsed)) epochSeconds = parsed;
  }
  const expiresAt = epochSeconds + 7 * 86400; // 7日保持

  const details = (event.details || {}) as Record<string, unknown>;

  if (!event.s3Key) {
    console.warn(`FrameChange: s3Key が空です (device=${event.deviceId}, type=${event.changeType})`);
  }

  const item: Record<string, { S: string } | { N: string }> = {
    deviceId: { S: String(event.deviceId || 'unknown') },
    epochSeconds: { N: String(epochSeconds) },
    changeType: { S: String(event.changeType || '') },
    s3Key: { S: String(event.s3Key || '') },
    diffScore: { N: String(details.diffScore ?? 0) },
    facesDetected: { N: String(details.facesDetected ?? 0) },
    chewingState: { S: String(details.chewingState || '') },
    timestamp: { S: String(event.timestamp || new Date().toISOString()) },
    expiresAt: { N: String(expiresAt) },
  };

  await ddbClient.send(new PutItemCommand({
    TableName: tableName,
    Item: item,
  }));

  console.log(`FrameChange saved: ${event.changeType} (device=${event.deviceId}, s3Key=${event.s3Key})`);
}

/**
 * GET /frame-changes — フレーム変化イベント一覧（presigned URL付き）
 */
export async function getFrameChangeEvents(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const tableName = process.env.FRAME_CHANGE_EVENTS_TABLE;
    if (!tableName) return response(500, { error: 'FRAME_CHANGE_EVENTS_TABLE not configured' });

    const deviceId = event.queryStringParameters?.deviceId || 'noeatstop-edge-device';
    const limit = Math.min(Number(event.queryStringParameters?.limit) || 50, 500);

    const result = await ddbClient.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'deviceId = :d',
      ExpressionAttributeValues: { ':d': { S: deviceId } },
      ScanIndexForward: false,
      Limit: limit,
    }));

    const bucket = process.env.VIDEO_BUCKET;
    const items = await Promise.all((result.Items || []).map(async (item) => {
      const s3Key = item.s3Key?.S || '';
      let evidenceUrl = '';
      if (bucket && s3Key) {
        try {
          evidenceUrl = await getSignedUrl(
            s3Client,
            new GetObjectCommand({ Bucket: bucket, Key: s3Key }),
            { expiresIn: 3600 },
          );
        } catch { /* presigned URL 生成失敗は無視 */ }
      }

      return {
        deviceId: item.deviceId?.S,
        epochSeconds: Number(item.epochSeconds?.N),
        changeType: item.changeType?.S,
        s3Key,
        evidenceUrl,
        diffScore: Number(item.diffScore?.N),
        facesDetected: Number(item.facesDetected?.N),
        chewingState: item.chewingState?.S,
        timestamp: item.timestamp?.S,
      };
    }));

    return response(200, { items, count: items.length });
  } catch (err) {
    return response(500, { error: (err as Error).message });
  }
}
