import { EdgeProcessor, FrameAnalysis } from '../../lib/services/edge-processor';
import { MockIoTCorePublisher } from '../../lib/services/iot-core-publisher';
import { MockTVController } from '../../lib/services/tv-control-service';
import { DEFAULT_SYSTEM_CONFIGURATION, SystemConfiguration } from '../../lib/models/types';

/**
 * 食事セッションワークフロー統合テスト
 *
 * 食事開始→咀嚼→咀嚼停止→TV OFF→咀嚼再開→TV ON→食事終了 の完全フローをテスト
 */
describe('Meal Session Workflow Integration', () => {
  let processor: EdgeProcessor;
  let publisher: MockIoTCorePublisher;
  let tvController: MockTVController;
  const deviceId = 'test-edge-device';

  const chewingFrame: FrameAnalysis = {
    faceDetected: true,
    chewingDetected: true,
    confidence: 0.95,
    childrenDetected: 1,
    adultsDetected: 0,
  };

  const stoppedFrame: FrameAnalysis = {
    faceDetected: true,
    chewingDetected: false,
    confidence: 0.9,
    childrenDetected: 1,
    adultsDetected: 0,
  };

  const noFaceFrame: FrameAnalysis = {
    faceDetected: false,
    chewingDetected: false,
    confidence: 0.95,
    childrenDetected: 0,
    adultsDetected: 0,
  };

  beforeEach(() => {
    publisher = new MockIoTCorePublisher();
    tvController = new MockTVController();
    const config: SystemConfiguration = {
      ...DEFAULT_SYSTEM_CONFIGURATION,
      pauseThreshold: 0, // テスト用: 即時判定
    };
    processor = new EdgeProcessor(publisher, tvController, deviceId, config);
  });

  it('should complete full meal workflow: chewing → stop → TV OFF → resume → TV ON → meal end', async () => {
    // Phase 1: 咀嚼開始
    const r1 = await processor.processFrame(chewingFrame);
    expect(r1.state).toBe('chewing');
    expect(tvController.getState()).toBe('on');

    // Phase 2: 咀嚼停止（chewing→chewing_stopped）→ pauseThreshold=0 なので即 TV OFF
    const r2 = await processor.processFrame(stoppedFrame);
    expect(r2.state).toBe('chewing_stopped');
    expect(r2.shouldControlTV).toBe(true);
    expect(r2.tvAction).toBe('turn_off');
    expect(tvController.getState()).toBe('off');

    // Phase 3: 咀嚼停止継続 → 引き続き TV OFF
    const r3 = await processor.processFrame(stoppedFrame);
    expect(r3.state).toBe('chewing_stopped');
    expect(r3.shouldControlTV).toBe(true);
    expect(r3.tvAction).toBe('turn_off');

    // Phase 4: 咀嚼再開 → TV ON
    const r4 = await processor.processFrame(chewingFrame);
    expect(r4.state).toBe('chewing');
    expect(r4.shouldControlTV).toBe(true);
    expect(r4.tvAction).toBe('turn_on');
    expect(tvController.getState()).toBe('on');

    // Phase 5: 食事終了（顔非検出）→ TV OFF
    const r5 = await processor.processFrame(noFaceFrame);
    expect(r5.state).toBe('meal_ended');
    expect(r5.shouldControlTV).toBe(true);
    expect(r5.tvAction).toBe('turn_off');
    expect(tvController.getState()).toBe('off');

    // IoT Core メッセージ検証
    const stateMessages = publisher.getMessagesByTopic(`noeatstop/${deviceId}/eating-state`);
    expect(stateMessages.length).toBeGreaterThanOrEqual(3);

    const tvMessages = publisher.getMessagesByTopic(`noeatstop/${deviceId}/tv-control`);
    expect(tvMessages.length).toBe(4); // OFF, OFF, ON, OFF

    // TV制御履歴検証
    const tvHistory = tvController.getHistory();
    expect(tvHistory).toHaveLength(4);
    expect(tvHistory[0].action).toBe('turn_off');
    expect(tvHistory[1].action).toBe('turn_off');
    expect(tvHistory[2].action).toBe('turn_on');
    expect(tvHistory[3].action).toBe('turn_off');
  });

  it('should handle multiple children scenario', async () => {
    const config: SystemConfiguration = {
      ...DEFAULT_SYSTEM_CONFIGURATION,
      pauseThreshold: 0,
      childCount: 2,
    };
    processor.updateConfig(config);

    // 2人の子供が検出されて咀嚼中
    const twoChildrenChewing: FrameAnalysis = {
      ...chewingFrame,
      childrenDetected: 2,
    };
    const r1 = await processor.processFrame(twoChildrenChewing);
    expect(r1.state).toBe('chewing');

    // 1人が咀嚼停止（まだ1人は咀嚼中とする場合、フレーム全体では chewing として検出される前提）
    const r2 = await processor.processFrame(twoChildrenChewing);
    expect(r2.state).toBe('chewing');
  });

  it('should exclude adults when configured', async () => {
    const config: SystemConfiguration = {
      ...DEFAULT_SYSTEM_CONFIGURATION,
      excludeAdults: true,
      pauseThreshold: 0,
    };
    processor.updateConfig(config);

    // 大人のみ（子供なし）→ 前回の状態を維持
    const adultsOnly: FrameAnalysis = {
      faceDetected: true,
      chewingDetected: false,
      confidence: 0.9,
      childrenDetected: 0,
      adultsDetected: 2,
    };

    const r1 = await processor.processFrame(adultsOnly);
    expect(r1.state).toBe('chewing'); // lastState は初期値 chewing なので維持

    // 子供が登場 → 正常に判定
    const r2 = await processor.processFrame(stoppedFrame);
    expect(r2.state).toBe('chewing_stopped');
  });

  it('should send to cloud when confidence is low', async () => {
    const lowConfidence: FrameAnalysis = {
      ...chewingFrame,
      confidence: 0.5,
    };

    const result = await processor.processFrame(lowConfidence);
    expect(result.shouldSendToCloud).toBe(true);
  });

  it('should not send to cloud when confidence is high', async () => {
    const result = await processor.processFrame(chewingFrame);
    expect(result.shouldSendToCloud).toBe(false);
  });
});
