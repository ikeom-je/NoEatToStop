import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { MealSession, EatingState } from '@/types';
import { mealSessionApi, eatingStateApi } from '@/services/apiService';

export const useMealStore = defineStore('meal', () => {
  const currentSession = ref<MealSession | null>(null);
  const sessions = ref<MealSession[]>([]);
  const eatingStates = ref<EatingState[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function startSession(childrenCount: number) {
    loading.value = true;
    error.value = null;
    try {
      currentSession.value = await mealSessionApi.create(childrenCount);
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'セッション開始に失敗しました';
    } finally {
      loading.value = false;
    }
  }

  async function loadSession(sessionId: string) {
    loading.value = true;
    error.value = null;
    try {
      currentSession.value = await mealSessionApi.getById(sessionId);
      eatingStates.value = await eatingStateApi.getBySession(sessionId);
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'セッション取得に失敗しました';
    } finally {
      loading.value = false;
    }
  }

  async function loadEatingStates(sessionId: string) {
    try {
      eatingStates.value = await eatingStateApi.getBySession(sessionId);
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : '状態履歴の取得に失敗しました';
    }
  }

  function clearSession() {
    currentSession.value = null;
    eatingStates.value = [];
  }

  return {
    currentSession,
    sessions,
    eatingStates,
    loading,
    error,
    startSession,
    loadSession,
    loadEatingStates,
    clearSession,
  };
});
