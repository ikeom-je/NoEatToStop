import { IoTDataPlaneClient, PublishCommand } from '@aws-sdk/client-iot-data-plane';
import { IoTCorePublisher } from './edge-processor';

export class AwsIoTCorePublisher implements IoTCorePublisher {
  constructor(
    private readonly iotClient: IoTDataPlaneClient,
  ) {}

  async publish(topic: string, payload: Record<string, unknown>): Promise<void> {
    await this.iotClient.send(new PublishCommand({
      topic,
      payload: Buffer.from(JSON.stringify(payload)),
      qos: 1,
    }));
  }
}

export class MockIoTCorePublisher implements IoTCorePublisher {
  private messages: Array<{ topic: string; payload: Record<string, unknown> }> = [];

  async publish(topic: string, payload: Record<string, unknown>): Promise<void> {
    this.messages.push({ topic, payload });
  }

  getMessages(): Array<{ topic: string; payload: Record<string, unknown> }> {
    return [...this.messages];
  }

  getMessagesByTopic(topic: string): Array<Record<string, unknown>> {
    return this.messages
      .filter(m => m.topic === topic)
      .map(m => m.payload);
  }

  clearMessages(): void {
    this.messages = [];
  }
}
