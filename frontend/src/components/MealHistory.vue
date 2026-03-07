<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useMealStore } from '@/stores/mealStore';

const mealStore = useMealStore();
const sessionIdInput = ref('');

async function loadSession() {
  if (sessionIdInput.value.trim()) {
    await mealStore.loadSession(sessionIdInput.value.trim());
  }
}

function formatDuration(seconds?: number): string {
  if (seconds == null) return '-';
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return `${min}分${sec}秒`;
}

function formatPercent(value?: number): string {
  if (value == null) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

onMounted(() => {
  // 初期ロードがあれば実行
});
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-2xl font-bold">食事履歴</h1>

    <!-- セッション検索 -->
    <div class="bg-white rounded-lg shadow p-4">
      <div class="flex gap-2">
        <input
          v-model="sessionIdInput"
          type="text"
          placeholder="セッションID"
          class="input-field flex-1"
          data-testid="session-input"
        />
        <button class="btn-primary" data-testid="load-btn" @click="loadSession">読み込み</button>
      </div>
    </div>

    <!-- エラー表示 -->
    <div v-if="mealStore.error" class="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700" data-testid="error-msg">
      {{ mealStore.error }}
    </div>

    <!-- セッション詳細 -->
    <div v-if="mealStore.currentSession" class="bg-white rounded-lg shadow p-4" data-testid="session-detail">
      <h2 class="text-lg font-semibold mb-3">セッション詳細</h2>
      <dl class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <div>
          <dt class="text-gray-500">ステータス</dt>
          <dd class="font-medium">{{ mealStore.currentSession.status }}</dd>
        </div>
        <div>
          <dt class="text-gray-500">開始時刻</dt>
          <dd class="font-medium">{{ mealStore.currentSession.startTime }}</dd>
        </div>
        <div>
          <dt class="text-gray-500">総時間</dt>
          <dd class="font-medium">{{ formatDuration(mealStore.currentSession.totalDuration) }}</dd>
        </div>
        <div>
          <dt class="text-gray-500">咀嚼時間</dt>
          <dd class="font-medium">{{ formatDuration(mealStore.currentSession.chewingDuration) }}</dd>
        </div>
        <div>
          <dt class="text-gray-500">咀嚼停止回数</dt>
          <dd class="font-medium">{{ mealStore.currentSession.chewingStopCount ?? 0 }}回</dd>
        </div>
        <div>
          <dt class="text-gray-500">平均信頼度</dt>
          <dd class="font-medium">{{ formatPercent(mealStore.currentSession.averageConfidence) }}</dd>
        </div>
      </dl>

      <!-- パフォーマンスメトリクス -->
      <div v-if="mealStore.currentSession.performanceMetrics" class="mt-4 pt-4 border-t">
        <h3 class="text-sm font-semibold mb-2">パフォーマンスメトリクス</h3>
        <dl class="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div>
            <dt class="text-gray-500">顔検出精度</dt>
            <dd>{{ formatPercent(mealStore.currentSession.performanceMetrics.faceDetectionAccuracy) }}</dd>
          </div>
          <div>
            <dt class="text-gray-500">口検出精度</dt>
            <dd>{{ formatPercent(mealStore.currentSession.performanceMetrics.mouthDetectionAccuracy) }}</dd>
          </div>
          <div>
            <dt class="text-gray-500">咀嚼検出精度</dt>
            <dd>{{ formatPercent(mealStore.currentSession.performanceMetrics.chewingDetectionAccuracy) }}</dd>
          </div>
          <div>
            <dt class="text-gray-500">TV制御成功率</dt>
            <dd>{{ formatPercent(mealStore.currentSession.performanceMetrics.tvControlSuccessRate) }}</dd>
          </div>
        </dl>
      </div>
    </div>

    <!-- 食事状態履歴 -->
    <div v-if="mealStore.eatingStates.length > 0" class="bg-white rounded-lg shadow p-4" data-testid="state-history">
      <h2 class="text-lg font-semibold mb-3">状態履歴</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b">
              <th class="text-left p-2">時刻</th>
              <th class="text-left p-2">状態</th>
              <th class="text-left p-2">信頼度</th>
              <th class="text-left p-2">ソース</th>
              <th class="text-left p-2">エラー</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="state in mealStore.eatingStates" :key="state.timestamp" class="border-b">
              <td class="p-2">{{ new Date(state.timestamp).toLocaleTimeString('ja-JP') }}</td>
              <td class="p-2">{{ state.state }}</td>
              <td class="p-2">{{ formatPercent(state.confidence) }}</td>
              <td class="p-2">{{ state.analysisSource }}</td>
              <td class="p-2">{{ state.errorFlag ? 'あり' : '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
