import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

export interface VideoSegment {
  sessionId: string;
  timestamp: number;
  data: Buffer;
  contentType?: string;
}

export interface FrameCapture {
  sessionId: string;
  timestamp: number;
  data: Buffer;
  contentType?: string;
}

export class VideoStorageService {
  constructor(
    private readonly s3Client: S3Client,
    private readonly bucketName: string,
  ) {}

  /**
   * 食事セッション動画をS3にアップロード
   */
  async uploadVideo(segment: VideoSegment): Promise<string> {
    const date = new Date(segment.timestamp).toISOString().split('T')[0];
    const key = `daily/${date}/session-${segment.sessionId}/raw-video.mp4`;

    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: segment.data,
      ContentType: segment.contentType || 'video/mp4',
    }));

    return key;
  }

  /**
   * 分析フレーム画像をS3にアップロード
   */
  async uploadFrame(frame: FrameCapture): Promise<string> {
    const date = new Date(frame.timestamp).toISOString().split('T')[0];
    const key = `daily/${date}/session-${frame.sessionId}/analysis-frames/frame-${frame.timestamp}.jpg`;

    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: frame.data,
      ContentType: frame.contentType || 'image/jpeg',
    }));

    return key;
  }

  /**
   * セッションメタデータをS3にアップロード
   */
  async uploadMetadata(sessionId: string, timestamp: number, metadata: Record<string, unknown>): Promise<string> {
    const date = new Date(timestamp).toISOString().split('T')[0];
    const key = `daily/${date}/session-${sessionId}/metadata.json`;

    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: JSON.stringify(metadata, null, 2),
      ContentType: 'application/json',
    }));

    return key;
  }

  /**
   * S3からオブジェクトを取得
   */
  async getObject(key: string): Promise<Buffer> {
    const result = await this.s3Client.send(new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    }));

    const stream = result.Body;
    if (!stream) throw new Error(`Object not found: ${key}`);

    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  /**
   * S3キーのパスを生成
   */
  buildVideoKey(sessionId: string, timestamp: number): string {
    const date = new Date(timestamp).toISOString().split('T')[0];
    return `daily/${date}/session-${sessionId}/raw-video.mp4`;
  }

  buildFrameKey(sessionId: string, timestamp: number): string {
    const date = new Date(timestamp).toISOString().split('T')[0];
    return `daily/${date}/session-${sessionId}/analysis-frames/frame-${timestamp}.jpg`;
  }
}
