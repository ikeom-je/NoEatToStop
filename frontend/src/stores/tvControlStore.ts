import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { TVControlRecord, TVControlStatus } from '@/types';
import { tvControlApi } from '@/services/apiService';

export const useTVControlStore = defineStore('tvControl', () => {
  const status = ref<TVControlStatus | null>(null);
  const history = ref<TVControlRecord[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function loadHistory(sessionId: string) {
    loading.value = true;
    error.value = null;
    try {
      history.value = await tvControlApi.getHistory(sessionId);
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'TV制御履歴の取得に失敗しました';
    } finally {
      loading.value = false;
    }
  }

  async function checkStatus(sessionId: string) {
    try {
      const result = await tvControlApi.getStatus(sessionId);
      status.value = {
        sessionId,
        isRequesting: false,
        requestCount: history.value.length,
        lastAction: result.action,
      };
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'TV制御状態の取得に失敗しました';
    }
  }

  function clearHistory() {
    history.value = [];
    status.value = null;
  }

  return {
    status,
    history,
    loading,
    error,
    loadHistory,
    checkStatus,
    clearHistory,
  };
});
