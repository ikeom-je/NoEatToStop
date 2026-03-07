import { MockIoTCorePublisher } from '../../lib/services/iot-core-publisher';

describe('MockIoTCorePublisher', () => {
  let publisher: MockIoTCorePublisher;

  beforeEach(() => {
    publisher = new MockIoTCorePublisher();
  });

  it('should store published messages', async () => {
    await publisher.publish('test/topic', { key: 'value' });

    const messages = publisher.getMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      topic: 'test/topic',
      payload: { key: 'value' },
    });
  });

  it('should filter messages by topic', async () => {
    await publisher.publish('topic/a', { data: 1 });
    await publisher.publish('topic/b', { data: 2 });
    await publisher.publish('topic/a', { data: 3 });

    const topicA = publisher.getMessagesByTopic('topic/a');
    expect(topicA).toHaveLength(2);
    expect(topicA[0]).toEqual({ data: 1 });
    expect(topicA[1]).toEqual({ data: 3 });

    const topicB = publisher.getMessagesByTopic('topic/b');
    expect(topicB).toHaveLength(1);
  });

  it('should return empty array for unknown topic', async () => {
    const result = publisher.getMessagesByTopic('unknown');
    expect(result).toHaveLength(0);
  });

  it('should clear all messages', async () => {
    await publisher.publish('test/topic', { key: 'value' });
    publisher.clearMessages();
    expect(publisher.getMessages()).toHaveLength(0);
  });

  it('should return copies of messages (immutable)', async () => {
    await publisher.publish('test/topic', { key: 'value' });

    const messages1 = publisher.getMessages();
    const messages2 = publisher.getMessages();
    expect(messages1).not.toBe(messages2);
    expect(messages1).toEqual(messages2);
  });
});
