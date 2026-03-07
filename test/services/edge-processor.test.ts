import { EdgeProcessor, FrameAnalysis, IoTCorePublisher, TVController } from '../../lib/services/edge-processor';
import { MockIoTCorePublisher } from '../../lib/services/iot-core-publisher';
import { MockTVController } from '../../lib/services/tv-control-service';
import { DEFAULT_SYSTEM_CONFIGURATION, SystemConfiguration } from '../../lib/models/types';

describe('EdgeProcessor', () => {
  let processor: EdgeProcessor;
  let mockPublisher: MockIoTCorePublisher;
  let mockTV: MockTVController;
  const deviceId = 'test-device';

  beforeEach(() => {
    mockPublisher = new MockIoTCorePublisher();
    mockTV = new MockTVController();
    processor = new EdgeProcessor(mockPublisher, mockTV, deviceId);
  });

  const makeAnalysis = (overrides: Partial<FrameAnalysis> = {}): FrameAnalysis => ({
    faceDetected: true,
    chewingDetected: true,
    confidence: 0.95,
    childrenDetected: 1,
    adultsDetected: 0,
    ...overrides,
  });

  describe('processFrame - 咀嚼検出', () => {
    it('should detect chewing state when chewing is detected', async () => {
      const result = await processor.processFrame(makeAnalysis());
      expect(result.state).toBe('chewing');
      expect(result.confidence).toBe(0.95);
    });

    it('should detect chewing_stopped when no chewing', async () => {
      const result = await processor.processFrame(makeAnalysis({ chewingDetected: false }));
      expect(result.state).toBe('chewing_stopped');
    });

    it('should detect meal_ended when no face detected', async () => {
      const result = await processor.processFrame(makeAnalysis({ faceDetected: false }));
      expect(result.state).toBe('meal_ended');
    });

    it('should treat low confidence chewing as chewing_stopped', async () => {
      const result = await processor.processFrame(makeAnalysis({
        chewingDetected: true,
        confidence: 0.3,
      }));
      expect(result.state).toBe('chewing_stopped');
    });
  });

  describe('processFrame - TV制御', () => {
    it('should turn on TV when chewing resumes after stop', async () => {
      // まず chewing_stopped 状態にする
      await processor.processFrame(makeAnalysis({ chewingDetected: false }));

      // 咀嚼再開
      const result = await processor.processFrame(makeAnalysis());
      expect(result.shouldControlTV).toBe(true);
      expect(result.tvAction).toBe('turn_on');
      expect(mockTV.getState()).toBe('on');
    });

    it('should turn off TV when chewing stopped exceeds threshold', async () => {
      const config: SystemConfiguration = {
        ...DEFAULT_SYSTEM_CONFIGURATION,
        pauseThreshold: 0, // 即時にTV OFF
      };
      processor.updateConfig(config);

      // chewing_stopped を2回送る (lastStateがchewing_stoppedになるため2回目で判定)
      await processor.processFrame(makeAnalysis({ chewingDetected: false }));
      const result = await processor.processFrame(makeAnalysis({ chewingDetected: false }));

      expect(result.shouldControlTV).toBe(true);
      expect(result.tvAction).toBe('turn_off');
    });

    it('should turn off TV when meal ends', async () => {
      const result = await processor.processFrame(makeAnalysis({ faceDetected: false }));
      expect(result.shouldControlTV).toBe(true);
      expect(result.tvAction).toBe('turn_off');
    });

    it('should not control TV when chewing continues normally', async () => {
      // 初回: chewing（lastStateもchewing）
      await processor.processFrame(makeAnalysis());
      // 2回目: まだ chewing
      const result = await processor.processFrame(makeAnalysis());
      expect(result.shouldControlTV).toBe(false);
    });
  });

  describe('processFrame - IoT Core通知', () => {
    it('should publish state change to IoT Core', async () => {
      // 初回: chewing（lastState=chewingと同じだが初回なので通知なし可能性）
      await processor.processFrame(makeAnalysis({ chewingDetected: false }));

      const messages = mockPublisher.getMessagesByTopic(`noeatstop/${deviceId}/eating-state`);
      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0]).toMatchObject({
        state: 'chewing_stopped',
        faceDetected: true,
      });
    });

    it('should publish TV control events', async () => {
      // meal_ended → TV OFF
      await processor.processFrame(makeAnalysis({ faceDetected: false }));

      const tvMessages = mockPublisher.getMessagesByTopic(`noeatstop/${deviceId}/tv-control`);
      expect(tvMessages.length).toBe(1);
      expect(tvMessages[0]).toMatchObject({
        action: 'turn_off',
        success: true,
      });
    });

    it('should send to cloud when confidence is below threshold', async () => {
      const result = await processor.processFrame(makeAnalysis({ confidence: 0.5 }));
      expect(result.shouldSendToCloud).toBe(true);
    });

    it('should not send to cloud when confidence is above threshold', async () => {
      const result = await processor.processFrame(makeAnalysis({ confidence: 0.95 }));
      expect(result.shouldSendToCloud).toBe(false);
    });
  });

  describe('processFrame - 大人除外', () => {
    it('should ignore adults when excludeAdults is enabled', async () => {
      const config: SystemConfiguration = {
        ...DEFAULT_SYSTEM_CONFIGURATION,
        excludeAdults: true,
      };
      processor.updateConfig(config);

      // 大人のみ検出（子供なし）→ 前回の状態を維持
      const result = await processor.processFrame(makeAnalysis({
        childrenDetected: 0,
        adultsDetected: 1,
      }));
      // lastState は初期値 'chewing' なのでそのまま維持
      expect(result.state).toBe('chewing');
    });

    it('should process normally when children are present even with excludeAdults', async () => {
      const config: SystemConfiguration = {
        ...DEFAULT_SYSTEM_CONFIGURATION,
        excludeAdults: true,
      };
      processor.updateConfig(config);

      const result = await processor.processFrame(makeAnalysis({
        childrenDetected: 1,
        adultsDetected: 1,
        chewingDetected: false,
      }));
      expect(result.state).toBe('chewing_stopped');
    });
  });

  describe('getChewingStoppedDuration', () => {
    it('should return null when chewing is active', async () => {
      await processor.processFrame(makeAnalysis());
      expect(processor.getChewingStoppedDuration()).toBeNull();
    });

    it('should return duration when chewing is stopped', async () => {
      await processor.processFrame(makeAnalysis({ chewingDetected: false }));
      const duration = processor.getChewingStoppedDuration();
      expect(duration).not.toBeNull();
      expect(duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('updateConfig', () => {
    it('should apply new configuration', async () => {
      const newConfig: SystemConfiguration = {
        ...DEFAULT_SYSTEM_CONFIGURATION,
        chewingDetectionThreshold: 0.99,
      };
      processor.updateConfig(newConfig);

      // confidence 0.95 は新しい閾値0.99未満なので chewing_stopped
      const result = await processor.processFrame(makeAnalysis({ confidence: 0.95 }));
      expect(result.state).toBe('chewing_stopped');
    });
  });
});
