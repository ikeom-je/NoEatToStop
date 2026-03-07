import { SystemConfiguration, EatingStateType, DEFAULT_SYSTEM_CONFIGURATION } from '../models/types';

export interface FrameAnalysis {
  faceDetected: boolean;
  mouthPosition?: { x: number; y: number };
  chewingDetected: boolean;
  confidence: number;
  childrenDetected: number;
  adultsDetected: number;
}

export interface EdgeProcessorResult {
  state: EatingStateType;
  confidence: number;
  shouldControlTV: boolean;
  tvAction?: 'turn_off' | 'turn_on';
  shouldSendToCloud: boolean;
  analysis: FrameAnalysis;
}

export interface IoTCorePublisher {
  publish(topic: string, payload: Record<string, unknown>): Promise<void>;
}

export interface TVController {
  controlTV(action: 'turn_off' | 'turn_on'): Promise<boolean>;
}

export class EdgeProcessor {
  private chewingStoppedSince: number | null = null;
  private lastState: EatingStateType = 'chewing';

  constructor(
    private readonly iotPublisher: IoTCorePublisher,
    private readonly tvController: TVController,
    private readonly deviceId: string = 'noeatstop-edge-device',
    private config: SystemConfiguration = DEFAULT_SYSTEM_CONFIGURATION,
  ) {}

  updateConfig(config: SystemConfiguration): void {
    this.config = config;
  }

  /**
   * フレームを解析して食事状態を判定（外部からの解析結果を受け取る）
   */
  async processFrame(analysis: FrameAnalysis): Promise<EdgeProcessorResult> {
    const state = this.determineState(analysis);
    const now = Date.now();

    // 咀嚼停止時間の追跡
    if (state === 'chewing_stopped') {
      if (this.chewingStoppedSince === null) {
        this.chewingStoppedSince = now;
      }
    } else {
      this.chewingStoppedSince = null;
    }

    // TV制御判定
    const { shouldControlTV, tvAction } = this.evaluateTVControl(state, now);
    const shouldSendToCloud = analysis.confidence < this.config.confidenceThreshold;

    const result: EdgeProcessorResult = {
      state,
      confidence: analysis.confidence,
      shouldControlTV,
      tvAction,
      shouldSendToCloud,
      analysis,
    };

    // TV制御実行
    if (shouldControlTV && tvAction) {
      const success = await this.tvController.controlTV(tvAction);
      await this.iotPublisher.publish(
        `noeatstop/${this.deviceId}/tv-control`,
        { action: tvAction, success, timestamp: now },
      );
    }

    // IoT Core へ状態通知
    if (state !== this.lastState || shouldSendToCloud) {
      await this.iotPublisher.publish(
        `noeatstop/${this.deviceId}/eating-state`,
        {
          state,
          confidence: analysis.confidence,
          childrenDetected: analysis.childrenDetected,
          faceDetected: analysis.faceDetected,
          chewingDetected: analysis.chewingDetected,
          timestamp: now,
        },
      );
    }

    this.lastState = state;
    return result;
  }

  private determineState(analysis: FrameAnalysis): EatingStateType {
    if (!analysis.faceDetected) {
      return 'meal_ended';
    }

    // 大人除外設定の場合、子供が検出されていなければ無視
    if (this.config.excludeAdults && analysis.childrenDetected === 0 && analysis.adultsDetected > 0) {
      return this.lastState;
    }

    if (analysis.chewingDetected && analysis.confidence >= this.config.chewingDetectionThreshold) {
      return 'chewing';
    }

    return 'chewing_stopped';
  }

  private evaluateTVControl(state: EatingStateType, now: number): { shouldControlTV: boolean; tvAction?: 'turn_off' | 'turn_on' } {
    if (state === 'chewing' && this.lastState === 'chewing_stopped') {
      return { shouldControlTV: true, tvAction: 'turn_on' };
    }

    if (state === 'chewing_stopped' && this.chewingStoppedSince !== null) {
      const stoppedDuration = (now - this.chewingStoppedSince) / 1000;
      if (stoppedDuration >= this.config.pauseThreshold) {
        return { shouldControlTV: true, tvAction: 'turn_off' };
      }
    }

    if (state === 'meal_ended') {
      return { shouldControlTV: true, tvAction: 'turn_off' };
    }

    return { shouldControlTV: false };
  }

  getChewingStoppedDuration(): number | null {
    if (this.chewingStoppedSince === null) return null;
    return (Date.now() - this.chewingStoppedSince) / 1000;
  }
}
