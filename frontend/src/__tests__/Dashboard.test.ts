import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import Dashboard from '@/components/Dashboard.vue';

vi.mock('@/services/apiService', () => ({
  settingsApi: {
    getAll: vi.fn().mockResolvedValue({
      pauseThreshold: 10,
      confidenceThreshold: 0.8,
      childCount: 1,
      excludeAdults: false,
      liveVideoUpdateInterval: 3,
      videoResolution: '640x360',
      videoFrameRate: 30,
      videoRetentionDays: 1,
      videoBufferDuration: 10,
      analysisVideoDuration: 20,
      faceDetectionThreshold: 0.8,
      mouthDetectionThreshold: 0.8,
      chewingDetectionThreshold: 0.8,
      tvControlMethod: 'smart_tv_api',
      tvControlRetryCount: 1,
      tvControlRetryInterval: 3,
    }),
  },
  mealSessionApi: { create: vi.fn(), getById: vi.fn() },
  eatingStateApi: { create: vi.fn(), getBySession: vi.fn() },
}));

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: Dashboard },
    { path: '/live-video', component: { template: '<div />' } },
    { path: '/meal-history', component: { template: '<div />' } },
    { path: '/settings', component: { template: '<div />' } },
    { path: '/emergency', component: { template: '<div />' } },
  ],
});

describe('Dashboard', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('should render dashboard title', () => {
    const wrapper = mount(Dashboard, {
      global: { plugins: [createPinia(), router] },
    });
    expect(wrapper.text()).toContain('ダッシュボード');
  });

  it('should show waiting status when no session', () => {
    const wrapper = mount(Dashboard, {
      global: { plugins: [createPinia(), router] },
    });
    expect(wrapper.find('[data-testid="session-status"]').text()).toBe('待機中');
  });

  it('should show stop count as 0 when no session', () => {
    const wrapper = mount(Dashboard, {
      global: { plugins: [createPinia(), router] },
    });
    expect(wrapper.find('[data-testid="stop-count"]').text()).toBe('0');
  });

  it('should render quick action links', () => {
    const wrapper = mount(Dashboard, {
      global: { plugins: [createPinia(), router] },
    });
    expect(wrapper.text()).toContain('ライブ映像');
    expect(wrapper.text()).toContain('食事履歴');
    expect(wrapper.text()).toContain('設定変更');
    expect(wrapper.text()).toContain('緊急制御');
  });
});
