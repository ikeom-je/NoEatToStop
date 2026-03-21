import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { TVControlRecord } from '@/types';
import { tvControlApi, type TVControlEvent } from '@/services/apiService';

export const useTVControlStore = defineStore('tvControl', () => {
  const events = ref<TVControlEvent[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const commandSending = ref(false);

  async function loadEvents(deviceId?: string, limit?: number) {
    loading.value = true;
    error.value = null;
    try {
      events.value = await tvControlApi.getEvents(deviceId, limit || 50);
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'TV制御履歴の取得に失敗しました';
    } finally {
      loading.value = false;
    }
  }

  async function sendCommand(action: 'turn_on' | 'turn_off', deviceId?: string) {
    commandSending.value = true;
    error.value = null;
    try {
      await tvControlApi.sendCommand(action, deviceId);
      // 送信後にイベントをリロード（少し遅延して Edge の処理を待つ）
      setTimeout(() => loadEvents(deviceId), 3000);
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'TVコマンド送信に失敗しました';
    } finally {
      commandSending.value = false;
    }
  }

  // 旧API互換
  const history = ref<TVControlRecord[]>([]);
  const status = ref<{ sessionId: string; isRequesting: boolean; requestCount: number; lastAction?: string } | null>(null);

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
    events.value = [];
  }

  return {
    events,
    loading,
    error,
    commandSending,
    loadEvents,
    sendCommand,
    // 旧API互換
    status,
    history,
    loadHistory,
    checkStatus,
    clearHistory,
  };
});
