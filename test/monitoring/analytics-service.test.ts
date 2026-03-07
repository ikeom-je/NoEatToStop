import { AnalyticsService } from '../../lib/monitoring/analytics-service';
import { MealSession } from '../../lib/models/types';

describe('AnalyticsService', () => {
  const service = new AnalyticsService();

  const makeSessions = (overrides: Partial<MealSession>[] = []): MealSession[] => {
    const base: MealSession = {
      sessionId: 'session-001',
      startTime: '2025-02-07T10:00:00Z',
      status: 'completed',
      totalDuration: 600,
      chewingStopCount: 3,
      averageConfidence: 0.85,
      childrenCount: 1,
      performanceMetrics: {
        faceDetectionAccuracy: 0.9,
        chewingDetectionAccuracy: 0.85,
        tvControlSuccessRate: 1.0,
      },
    };
    if (overrides.length === 0) return [base];
    return overrides.map((o, i) => ({
      ...base,
      sessionId: `session-${String(i + 1).padStart(3, '0')}`,
      ...o,
    }));
  };

  it('should return zeros for empty sessions', () => {
    const result = service.analyzeSessions([]);
    expect(result.totalSessions).toBe(0);
    expect(result.averageDuration).toBe(0);
    expect(result.totalChewingStops).toBe(0);
  });

  it('should calculate basic analytics for single session', () => {
    const result = service.analyzeSessions(makeSessions());
    expect(result.totalSessions).toBe(1);
    expect(result.averageDuration).toBe(600);
    expect(result.averageChewingStopCount).toBe(3);
    expect(result.totalChewingStops).toBe(3);
    expect(result.averageConfidence).toBeCloseTo(0.85);
  });

  it('should calculate averages for multiple sessions', () => {
    const sessions = makeSessions([
      { totalDuration: 600, chewingStopCount: 2, averageConfidence: 0.8 },
      { totalDuration: 900, chewingStopCount: 4, averageConfidence: 0.9 },
    ]);
    const result = service.analyzeSessions(sessions);
    expect(result.totalSessions).toBe(2);
    expect(result.averageDuration).toBe(750);
    expect(result.averageChewingStopCount).toBe(3);
    expect(result.totalChewingStops).toBe(6);
    expect(result.averageConfidence).toBeCloseTo(0.85);
  });

  it('should aggregate performance metrics', () => {
    const sessions = makeSessions([
      {
        performanceMetrics: {
          faceDetectionAccuracy: 0.8,
          chewingDetectionAccuracy: 0.7,
          tvControlSuccessRate: 1.0,
        },
      },
      {
        performanceMetrics: {
          faceDetectionAccuracy: 0.9,
          chewingDetectionAccuracy: 0.9,
          tvControlSuccessRate: 0.8,
        },
      },
    ]);
    const result = service.analyzeSessions(sessions);
    expect(result.performanceSummary.faceDetectionAccuracy).toBeCloseTo(0.85);
    expect(result.performanceSummary.chewingDetectionAccuracy).toBeCloseTo(0.8);
    expect(result.performanceSummary.tvControlSuccessRate).toBeCloseTo(0.9);
  });

  it('should handle sessions without performance metrics', () => {
    const sessions = makeSessions([
      { performanceMetrics: undefined },
    ]);
    const result = service.analyzeSessions(sessions);
    expect(result.performanceSummary.faceDetectionAccuracy).toBeUndefined();
  });

  it('should only use completed sessions for duration average', () => {
    const sessions = makeSessions([
      { status: 'completed', totalDuration: 600 },
      { status: 'active', totalDuration: undefined },
    ]);
    const result = service.analyzeSessions(sessions);
    expect(result.averageDuration).toBe(600);
  });
});
