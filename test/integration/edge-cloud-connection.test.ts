import { EdgeProcessor, FrameAnalysis } from '../../lib/services/edge-processor';
import { MockIoTCorePublisher } from '../../lib/services/iot-core-publisher';
import { MockTVController } from '../../lib/services/tv-control-service';
import { RetryTVController } from '../../lib/services/tv-control-service';
import { TVController } from '../../lib/services/edge-processor';
import { DEFAULT_SYSTEM_CONFIGURATION, SystemConfiguration } from '../../lib/models/types';

/**
 * エッジ-クラウド接続統合テスト
 *
 * ネットワーク障害、カメラ障害、TVリトライメカニズムのテスト
 */
describe('Edge-Cloud Connection Integration', () => {
  const deviceId = 'test-edge-device';

  const chewingFrame: FrameAnalysis = {
    faceDetected: true,
    chewingDetected: true,
    confidence: 0.95,
    childrenDetected: 1,
    adultsDetected: 0,
  };

  describe('IoT Core publish error handling', () => {
    it('should propagate error when publish fails on state change', async () => {
      const failingPublisher = {
        publish: jest.fn().mockRejectedValue(new Error('Network error')),
      };
      const tvController = new MockTVController();
      const processor = new EdgeProcessor(failingPublisher, tvController, deviceId);

      // 初回 chewing → lastState も chewing なので publish されない（成功）
      await processor.processFrame(chewingFrame);

      // 状態変化: chewing → chewing_stopped → publish が呼ばれてエラーになる
      const stoppedFrame: FrameAnalysis = { ...chewingFrame, chewingDetected: false };
      await expect(processor.processFrame(stoppedFrame)).rejects.toThrow('Network error');
    });

    it('should not call publish when state is unchanged and confidence is high', async () => {
      const publisher = {
        publish: jest.fn().mockResolvedValue(undefined),
      };
      const tvController = new MockTVController();
      const processor = new EdgeProcessor(publisher, tvController, deviceId);

      // 初回 chewing → publish されない
      await processor.processFrame(chewingFrame);
      expect(publisher.publish).not.toHaveBeenCalled();

      // 2回目も chewing → publish されない
      await processor.processFrame(chewingFrame);
      expect(publisher.publish).not.toHaveBeenCalled();
    });
  });

  describe('TV control retry mechanism', () => {
    it('should retry TV control with configured interval', async () => {
      let attempts = 0;
      const failOnce: TVController = {
        controlTV: async (action) => {
          attempts++;
          if (attempts === 1) return false;
          return true;
        },
      };

      const retryController = new RetryTVController(failOnce, 1, 10); // 10ms間隔
      const result = await retryController.controlTV('turn_off');

      expect(result).toBe(true);
      expect(attempts).toBe(2);
    });

    it('should handle TV control total failure after retries', async () => {
      const alwaysFail: TVController = {
        controlTV: async () => false,
      };

      const retryController = new RetryTVController(alwaysFail, 1, 10);
      const result = await retryController.controlTV('turn_off');

      expect(result).toBe(false);
    });

    it('should handle TV control exception and retry', async () => {
      let attempts = 0;
      const throwOnce: TVController = {
        controlTV: async () => {
          attempts++;
          if (attempts === 1) throw new Error('TV connection lost');
          return true;
        },
      };

      const retryController = new RetryTVController(throwOnce, 1, 10);
      const result = await retryController.controlTV('turn_off');

      expect(result).toBe(true);
      expect(attempts).toBe(2);
    });
  });

  describe('Edge-only processing on network failure', () => {
    it('should track chewing state locally even without cloud', async () => {
      const publisher = new MockIoTCorePublisher();
      const tvController = new MockTVController();
      const config: SystemConfiguration = {
        ...DEFAULT_SYSTEM_CONFIGURATION,
        pauseThreshold: 0,
      };
      const processor = new EdgeProcessor(publisher, tvController, deviceId, config);

      // エッジ側で状態追跡が正常に動作
      await processor.processFrame(chewingFrame);
      expect(processor.getChewingStoppedDuration()).toBeNull();

      const stoppedFrame: FrameAnalysis = { ...chewingFrame, chewingDetected: false };
      await processor.processFrame(stoppedFrame);
      expect(processor.getChewingStoppedDuration()).not.toBeNull();
    });
  });

  describe('Configuration update during operation', () => {
    it('should apply new configuration without restart', async () => {
      const publisher = new MockIoTCorePublisher();
      const tvController = new MockTVController();
      const processor = new EdgeProcessor(publisher, tvController, deviceId);

      // デフォルト設定で処理
      await processor.processFrame(chewingFrame);

      // 設定変更
      const newConfig: SystemConfiguration = {
        ...DEFAULT_SYSTEM_CONFIGURATION,
        chewingDetectionThreshold: 0.99,
      };
      processor.updateConfig(newConfig);

      // 新しい設定が即座に反映される
      const result = await processor.processFrame(chewingFrame);
      expect(result.state).toBe('chewing_stopped'); // 0.95 < 0.99 なので stopped
    });
  });
});
