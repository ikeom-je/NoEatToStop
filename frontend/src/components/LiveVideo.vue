<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from '@/stores/settingsStore';
import { videoApi } from '@/services/apiService';

const settingsStore = useSettingsStore();
const lastUpdated = ref<string>('-');
const isStreaming = ref(false);
const isLoading = ref(false);
const frameUrl = ref<string | null>(null);
const errorMessage = ref<string | null>(null);
let intervalId: ReturnType<typeof setInterval> | null = null;

function startStreaming() {
  isStreaming.value = true;
  errorMessage.value = null;
  refreshFrame();
  intervalId = setInterval(refreshFrame, settingsStore.config.liveVideoUpdateInterval * 1000);
}

function stopStreaming() {
  isStreaming.value = false;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

async function refreshFrame() {
  isLoading.value = true;
  try {
    frameUrl.value = await videoApi.getLatestFrameUrl();
    errorMessage.value = null;
    lastUpdated.value = new Date().toLocaleTimeString('ja-JP');
  } catch {
    errorMessage.value = 'フレームの取得に失敗しました';
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  settingsStore.loadSettings();
});

onUnmounted(() => {
  stopStreaming();
});
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-2xl font-bold">ライブ映像</h1>

    <div class="bg-white rounded-lg shadow p-4">
      <div class="bg-gray-900 rounded-lg aspect-video flex items-center justify-center mb-4 overflow-hidden">
        <p v-if="!isStreaming" class="text-gray-400" data-testid="video-placeholder">
          映像を開始してください
        </p>
        <p v-else-if="errorMessage" class="text-red-400" data-testid="video-error">
          {{ errorMessage }}
        </p>
        <p v-else-if="isLoading && !frameUrl" class="text-gray-400" data-testid="video-loading">
          読み込み中...
        </p>
        <img
          v-else-if="frameUrl"
          :src="frameUrl"
          alt="ライブフレーム"
          class="w-full h-full object-contain"
          data-testid="video-frame"
        />
      </div>

      <div class="flex items-center justify-between">
        <div class="flex gap-2">
          <button
            v-if="!isStreaming"
            class="btn-primary"
            data-testid="start-btn"
            @click="startStreaming"
          >
            映像開始
          </button>
          <button
            v-else
            class="btn-danger"
            data-testid="stop-btn"
            @click="stopStreaming"
          >
            映像停止
          </button>
        </div>

        <div class="text-sm text-gray-500">
          <span>更新間隔: {{ settingsStore.config.liveVideoUpdateInterval }}秒</span>
          <span class="ml-4">最終更新: {{ lastUpdated }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
