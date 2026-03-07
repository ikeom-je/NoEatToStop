import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useMealStore } from '@/stores/mealStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTVControlStore } from '@/stores/tvControlStore';
import { DEFAULT_SYSTEM_CONFIGURATION } from '@/types';

vi.mock('@/services/apiService', async () => {
  const { DEFAULT_SYSTEM_CONFIGURATION } = await import('@/types');
  return {
    mealSessionApi: {
      create: vi.fn().mockResolvedValue({
        sessionId: 'session-001',
        startTime: '2025-01-01T00:00:00Z',
        status: 'active',
        childrenCount: 2,
        chewingStopCount: 0,
      }),
      getById: vi.fn().mockResolvedValue({
        sessionId: 'session-001',
        startTime: '2025-01-01T00:00:00Z',
        status: 'active',
      }),
    },
    eatingStateApi: {
      create: vi.fn(),
      getBySession: vi.fn().mockResolvedValue([]),
    },
    settingsApi: {
      getAll: vi.fn().mockResolvedValue(DEFAULT_SYSTEM_CONFIGURATION),
      saveAll: vi.fn().mockResolvedValue(undefined),
    },
    tvControlApi: {
      getHistory: vi.fn().mockResolvedValue([]),
      getStatus: vi.fn().mockResolvedValue({ shouldControl: false }),
    },
  };
});

describe('mealStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('should start session', async () => {
    const store = useMealStore();
    await store.startSession(2);
    expect(store.currentSession).not.toBeNull();
    expect(store.currentSession?.sessionId).toBe('session-001');
  });

  it('should load session', async () => {
    const store = useMealStore();
    await store.loadSession('session-001');
    expect(store.currentSession?.sessionId).toBe('session-001');
  });

  it('should clear session', async () => {
    const store = useMealStore();
    await store.startSession(1);
    store.clearSession();
    expect(store.currentSession).toBeNull();
  });
});

describe('settingsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('should load settings', async () => {
    const store = useSettingsStore();
    await store.loadSettings();
    expect(store.config.pauseThreshold).toBe(10);
  });

  it('should update field and clear saved flag', async () => {
    const store = useSettingsStore();
    store.saved = true;
    store.updateField('pauseThreshold', 20);
    expect(store.config.pauseThreshold).toBe(20);
    expect(store.saved).toBe(false);
  });

  it('should reset to defaults', () => {
    const store = useSettingsStore();
    store.updateField('pauseThreshold', 99);
    store.resetToDefaults();
    expect(store.config.pauseThreshold).toBe(DEFAULT_SYSTEM_CONFIGURATION.pauseThreshold);
  });

  it('should save settings', async () => {
    const store = useSettingsStore();
    await store.saveSettings();
    expect(store.saved).toBe(true);
  });
});

describe('tvControlStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('should load history', async () => {
    const store = useTVControlStore();
    await store.loadHistory('session-001');
    expect(store.history).toEqual([]);
    expect(store.loading).toBe(false);
  });

  it('should clear history', () => {
    const store = useTVControlStore();
    store.clearHistory();
    expect(store.history).toEqual([]);
    expect(store.status).toBeNull();
  });
});
