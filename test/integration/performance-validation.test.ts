import { EdgeProcessor, FrameAnalysis } from '../../lib/services/edge-processor';
import { MockIoTCorePublisher } from '../../lib/services/iot-core-publisher';
import { MockTVController } from '../../lib/services/tv-control-service';
import { AnalyticsService } from '../../lib/monitoring/analytics-service';
import { MockMetricsPublisher } from '../../lib/monitoring/metrics-publisher';
import { MealSession, DEFAULT_SYSTEM_CONFIGURATION } from '../../lib/models/types';

/**
 * パフォーマンスバリデーションテスト
 *
 * 3秒以内の応答時間ターゲット、メトリクス集計の正確性をテスト
 */
describe('Performance Validation', () => {
  describe('Edge processing latency', () => {
    it('should process frame within 100ms', async () => {
      const publisher = new MockIoTCorePublisher();
      const tvController = new MockTVController();
      const processor = new EdgeProcessor(publisher, tvController, 'perf-test');

      const frame: FrameAnalysis = {
        faceDetected: true,
        chewingDetected: true,
        confidence: 0.95,
        childrenDetected: 1,
        adultsDetected: 0,
      };

      const start = performance.now();
      await processor.processFrame(frame);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100); // 100ms 以内
    });

    it('should process 100 consecutive frames within 3 seconds', async () => {
      const publisher = new MockIoTCorePublisher();
      const tvController = new MockTVController();
      const processor = new EdgeProcessor(publisher, tvController, 'perf-test');

      const frames: FrameAnalysis[] = Array.from({ length: 100 }, (_, i) => ({
        faceDetected: true,
        chewingDetected: i % 3 !== 0, // 3フレームごとに咀嚼停止
        confidence: 0.85 + Math.random() * 0.1,
        childrenDetected: 1,
        adultsDetected: 0,
      }));

      const start = performance.now();
      for (const frame of frames) {
        await processor.processFrame(frame);
      }
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(3000); // 3秒以内
    });
  });

  describe('Analytics accuracy', () => {
    it('should correctly aggregate multi-session performance metrics', () => {
      const service = new AnalyticsService();
      const sessions: MealSession[] = [
        {
          sessionId: 'session-001',
          startTime: '2025-02-07T10:00:00Z',
          endTime: '2025-02-07T10:10:00Z',
          status: 'completed',
          totalDuration: 600,
          chewingDuration: 500,
          chewingStopCount: 3,
          averageConfidence: 0.9,
          childrenCount: 1,
          performanceMetrics: {
            faceDetectionAccuracy: 0.95,
            chewingDetectionAccuracy: 0.88,
            tvControlSuccessRate: 1.0,
            mealStartDetectionTime: 2.5,
            mealEndDetectionTime: 3.0,
          },
        },
        {
          sessionId: 'session-002',
          startTime: '2025-02-07T12:00:00Z',
          endTime: '2025-02-07T12:15:00Z',
          status: 'completed',
          totalDuration: 900,
          chewingDuration: 750,
          chewingStopCount: 5,
          averageConfidence: 0.85,
          childrenCount: 2,
          performanceMetrics: {
            faceDetectionAccuracy: 0.90,
            chewingDetectionAccuracy: 0.82,
            tvControlSuccessRate: 0.8,
            mealStartDetectionTime: 3.0,
            mealEndDetectionTime: 2.5,
          },
        },
      ];

      const analytics = service.analyzeSessions(sessions);

      expect(analytics.totalSessions).toBe(2);
      expect(analytics.averageDuration).toBe(750);
      expect(analytics.totalChewingStops).toBe(8);
      expect(analytics.averageChewingStopCount).toBe(4);
      expect(analytics.performanceSummary.faceDetectionAccuracy).toBeCloseTo(0.925);
      expect(analytics.performanceSummary.chewingDetectionAccuracy).toBeCloseTo(0.85);
      expect(analytics.performanceSummary.tvControlSuccessRate).toBeCloseTo(0.9);
    });
  });

  describe('Metrics publishing', () => {
    it('should publish all session metrics correctly', async () => {
      const publisher = new MockMetricsPublisher();

      await publisher.publishSessionMetrics('session-001', {
        totalDuration: 600,
        chewingStopCount: 3,
        faceDetectionAccuracy: 0.95,
        chewingDetectionAccuracy: 0.88,
        tvControlSuccessRate: 1.0,
      });

      const metrics = publisher.getPublishedMetrics();
      expect(metrics).toHaveLength(5);

      const names = metrics.map(m => m.name);
      expect(names).toContain('SessionDuration');
      expect(names).toContain('ChewingStopCount');
      expect(names).toContain('FaceDetectionAccuracy');
      expect(names).toContain('ChewingDetectionAccuracy');
      expect(names).toContain('TVControlSuccessRate');
    });
  });
});
