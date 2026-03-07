import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import LiveVideo from '@/components/LiveVideo.vue';

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
}));

describe('LiveVideo', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('should render title', () => {
    const wrapper = mount(LiveVideo, {
      global: { plugins: [createPinia()] },
    });
    expect(wrapper.text()).toContain('ライブ映像');
  });

  it('should show start button initially', () => {
    const wrapper = mount(LiveVideo, {
      global: { plugins: [createPinia()] },
    });
    expect(wrapper.find('[data-testid="start-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="stop-btn"]').exists()).toBe(false);
  });

  it('should toggle to stop button after start', async () => {
    const wrapper = mount(LiveVideo, {
      global: { plugins: [createPinia()] },
    });
    await wrapper.find('[data-testid="start-btn"]').trigger('click');
    expect(wrapper.find('[data-testid="stop-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="start-btn"]').exists()).toBe(false);
  });

  it('should show placeholder when not streaming', () => {
    const wrapper = mount(LiveVideo, {
      global: { plugins: [createPinia()] },
    });
    expect(wrapper.find('[data-testid="video-placeholder"]').exists()).toBe(true);
  });

  it('should show streaming info when started', async () => {
    const wrapper = mount(LiveVideo, {
      global: { plugins: [createPinia()] },
    });
    await wrapper.find('[data-testid="start-btn"]').trigger('click');
    expect(wrapper.find('[data-testid="video-streaming"]').exists()).toBe(true);
  });
});
