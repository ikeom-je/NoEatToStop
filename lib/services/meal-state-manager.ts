import { MealSessionRepository } from '../repositories/meal-session-repository';
import { EatingStateRepository } from '../repositories/eating-state-repository';
import { SystemSettingsRepository } from '../repositories/system-settings-repository';
import { MealSession, EatingState, EatingStateType, AnalysisSource, SystemConfiguration } from '../models/types';

export interface StateTransitionResult {
  newState: EatingStateType;
  shouldControlTV: boolean;
  tvAction?: 'turn_off' | 'turn_on';
  confidence: number;
}

export class MealStateManager {
  constructor(
    private readonly sessionRepo: MealSessionRepository,
    private readonly stateRepo: EatingStateRepository,
    private readonly settingsRepo: SystemSettingsRepository,
  ) {}

  async createSession(childrenCount: number): Promise<MealSession> {
    const session: MealSession = {
      sessionId: `session-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      startTime: new Date().toISOString(),
      status: 'active',
      childrenCount,
      chewingStopCount: 0,
      chewingDuration: 0,
      totalDuration: 0,
    };
    return this.sessionRepo.create(session);
  }

  async endSession(sessionId: string): Promise<void> {
    const session = await this.sessionRepo.getById(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    const endTime = new Date().toISOString();
    const totalDuration = (new Date(endTime).getTime() - new Date(session.startTime).getTime()) / 1000;

    await this.sessionRepo.updateStatus(sessionId, 'completed', endTime);
    await this.sessionRepo.updateMetrics(sessionId, { totalDuration });
  }

  async recordState(
    sessionId: string,
    state: EatingStateType,
    confidence: number,
    source: AnalysisSource,
    metadata?: EatingState['metadata'],
  ): Promise<StateTransitionResult> {
    const config = await this.settingsRepo.getConfiguration();

    const eatingState: EatingState = {
      sessionId,
      timestamp: Date.now(),
      state,
      confidence,
      analysisSource: source,
      metadata,
    };
    await this.stateRepo.create(eatingState);

    return this.evaluateTransition(sessionId, state, confidence, config);
  }

  private async evaluateTransition(
    sessionId: string,
    currentState: EatingStateType,
    confidence: number,
    config: SystemConfiguration,
  ): Promise<StateTransitionResult> {
    if (confidence < config.confidenceThreshold) {
      return { newState: currentState, shouldControlTV: false, confidence };
    }

    if (currentState === 'chewing_stopped') {
      const recentStates = await this.stateRepo.queryByTimeRange(
        sessionId,
        Date.now() - config.pauseThreshold * 1000,
        Date.now(),
      );

      const allStopped = recentStates.length > 0 &&
        recentStates.every(s => s.state === 'chewing_stopped');

      if (allStopped) {
        await this.sessionRepo.updateMetrics(sessionId, {
          chewingStopCount: recentStates.length,
        });

        return {
          newState: 'chewing_stopped',
          shouldControlTV: true,
          tvAction: 'turn_off',
          confidence,
        };
      }
    }

    if (currentState === 'chewing') {
      return {
        newState: 'chewing',
        shouldControlTV: true,
        tvAction: 'turn_on',
        confidence,
      };
    }

    return { newState: currentState, shouldControlTV: false, confidence };
  }
}
