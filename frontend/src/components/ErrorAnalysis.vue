<script setup lang="ts">
import { ref, computed } from 'vue';
import { useMealStore } from '@/stores/mealStore';

const mealStore = useMealStore();
const sessionIdInput = ref('');

const errorStates = computed(() =>
  mealStore.eatingStates.filter(s => s.errorFlag || s.confidence < 0.7)
);

async function loadSession() {
  if (sessionIdInput.value.trim()) {
    await mealStore.loadSession(sessionIdInput.value.trim());
  }
}

function formatPercent(value?: number): string {
  if (value == null) return '-';
  return `${(value * 100).toFixed(1)}%`;
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-2xl font-bold">エラー分析</h1>

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

    <!-- エラー/低信頼度の状態一覧 -->
    <div v-if="errorStates.length > 0" class="bg-white rounded-lg shadow p-4" data-testid="error-list">
      <h2 class="text-lg font-semibold mb-3">
        要確認 ({{ errorStates.length }}件)
      </h2>
      <div class="space-y-3">
        <div
          v-for="state in errorStates"
          :key="state.timestamp"
          class="border rounded-lg p-3"
          :class="state.errorFlag ? 'border-red-300 bg-red-50' : 'border-yellow-300 bg-yellow-50'"
        >
          <div class="flex justify-between items-start">
            <div class="text-sm">
              <p class="font-medium">
                {{ new Date(state.timestamp).toLocaleString('ja-JP') }}
                <span class="ml-2 text-gray-500">{{ state.analysisSource }}</span>
              </p>
              <p>状態: {{ state.state }} / 信頼度: {{ formatPercent(state.confidence) }}</p>
              <p v-if="state.errorFlag" class="text-red-600 font-medium">エラーフラグ: あり</p>
            </div>
            <div class="flex gap-2">
              <button
                v-if="!state.errorFlag"
                class="text-sm bg-red-100 text-red-700 px-2 py-1 rounded"
                data-testid="flag-error"
              >
                エラー報告
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="mealStore.currentSession" class="bg-white rounded-lg shadow p-4 text-gray-500">
      要確認のエラーはありません
    </div>
  </div>
</template>
