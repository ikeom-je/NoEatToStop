import axios, { type AxiosInstance } from 'axios';
import type { MealSession, EatingState, SystemConfiguration, TVControlRecord } from '@/types';

const apiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});

export const mealSessionApi = {
  async create(childrenCount: number): Promise<MealSession> {
    const { data } = await apiClient.post('/meal-session', { childrenCount });
    return data;
  },

  async getById(sessionId: string): Promise<MealSession> {
    const { data } = await apiClient.get(`/meal-session/${sessionId}`);
    return data;
  },
};

export const eatingStateApi = {
  async create(
    sessionId: string,
    state: string,
    confidence: number,
    analysisSource: string,
  ): Promise<EatingState> {
    const { data } = await apiClient.post('/eating-state', {
      sessionId, state, confidence, analysisSource,
    });
    return data;
  },

  async getBySession(sessionId: string): Promise<EatingState[]> {
    const { data } = await apiClient.get(`/eating-state/${sessionId}`);
    return data;
  },
};

export const settingsApi = {
  async get(key: string): Promise<unknown> {
    const { data } = await apiClient.get(`/settings/${key}`);
    return data;
  },

  async getAll(): Promise<SystemConfiguration> {
    const { data } = await apiClient.get('/settings/all');
    return data;
  },

  async update(key: string, value: unknown): Promise<void> {
    await apiClient.put(`/settings/${key}`, { value });
  },

  async saveAll(config: SystemConfiguration): Promise<void> {
    await apiClient.put('/settings/all', config);
  },
};

export const tvControlApi = {
  async getHistory(sessionId: string): Promise<TVControlRecord[]> {
    const { data } = await apiClient.get(`/tv-control/${sessionId}/history`);
    return data;
  },

  async getStatus(sessionId: string): Promise<{ shouldControl: boolean; action?: string }> {
    const { data } = await apiClient.get(`/tv-control/${sessionId}/should-control`);
    return data;
  },
};

export interface ChewingStateRecord {
  deviceId: string;
  epochSeconds: number;
  state: string;
  prevState: string;
  motionScore: number;
  facesDetected: number;
  stoppedDuration: number;
  frameCount: number;
  timestamp: string;
  expiresAt: number;
}

export const chewingStatesApi = {
  async getRecent(deviceId?: string, limit?: number): Promise<ChewingStateRecord[]> {
    const params = new URLSearchParams();
    if (deviceId) params.set('deviceId', deviceId);
    if (limit) params.set('limit', String(limit));
    const { data } = await apiClient.get<{ items: ChewingStateRecord[] }>(`/chewing-states?${params}`);
    return data.items;
  },
};

export const videoApi = {
  async getLatestFrameUrl(): Promise<string> {
    const { data } = await apiClient.get<{ url: string }>('/video/latest-frame');
    return data.url;
  },
  async getLatestAnalyzedFrameUrl(): Promise<string> {
    const { data } = await apiClient.get<{ url: string }>('/video/latest-analyzed-frame');
    return data.url;
  },
};

export { apiClient };
