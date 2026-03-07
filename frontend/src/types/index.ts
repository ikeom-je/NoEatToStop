export interface MealSession {
  sessionId: string;
  startTime: string;
  endTime?: string;
  status: 'active' | 'completed' | 'interrupted';
  totalDuration?: number;
  chewingDuration?: number;
  chewingStopCount?: number;
  averageConfidence?: number;
  videoS3Key?: string;
  childrenCount?: number;
  performanceMetrics?: PerformanceMetrics;
}

export interface PerformanceMetrics {
  mealStartDetectionTime?: number;
  mealEndDetectionTime?: number;
  faceDetectionAccuracy?: number;
  mouthDetectionAccuracy?: number;
  chewingDetectionAccuracy?: number;
  tvControlSuccessRate?: number;
}

export interface EatingState {
  sessionId: string;
  timestamp: number;
  state: EatingStateType;
  confidence: number;
  analysisSource: 'edge' | 'rekognition' | 'bedrock';
  metadata?: EatingStateMetadata;
  errorFlag?: boolean;
  imageS3Key?: string;
  videoS3Key?: string;
}

export type EatingStateType = 'chewing' | 'chewing_stopped' | 'meal_ended';

export interface EatingStateMetadata {
  faceDetected?: boolean;
  mouthPosition?: { x: number; y: number };
  chewingDetected?: boolean;
  chewingDuration?: number;
  tvStatus?: 'on' | 'off';
  childrenDetected?: number;
  adultsDetected?: number;
}

export interface SystemConfiguration {
  pauseThreshold: number;
  confidenceThreshold: number;
  videoBufferDuration: number;
  analysisVideoDuration: number;
  videoRetentionDays: number;
  videoResolution: string;
  videoFrameRate: number;
  liveVideoUpdateInterval: number;
  faceDetectionThreshold: number;
  mouthDetectionThreshold: number;
  chewingDetectionThreshold: number;
  childCount: number;
  excludeAdults: boolean;
  tvControlMethod: 'smart_tv_api' | 'alexa_voice' | 'mock';
  tvControlRetryCount: number;
  tvControlRetryInterval: number;
}

export const DEFAULT_SYSTEM_CONFIGURATION: SystemConfiguration = {
  pauseThreshold: 10,
  confidenceThreshold: 0.8,
  videoBufferDuration: 10,
  analysisVideoDuration: 20,
  videoRetentionDays: 1,
  videoResolution: '640x360',
  videoFrameRate: 30,
  liveVideoUpdateInterval: 3,
  faceDetectionThreshold: 0.8,
  mouthDetectionThreshold: 0.8,
  chewingDetectionThreshold: 0.8,
  childCount: 1,
  excludeAdults: false,
  tvControlMethod: 'smart_tv_api',
  tvControlRetryCount: 1,
  tvControlRetryInterval: 3,
};

export interface TVControlRecord {
  sessionId: string;
  action: 'turn_off' | 'turn_on';
  timestamp: number;
  reason: string;
  success: boolean;
  method: string;
  error?: string;
}

export interface TVControlStatus {
  sessionId: string;
  isRequesting: boolean;
  lastAction?: string;
  lastTimestamp?: number;
  requestCount: number;
}
