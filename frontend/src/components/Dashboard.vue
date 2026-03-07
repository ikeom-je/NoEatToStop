<script setup lang="ts">
import { onMounted } from 'vue';
import { useMealStore } from '@/stores/mealStore';
import { useSettingsStore } from '@/stores/settingsStore';

const mealStore = useMealStore();
const settingsStore = useSettingsStore();

onMounted(() => {
  settingsStore.loadSettings();
});
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">ダッシュボード</h1>

    <!-- システム概要 -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="bg-white rounded-lg shadow p-4">
        <h3 class="text-sm font-medium text-gray-500">現在のセッション</h3>
        <p class="mt-1 text-2xl font-semibold" data-testid="session-status">
          {{ mealStore.currentSession ? '食事中' : '待機中' }}
        </p>
        <p v-if="mealStore.currentSession" class="text-sm text-gray-500">
          ID: {{ mealStore.currentSession.sessionId }}
        </p>
      </div>

      <div class="bg-white rounded-lg shadow p-4">
        <h3 class="text-sm font-medium text-gray-500">咀嚼停止回数</h3>
        <p class="mt-1 text-2xl font-semibold" data-testid="stop-count">
          {{ mealStore.currentSession?.chewingStopCount ?? 0 }}
        </p>
      </div>

      <div class="bg-white rounded-lg shadow p-4">
        <h3 class="text-sm font-medium text-gray-500">検出信頼度</h3>
        <p class="mt-1 text-2xl font-semibold" data-testid="confidence">
          {{ mealStore.currentSession?.averageConfidence
            ? `${(mealStore.currentSession.averageConfidence * 100).toFixed(0)}%`
            : '-' }}
        </p>
      </div>
    </div>

    <!-- 設定概要 -->
    <div class="bg-white rounded-lg shadow p-4">
      <h2 class="text-lg font-semibold mb-3">システム設定概要</h2>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <span class="text-gray-500">咀嚼停止閾値:</span>
          <span class="ml-1 font-medium">{{ settingsStore.config.pauseThreshold }}秒</span>
        </div>
        <div>
          <span class="text-gray-500">信頼度閾値:</span>
          <span class="ml-1 font-medium">{{ (settingsStore.config.confidenceThreshold * 100).toFixed(0) }}%</span>
        </div>
        <div>
          <span class="text-gray-500">子供人数:</span>
          <span class="ml-1 font-medium">{{ settingsStore.config.childCount }}人</span>
        </div>
        <div>
          <span class="text-gray-500">大人除外:</span>
          <span class="ml-1 font-medium">{{ settingsStore.config.excludeAdults ? 'ON' : 'OFF' }}</span>
        </div>
      </div>
    </div>

    <!-- クイックアクション -->
    <div class="bg-white rounded-lg shadow p-4">
      <h2 class="text-lg font-semibold mb-3">クイックアクション</h2>
      <div class="flex flex-wrap gap-3">
        <router-link to="/live-video" class="btn-primary">ライブ映像</router-link>
        <router-link to="/meal-history" class="btn-secondary">食事履歴</router-link>
        <router-link to="/settings" class="btn-secondary">設定変更</router-link>
        <router-link to="/emergency" class="btn-danger">緊急制御</router-link>
      </div>
    </div>
  </div>
</template>
