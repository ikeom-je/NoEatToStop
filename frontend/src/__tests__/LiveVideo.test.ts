import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import LiveVideo from '@/components/LiveVideo.vue';

const mockGetLatestFrameUrl = vi.fn();

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
  videoApi: {
    getLatestFrameUrl: (...args: unknown[]) => mockGetLatestFrameUrl(...args),
  },
}));

describe('LiveVideo', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockGetLatestFrameUrl.mockReset();
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
    mockGetLatestFrameUrl.mockResolvedValue('https://example.com/frame.jpg');
    const wrapper = mount(LiveVideo, {
      global: { plugins: [createPinia()] },
    });
    await wrapper.find('[data-testid="start-btn"]').trigger('click');
    await vi.dynamicImportSettled();
    expect(wrapper.find('[data-testid="stop-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="start-btn"]').exists()).toBe(false);
  });

  it('should show placeholder when not streaming', () => {
    const wrapper = mount(LiveVideo, {
      global: { plugins: [createPinia()] },
    });
    expect(wrapper.find('[data-testid="video-placeholder"]').exists()).toBe(true);
  });

  it('should show video frame when streaming with valid URL', async () => {
    mockGetLatestFrameUrl.mockResolvedValue('https://example.com/frame.jpg');
    const wrapper = mount(LiveVideo, {
      global: { plugins: [createPinia()] },
    });
    await wrapper.find('[data-testid="start-btn"]').trigger('click');
    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();
    const frame = wrapper.find('[data-testid="video-frame"]');
    expect(frame.exists()).toBe(true);
    expect(frame.attributes('src')).toBe('https://example.com/frame.jpg');
  });

  it('should show error when frame fetch fails', async () => {
    mockGetLatestFrameUrl.mockRejectedValue(new Error('Network error'));
    const wrapper = mount(LiveVideo, {
      global: { plugins: [createPinia()] },
    });
    await wrapper.find('[data-testid="start-btn"]').trigger('click');
    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="video-error"]').exists()).toBe(true);
  });
});
