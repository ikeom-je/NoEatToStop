<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from '@/stores/settingsStore';

const settingsStore = useSettingsStore();
const lastUpdated = ref<string>('-');
const isStreaming = ref(false);
let intervalId: ReturnType<typeof setInterval> | null = null;

function startStreaming() {
  isStreaming.value = true;
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

function refreshFrame() {
  lastUpdated.value = new Date().toLocaleTimeString('ja-JP');
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
      <div class="bg-gray-900 rounded-lg aspect-video flex items-center justify-center mb-4">
        <p v-if="!isStreaming" class="text-gray-400" data-testid="video-placeholder">
          映像を開始してください
        </p>
        <p v-else class="text-gray-400" data-testid="video-streaming">
          KVS ストリーミング ({{ settingsStore.config.videoResolution }})
        </p>
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
