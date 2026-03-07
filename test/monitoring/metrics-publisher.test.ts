import { MockMetricsPublisher } from '../../lib/monitoring/metrics-publisher';

describe('MockMetricsPublisher', () => {
  let publisher: MockMetricsPublisher;

  beforeEach(() => {
    publisher = new MockMetricsPublisher();
  });

  it('should publish single metric', async () => {
    await publisher.publishMetric('SessionDuration', 600, 'Seconds');
    const metrics = publisher.getPublishedMetrics();
    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toEqual({ name: 'SessionDuration', value: 600, unit: 'Seconds' });
  });

  it('should publish session metrics', async () => {
    await publisher.publishSessionMetrics('session-001', {
      totalDuration: 600,
      chewingStopCount: 3,
      faceDetectionAccuracy: 0.9,
      tvControlSuccessRate: 1.0,
    });
    const metrics = publisher.getPublishedMetrics();
    expect(metrics).toHaveLength(4);
    expect(metrics.find(m => m.name === 'SessionDuration')?.value).toBe(600);
    expect(metrics.find(m => m.name === 'ChewingStopCount')?.value).toBe(3);
    expect(metrics.find(m => m.name === 'FaceDetectionAccuracy')?.value).toBe(90);
    expect(metrics.find(m => m.name === 'TVControlSuccessRate')?.value).toBe(100);
  });

  it('should skip null metrics', async () => {
    await publisher.publishSessionMetrics('session-001', {
      totalDuration: 600,
    });
    const metrics = publisher.getPublishedMetrics();
    expect(metrics).toHaveLength(1);
  });

  it('should clear metrics', async () => {
    await publisher.publishMetric('SessionDuration', 600, 'Seconds');
    publisher.clearMetrics();
    expect(publisher.getPublishedMetrics()).toHaveLength(0);
  });
});
