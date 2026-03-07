import { MealStateManager } from '../../lib/services/meal-state-manager';
import { MealSessionRepository } from '../../lib/repositories/meal-session-repository';
import { EatingStateRepository } from '../../lib/repositories/eating-state-repository';
import { SystemSettingsRepository } from '../../lib/repositories/system-settings-repository';
import { DEFAULT_SYSTEM_CONFIGURATION } from '../../lib/models/types';

describe('MealStateManager', () => {
  let manager: MealStateManager;
  let mockSessionRepo: jest.Mocked<MealSessionRepository>;
  let mockStateRepo: jest.Mocked<EatingStateRepository>;
  let mockSettingsRepo: jest.Mocked<SystemSettingsRepository>;

  beforeEach(() => {
    mockSessionRepo = {
      create: jest.fn(),
      getById: jest.fn(),
      updateStatus: jest.fn(),
      updateMetrics: jest.fn(),
    } as any;

    mockStateRepo = {
      create: jest.fn(),
      queryBySession: jest.fn(),
      queryByTimeRange: jest.fn(),
      setErrorFlag: jest.fn(),
    } as any;

    mockSettingsRepo = {
      getConfiguration: jest.fn().mockResolvedValue(DEFAULT_SYSTEM_CONFIGURATION),
      getSetting: jest.fn(),
      putSetting: jest.fn(),
      saveConfiguration: jest.fn(),
    } as any;

    manager = new MealStateManager(mockSessionRepo, mockStateRepo, mockSettingsRepo);
  });

  describe('createSession', () => {
    it('should create a new session with correct defaults', async () => {
      mockSessionRepo.create.mockImplementation(async (s) => s);

      const session = await manager.createSession(2);

      expect(session.sessionId).toMatch(/^session-/);
      expect(session.status).toBe('active');
      expect(session.childrenCount).toBe(2);
      expect(session.chewingStopCount).toBe(0);
    });
  });

  describe('endSession', () => {
    it('should end an active session', async () => {
      mockSessionRepo.getById.mockResolvedValue({
        sessionId: 'session-001',
        startTime: '2025-02-07T10:00:00Z',
        status: 'active',
      });

      await manager.endSession('session-001');

      expect(mockSessionRepo.updateStatus).toHaveBeenCalledWith(
        'session-001', 'completed', expect.any(String),
      );
      expect(mockSessionRepo.updateMetrics).toHaveBeenCalledWith(
        'session-001', expect.objectContaining({ totalDuration: expect.any(Number) }),
      );
    });

    it('should throw when session not found', async () => {
      mockSessionRepo.getById.mockResolvedValue(null);
      await expect(manager.endSession('nonexistent')).rejects.toThrow('Session not found');
    });
  });

  describe('recordState', () => {
    it('should record chewing state and suggest TV turn on', async () => {
      mockStateRepo.create.mockImplementation(async (s) => s);

      const result = await manager.recordState(
        'session-001', 'chewing', 0.95, 'edge',
      );

      expect(result.newState).toBe('chewing');
      expect(result.shouldControlTV).toBe(true);
      expect(result.tvAction).toBe('turn_on');
    });

    it('should not control TV when confidence is below threshold', async () => {
      mockStateRepo.create.mockImplementation(async (s) => s);

      const result = await manager.recordState(
        'session-001', 'chewing_stopped', 0.5, 'edge',
      );

      expect(result.shouldControlTV).toBe(false);
    });

    it('should suggest TV turn off when chewing stopped consistently', async () => {
      mockStateRepo.create.mockImplementation(async (s) => s);
      mockStateRepo.queryByTimeRange.mockResolvedValue([
        { sessionId: 'session-001', timestamp: Date.now() - 5000, state: 'chewing_stopped', confidence: 0.9, analysisSource: 'edge' },
        { sessionId: 'session-001', timestamp: Date.now() - 3000, state: 'chewing_stopped', confidence: 0.9, analysisSource: 'edge' },
      ]);

      const result = await manager.recordState(
        'session-001', 'chewing_stopped', 0.9, 'edge',
      );

      expect(result.shouldControlTV).toBe(true);
      expect(result.tvAction).toBe('turn_off');
    });

    it('should not turn off TV if recent states include chewing', async () => {
      mockStateRepo.create.mockImplementation(async (s) => s);
      mockStateRepo.queryByTimeRange.mockResolvedValue([
        { sessionId: 'session-001', timestamp: Date.now() - 5000, state: 'chewing', confidence: 0.9, analysisSource: 'edge' },
        { sessionId: 'session-001', timestamp: Date.now() - 3000, state: 'chewing_stopped', confidence: 0.9, analysisSource: 'edge' },
      ]);

      const result = await manager.recordState(
        'session-001', 'chewing_stopped', 0.9, 'edge',
      );

      expect(result.shouldControlTV).toBe(false);
    });
  });
});
