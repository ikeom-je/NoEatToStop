import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import EmergencyControl from '@/components/EmergencyControl.vue';

describe('EmergencyControl', () => {
  it('should render title', () => {
    const wrapper = mount(EmergencyControl);
    expect(wrapper.text()).toContain('緊急制御');
  });

  it('should toggle system pause', async () => {
    const wrapper = mount(EmergencyControl);
    const btn = wrapper.find('[data-testid="system-toggle"]');
    expect(btn.text()).toBe('システム停止');

    await btn.trigger('click');
    expect(btn.text()).toBe('システム再開');
  });

  it('should toggle camera', async () => {
    const wrapper = mount(EmergencyControl);
    const btn = wrapper.find('[data-testid="camera-toggle"]');
    expect(btn.text()).toBe('カメラ停止');

    await btn.trigger('click');
    expect(btn.text()).toBe('カメラ開始');
  });

  it('should toggle cloud processing', async () => {
    const wrapper = mount(EmergencyControl);
    const btn = wrapper.find('[data-testid="cloud-toggle"]');
    expect(btn.text()).toBe('クラウド送信停止');

    await btn.trigger('click');
    expect(btn.text()).toBe('クラウド送信開始');
  });

  it('should log actions', async () => {
    const wrapper = mount(EmergencyControl);
    await wrapper.find('[data-testid="tv-on"]').trigger('click');
    await wrapper.find('[data-testid="tv-off"]').trigger('click');

    const log = wrapper.find('[data-testid="action-log"]');
    expect(log.exists()).toBe(true);
    expect(log.text()).toContain('TV強制ON');
    expect(log.text()).toContain('TV強制OFF');
  });
});
