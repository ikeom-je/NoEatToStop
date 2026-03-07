import { TVController } from './edge-processor';

export interface TVControlRecord {
  action: 'turn_off' | 'turn_on';
  timestamp: number;
  success: boolean;
  method: string;
  error?: string;
}

export class MockTVController implements TVController {
  private history: TVControlRecord[] = [];
  private currentState: 'on' | 'off' = 'on';

  async controlTV(action: 'turn_off' | 'turn_on'): Promise<boolean> {
    this.currentState = action === 'turn_off' ? 'off' : 'on';
    this.history.push({
      action,
      timestamp: Date.now(),
      success: true,
      method: 'mock',
    });
    return true;
  }

  getState(): 'on' | 'off' {
    return this.currentState;
  }

  getHistory(): TVControlRecord[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
  }
}

export class RetryTVController implements TVController {
  constructor(
    private readonly delegate: TVController,
    private readonly retryCount: number = 1,
    private readonly retryInterval: number = 3000,
  ) {}

  async controlTV(action: 'turn_off' | 'turn_on'): Promise<boolean> {
    for (let attempt = 0; attempt <= this.retryCount; attempt++) {
      try {
        const success = await this.delegate.controlTV(action);
        if (success) return true;
      } catch {
        // リトライ
      }

      if (attempt < this.retryCount) {
        await new Promise(resolve => setTimeout(resolve, this.retryInterval));
      }
    }
    return false;
  }
}
