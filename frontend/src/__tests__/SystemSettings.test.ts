import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import SystemSettings from '@/components/SystemSettings.vue';

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
    saveAll: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('SystemSettings', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('should render settings title', () => {
    const wrapper = mount(SystemSettings, {
      global: { plugins: [createPinia()] },
    });
    expect(wrapper.text()).toContain('システム設定');
  });

  it('should render save and reset buttons', () => {
    const wrapper = mount(SystemSettings, {
      global: { plugins: [createPinia()] },
    });
    expect(wrapper.find('[data-testid="save-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="reset-btn"]').exists()).toBe(true);
  });

  it('should render detection settings section', () => {
    const wrapper = mount(SystemSettings, {
      global: { plugins: [createPinia()] },
    });
    expect(wrapper.text()).toContain('検出・判定設定');
    expect(wrapper.find('[data-testid="pause-threshold"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="confidence-threshold"]').exists()).toBe(true);
  });

  it('should render subject settings section', () => {
    const wrapper = mount(SystemSettings, {
      global: { plugins: [createPinia()] },
    });
    expect(wrapper.text()).toContain('対象設定');
    expect(wrapper.find('[data-testid="child-count"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="exclude-adults"]').exists()).toBe(true);
  });

  it('should render TV control settings', () => {
    const wrapper = mount(SystemSettings, {
      global: { plugins: [createPinia()] },
    });
    expect(wrapper.text()).toContain('TV制御設定');
  });
});
