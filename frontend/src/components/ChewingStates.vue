<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { chewingStatesApi, type ChewingStateRecord } from '@/services/apiService';

const records = ref<ChewingStateRecord[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const stateLabels: Record<string, string> = {
  chewing: '咀嚼中',
  chewing_stopped: '咀嚼停止',
  meal_ended: '食事終了',
  waiting: '待機',
};

const stateColors: Record<string, string> = {
  chewing: 'bg-green-100 text-green-800',
  chewing_stopped: 'bg-yellow-100 text-yellow-800',
  meal_ended: 'bg-red-100 text-red-800',
  waiting: 'bg-gray-100 text-gray-800',
};

function formatTime(ts: string): string {
  return new Date(ts).toLocaleString('ja-JP');
}

async function loadRecords() {
  loading.value = true;
  error.value = null;
  try {
    records.value = await chewingStatesApi.getRecent(undefined, 50);
  } catch {
    error.value = 'データの取得に失敗しました';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadRecords();
});
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">咀嚼状態履歴</h1>
      <button class="btn-secondary text-sm" @click="loadRecords" :disabled="loading">
        {{ loading ? '読込中...' : '更新' }}
      </button>
    </div>

    <div v-if="error" class="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700">
      {{ error }}
    </div>

    <div v-if="records.length === 0 && !loading" class="bg-white rounded-lg shadow p-6 text-center text-gray-500">
      データがありません
    </div>

    <div v-else class="bg-white rounded-lg shadow overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 text-gray-600">
          <tr>
            <th class="px-3 py-2 text-left">時刻</th>
            <th class="px-3 py-2 text-left">状態変化</th>
            <th class="px-3 py-2 text-right">Motion</th>
            <th class="px-3 py-2 text-right">精度</th>
            <th class="px-3 py-2 text-right">顔数</th>
            <th class="px-3 py-2 text-right">停止秒</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in records" :key="r.epochSeconds" class="border-t border-gray-100 hover:bg-gray-50">
            <td class="px-3 py-2 text-gray-600 whitespace-nowrap">{{ formatTime(r.timestamp) }}</td>
            <td class="px-3 py-2">
              <span class="text-gray-400 text-xs">{{ stateLabels[r.prevState] || r.prevState }}</span>
              <span class="mx-1 text-gray-400">&rarr;</span>
              <span
                class="inline-block px-2 py-0.5 rounded text-xs font-medium"
                :class="stateColors[r.state] || 'bg-gray-100'"
              >
                {{ stateLabels[r.state] || r.state }}
              </span>
            </td>
            <td class="px-3 py-2 text-right font-mono">{{ r.motionScore }}</td>
            <td class="px-3 py-2 text-right">
              <span
                class="inline-block px-1.5 py-0.5 rounded text-xs"
                :class="r.confidence >= 0.5 ? 'bg-green-100 text-green-700' : r.confidence > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'"
              >
                {{ r.confidence ? r.confidence.toFixed(2) : '-' }}
              </span>
            </td>
            <td class="px-3 py-2 text-right">{{ r.facesDetected }}</td>
            <td class="px-3 py-2 text-right">{{ r.stoppedDuration > 0 ? r.stoppedDuration.toFixed(1) : '-' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
