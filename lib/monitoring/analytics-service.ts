import type { MealSession, PerformanceMetrics } from '../models/types';

export interface SessionAnalytics {
  totalSessions: number;
  averageDuration: number;
  averageChewingStopCount: number;
  averageConfidence: number;
  totalChewingStops: number;
  performanceSummary: PerformanceMetrics;
}

export class AnalyticsService {
  analyzeSessions(sessions: MealSession[]): SessionAnalytics {
    if (sessions.length === 0) {
      return {
        totalSessions: 0,
        averageDuration: 0,
        averageChewingStopCount: 0,
        averageConfidence: 0,
        totalChewingStops: 0,
        performanceSummary: {},
      };
    }

    const completedSessions = sessions.filter(s => s.status === 'completed');
    const durations = completedSessions
      .map(s => s.totalDuration)
      .filter((d): d is number => d != null);
    const stopCounts = sessions
      .map(s => s.chewingStopCount)
      .filter((c): c is number => c != null);
    const confidences = sessions
      .map(s => s.averageConfidence)
      .filter((c): c is number => c != null);

    const metricsArrays = {
      faceDetectionAccuracy: [] as number[],
      mouthDetectionAccuracy: [] as number[],
      chewingDetectionAccuracy: [] as number[],
      tvControlSuccessRate: [] as number[],
      mealStartDetectionTime: [] as number[],
      mealEndDetectionTime: [] as number[],
    };

    for (const session of sessions) {
      const pm = session.performanceMetrics;
      if (!pm) continue;
      if (pm.faceDetectionAccuracy != null) metricsArrays.faceDetectionAccuracy.push(pm.faceDetectionAccuracy);
      if (pm.mouthDetectionAccuracy != null) metricsArrays.mouthDetectionAccuracy.push(pm.mouthDetectionAccuracy);
      if (pm.chewingDetectionAccuracy != null) metricsArrays.chewingDetectionAccuracy.push(pm.chewingDetectionAccuracy);
      if (pm.tvControlSuccessRate != null) metricsArrays.tvControlSuccessRate.push(pm.tvControlSuccessRate);
      if (pm.mealStartDetectionTime != null) metricsArrays.mealStartDetectionTime.push(pm.mealStartDetectionTime);
      if (pm.mealEndDetectionTime != null) metricsArrays.mealEndDetectionTime.push(pm.mealEndDetectionTime);
    }

    return {
      totalSessions: sessions.length,
      averageDuration: avg(durations),
      averageChewingStopCount: avg(stopCounts),
      averageConfidence: avg(confidences),
      totalChewingStops: sum(stopCounts),
      performanceSummary: {
        faceDetectionAccuracy: avgOrUndefined(metricsArrays.faceDetectionAccuracy),
        mouthDetectionAccuracy: avgOrUndefined(metricsArrays.mouthDetectionAccuracy),
        chewingDetectionAccuracy: avgOrUndefined(metricsArrays.chewingDetectionAccuracy),
        tvControlSuccessRate: avgOrUndefined(metricsArrays.tvControlSuccessRate),
        mealStartDetectionTime: avgOrUndefined(metricsArrays.mealStartDetectionTime),
        mealEndDetectionTime: avgOrUndefined(metricsArrays.mealEndDetectionTime),
      },
    };
  }
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

function avgOrUndefined(nums: number[]): number | undefined {
  if (nums.length === 0) return undefined;
  return avg(nums);
}
