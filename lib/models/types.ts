// 食事セッション状態
export type MealSessionStatus = 'active' | 'completed' | 'interrupted';

// 食事状態
export type EatingStateType = 'chewing' | 'chewing_stopped' | 'meal_ended';

// 分析ソース
export type AnalysisSource = 'edge' | 'rekognition' | 'bedrock';

// TV制御方式
export type TVControlMethod = 'smart_tv_api' | 'alexa_voice' | 'mock';

// パフォーマンスメトリクス
export interface PerformanceMetrics {
  mealStartDetectionTime?: number;
  mealEndDetectionTime?: number;
  faceDetectionAccuracy?: number;
  mouthDetectionAccuracy?: number;
  chewingDetectionAccuracy?: number;
  tvControlSuccessRate?: number;
}

// 食事セッション
export interface MealSession {
  sessionId: string;
  startTime: string;
  endTime?: string;
  status: MealSessionStatus;
  totalDuration?: number;
  chewingDuration?: number;
  chewingStopCount?: number;
  averageConfidence?: number;
  videoS3Key?: string;
  childrenCount?: number;
  performanceMetrics?: PerformanceMetrics;
}

// 食事状態メタデータ
export interface EatingStateMetadata {
  faceDetected?: boolean;
  mouthPosition?: { x: number; y: number };
  chewingDetected?: boolean;
  chewingDuration?: number;
  tvStatus?: 'on' | 'off';
  childrenDetected?: number;
  adultsDetected?: number;
}

// 食事状態レコード
export interface EatingState {
  sessionId: string;
  timestamp: number;
  state: EatingStateType;
  confidence: number;
  analysisSource: AnalysisSource;
  metadata?: EatingStateMetadata;
  errorFlag?: boolean;
  imageS3Key?: string;
  videoS3Key?: string;
  ttl?: number;
}

// システム設定
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
  tvControlMethod: TVControlMethod;
  tvControlRetryCount: number;
  tvControlRetryInterval: number;
}

// システム設定のデフォルト値
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

// SystemSettings テーブルの行
export interface SystemSettingItem {
  settingKey: string;
  settingValue: string;
  lastUpdated: string;
}
