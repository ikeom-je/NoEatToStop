import { CloudWatchClient, PutMetricDataCommand, type MetricDatum } from '@aws-sdk/client-cloudwatch';

const NAMESPACE = 'NoEatToStop';

export type MetricName =
  | 'MealStartDetectionTime'
  | 'MealEndDetectionTime'
  | 'FaceDetectionAccuracy'
  | 'MouthDetectionAccuracy'
  | 'ChewingDetectionAccuracy'
  | 'TVControlSuccessRate'
  | 'ChewingStopCount'
  | 'SessionDuration'
  | 'EdgeProcessingLatency'
  | 'CloudProcessingLatency';

export class MetricsPublisher {
  constructor(
    private readonly client: CloudWatchClient,
    private readonly stage: string = 'dev',
  ) {}

  async publishMetric(
    metricName: MetricName,
    value: number,
    unit: 'Seconds' | 'Count' | 'Percent' | 'Milliseconds' = 'Count',
    dimensions: Record<string, string> = {},
  ): Promise<void> {
    const metricData: MetricDatum = {
      MetricName: metricName,
      Value: value,
      Unit: unit,
      Timestamp: new Date(),
      Dimensions: [
        { Name: 'Stage', Value: this.stage },
        ...Object.entries(dimensions).map(([Name, Value]) => ({ Name, Value })),
      ],
    };

    await this.client.send(new PutMetricDataCommand({
      Namespace: NAMESPACE,
      MetricData: [metricData],
    }));
  }

  async publishSessionMetrics(sessionId: string, metrics: {
    totalDuration?: number;
    chewingStopCount?: number;
    faceDetectionAccuracy?: number;
    chewingDetectionAccuracy?: number;
    tvControlSuccessRate?: number;
  }): Promise<void> {
    const dims = { SessionId: sessionId };
    const promises: Promise<void>[] = [];

    if (metrics.totalDuration != null) {
      promises.push(this.publishMetric('SessionDuration', metrics.totalDuration, 'Seconds', dims));
    }
    if (metrics.chewingStopCount != null) {
      promises.push(this.publishMetric('ChewingStopCount', metrics.chewingStopCount, 'Count', dims));
    }
    if (metrics.faceDetectionAccuracy != null) {
      promises.push(this.publishMetric('FaceDetectionAccuracy', metrics.faceDetectionAccuracy * 100, 'Percent', dims));
    }
    if (metrics.chewingDetectionAccuracy != null) {
      promises.push(this.publishMetric('ChewingDetectionAccuracy', metrics.chewingDetectionAccuracy * 100, 'Percent', dims));
    }
    if (metrics.tvControlSuccessRate != null) {
      promises.push(this.publishMetric('TVControlSuccessRate', metrics.tvControlSuccessRate * 100, 'Percent', dims));
    }

    await Promise.all(promises);
  }
}

export class MockMetricsPublisher extends MetricsPublisher {
  private publishedMetrics: Array<{ name: MetricName; value: number; unit: string }> = [];

  constructor() {
    super(null as unknown as CloudWatchClient, 'test');
  }

  async publishMetric(
    metricName: MetricName,
    value: number,
    unit: 'Seconds' | 'Count' | 'Percent' | 'Milliseconds' = 'Count',
  ): Promise<void> {
    this.publishedMetrics.push({ name: metricName, value, unit });
  }

  getPublishedMetrics() {
    return [...this.publishedMetrics];
  }

  clearMetrics() {
    this.publishedMetrics = [];
  }
}
