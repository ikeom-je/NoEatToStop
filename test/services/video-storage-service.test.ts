import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { VideoStorageService } from '../../lib/services/video-storage-service';
import { Readable } from 'stream';
import { sdkStreamMixin } from '@smithy/util-stream';

const s3Mock = mockClient(S3Client);

describe('VideoStorageService', () => {
  let service: VideoStorageService;

  beforeEach(() => {
    s3Mock.reset();
    service = new VideoStorageService(
      s3Mock as unknown as S3Client,
      'noeatstop-videos-test',
    );
  });

  describe('uploadVideo', () => {
    it('should upload video with correct S3 key', async () => {
      s3Mock.on(PutObjectCommand).resolves({});

      const key = await service.uploadVideo({
        sessionId: 'session-001',
        timestamp: new Date('2025-02-07T10:00:00Z').getTime(),
        data: Buffer.from('video-data'),
      });

      expect(key).toBe('daily/2025-02-07/session-session-001/raw-video.mp4');
      const call = s3Mock.commandCalls(PutObjectCommand)[0];
      expect(call.args[0].input.Bucket).toBe('noeatstop-videos-test');
      expect(call.args[0].input.ContentType).toBe('video/mp4');
    });
  });

  describe('uploadFrame', () => {
    it('should upload frame with timestamp in key', async () => {
      s3Mock.on(PutObjectCommand).resolves({});
      const ts = new Date('2025-02-07T10:05:00Z').getTime();

      const key = await service.uploadFrame({
        sessionId: 'session-001',
        timestamp: ts,
        data: Buffer.from('frame-data'),
      });

      expect(key).toContain('analysis-frames/frame-');
      expect(key).toContain(`${ts}`);
    });
  });

  describe('uploadMetadata', () => {
    it('should upload metadata as JSON', async () => {
      s3Mock.on(PutObjectCommand).resolves({});
      const ts = new Date('2025-02-07T10:00:00Z').getTime();

      const key = await service.uploadMetadata('session-001', ts, { foo: 'bar' });

      expect(key).toContain('metadata.json');
      const call = s3Mock.commandCalls(PutObjectCommand)[0];
      expect(call.args[0].input.ContentType).toBe('application/json');
    });
  });

  describe('getObject', () => {
    it('should retrieve object from S3', async () => {
      const stream = new Readable();
      stream.push('test-content');
      stream.push(null);
      const sdkStream = sdkStreamMixin(stream);

      s3Mock.on(GetObjectCommand).resolves({ Body: sdkStream as any });

      const result = await service.getObject('daily/2025-02-07/session-001/metadata.json');
      expect(result.toString()).toBe('test-content');
    });
  });

  describe('buildVideoKey', () => {
    it('should build correct video S3 key', () => {
      const ts = new Date('2025-02-07T10:00:00Z').getTime();
      const key = service.buildVideoKey('session-001', ts);
      expect(key).toBe('daily/2025-02-07/session-session-001/raw-video.mp4');
    });
  });

  describe('buildFrameKey', () => {
    it('should build correct frame S3 key', () => {
      const ts = new Date('2025-02-07T10:05:00Z').getTime();
      const key = service.buildFrameKey('session-001', ts);
      expect(key).toContain('analysis-frames/frame-');
    });
  });
});
