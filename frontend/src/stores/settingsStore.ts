import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { SystemConfiguration } from '@/types';
import { DEFAULT_SYSTEM_CONFIGURATION } from '@/types';
import { settingsApi } from '@/services/apiService';

export const useSettingsStore = defineStore('settings', () => {
  const config = ref<SystemConfiguration>({ ...DEFAULT_SYSTEM_CONFIGURATION });
  const loading = ref(false);
  const error = ref<string | null>(null);
  const saved = ref(false);

  async function loadSettings() {
    loading.value = true;
    error.value = null;
    try {
      config.value = await settingsApi.getAll();
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : '設定の取得に失敗しました';
    } finally {
      loading.value = false;
    }
  }

  async function saveSettings() {
    loading.value = true;
    error.value = null;
    saved.value = false;
    try {
      await settingsApi.saveAll(config.value);
      saved.value = true;
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : '設定の保存に失敗しました';
    } finally {
      loading.value = false;
    }
  }

  function updateField<K extends keyof SystemConfiguration>(key: K, value: SystemConfiguration[K]) {
    config.value[key] = value;
    saved.value = false;
  }

  function resetToDefaults() {
    config.value = { ...DEFAULT_SYSTEM_CONFIGURATION };
    saved.value = false;
  }

  return {
    config,
    loading,
    error,
    saved,
    loadSettings,
    saveSettings,
    updateField,
    resetToDefaults,
  };
});
