import { MockTVController, RetryTVController } from '../../lib/services/tv-control-service';
import { TVController } from '../../lib/services/edge-processor';

describe('MockTVController', () => {
  let controller: MockTVController;

  beforeEach(() => {
    controller = new MockTVController();
  });

  it('should turn off TV', async () => {
    const result = await controller.controlTV('turn_off');
    expect(result).toBe(true);
    expect(controller.getState()).toBe('off');
  });

  it('should turn on TV', async () => {
    await controller.controlTV('turn_off');
    const result = await controller.controlTV('turn_on');
    expect(result).toBe(true);
    expect(controller.getState()).toBe('on');
  });

  it('should track control history', async () => {
    await controller.controlTV('turn_off');
    await controller.controlTV('turn_on');

    const history = controller.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0].action).toBe('turn_off');
    expect(history[1].action).toBe('turn_on');
    expect(history[0].success).toBe(true);
  });

  it('should clear history', async () => {
    await controller.controlTV('turn_off');
    controller.clearHistory();
    expect(controller.getHistory()).toHaveLength(0);
  });
});

describe('RetryTVController', () => {
  it('should succeed on first attempt', async () => {
    const mock = new MockTVController();
    const retry = new RetryTVController(mock, 2, 10);

    const result = await retry.controlTV('turn_off');
    expect(result).toBe(true);
    expect(mock.getState()).toBe('off');
  });

  it('should retry on failure and succeed', async () => {
    let attempts = 0;
    const failingDelegate: TVController = {
      controlTV: async (action) => {
        attempts++;
        if (attempts < 2) return false;
        return true;
      },
    };

    const retry = new RetryTVController(failingDelegate, 2, 10);
    const result = await retry.controlTV('turn_off');
    expect(result).toBe(true);
    expect(attempts).toBe(2);
  });

  it('should return false after all retries exhausted', async () => {
    const alwaysFail: TVController = {
      controlTV: async () => false,
    };

    const retry = new RetryTVController(alwaysFail, 1, 10);
    const result = await retry.controlTV('turn_off');
    expect(result).toBe(false);
  });

  it('should handle exceptions and retry', async () => {
    let attempts = 0;
    const throwingDelegate: TVController = {
      controlTV: async () => {
        attempts++;
        if (attempts < 2) throw new Error('Connection failed');
        return true;
      },
    };

    const retry = new RetryTVController(throwingDelegate, 2, 10);
    const result = await retry.controlTV('turn_off');
    expect(result).toBe(true);
    expect(attempts).toBe(2);
  });
});
