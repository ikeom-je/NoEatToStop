<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { frameChangeApi, type FrameChangeEvent } from '@/services/apiService';

const events = ref<FrameChangeEvent[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const selectedImage = ref<string | null>(null);

const changeTypeLabels: Record<string, string> = {
  face_detected: '顔検出',
  face_lost: '顔消失',
  pixel_diff: '動き検知',
  chewing_state_change: '咀嚼状態変化',
};

const changeTypeColors: Record<string, string> = {
  face_detected: 'bg-blue-100 text-blue-800',
  face_lost: 'bg-orange-100 text-orange-800',
  pixel_diff: 'bg-purple-100 text-purple-800',
  chewing_state_change: 'bg-green-100 text-green-800',
};

const stateLabels: Record<string, string> = {
  chewing: '咀嚼中',
  chewing_stopped: '咀嚼停止',
  meal_ended: '食事終了',
  waiting: '待機',
};

async function loadEvents() {
  loading.value = true;
  error.value = null;
  try {
    events.value = await frameChangeApi.getRecent(undefined, 50);
  } catch {
    error.value = 'エビデンスデータの取得に失敗しました';
  } finally {
    loading.value = false;
  }
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleString('ja-JP');
}

onMounted(() => {
  loadEvents();
});
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">エビデンス分析</h1>
      <button class="btn-secondary text-sm" @click="loadEvents" :disabled="loading">
        {{ loading ? '読込中...' : '更新' }}
      </button>
    </div>

    <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-700 text-sm">
      フレーム変化イベントとエビデンス画像（BB付き）を時系列で表示します。状態変化の妥当性を目視で検証できます。
    </div>

    <div v-if="error" class="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700">
      {{ error }}
    </div>

    <div v-if="events.length === 0 && !loading" class="bg-white rounded-lg shadow p-6 text-center text-gray-500">
      エビデンスデータがありません
    </div>

    <!-- 画像拡大モーダル -->
    <div
      v-if="selectedImage"
      class="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4"
      @click="selectedImage = null"
    >
      <img :src="selectedImage" class="max-w-full max-h-full object-contain rounded-lg" />
    </div>

    <!-- エビデンス一覧 -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div
        v-for="ev in events"
        :key="ev.epochSeconds"
        class="bg-white rounded-lg shadow overflow-hidden"
      >
        <!-- エビデンス画像 -->
        <div
          class="aspect-video bg-gray-100 relative cursor-pointer"
          @click="ev.evidenceUrl && (selectedImage = ev.evidenceUrl)"
        >
          <img
            v-if="ev.evidenceUrl"
            :src="ev.evidenceUrl"
            class="w-full h-full object-contain"
            loading="lazy"
          />
          <div v-else class="flex items-center justify-center h-full text-gray-400 text-sm">
            画像なし
          </div>
          <!-- 変化タイプバッジ -->
          <span
            class="absolute top-2 left-2 inline-block px-2 py-0.5 rounded text-xs font-medium"
            :class="changeTypeColors[ev.changeType] || 'bg-gray-100 text-gray-800'"
          >
            {{ changeTypeLabels[ev.changeType] || ev.changeType }}
          </span>
        </div>

        <!-- メタデータ -->
        <div class="p-3 text-sm space-y-2">
          <div class="flex justify-between items-center">
            <span class="text-gray-500">{{ formatTime(ev.timestamp) }}</span>
            <span
              class="inline-block px-2 py-0.5 rounded text-xs font-medium"
              :class="ev.chewingState === 'chewing' ? 'bg-green-100 text-green-800' : ev.chewingState === 'chewing_stopped' ? 'bg-yellow-100 text-yellow-800' : ev.chewingState === 'meal_ended' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'"
            >
              {{ stateLabels[ev.chewingState] || ev.chewingState }}
            </span>
          </div>

          <div class="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span class="text-gray-400">差分スコア</span>
              <span class="ml-1 font-mono">{{ ev.diffScore }}</span>
            </div>
            <div>
              <span class="text-gray-400">顔検出</span>
              <span class="ml-1 font-mono">{{ ev.facesDetected }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
