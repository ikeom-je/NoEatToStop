<script setup lang="ts">
import { ref } from 'vue';

const systemPaused = ref(false);
const cameraEnabled = ref(true);
const cloudEnabled = ref(true);
const actionLog = ref<Array<{ time: string; action: string }>>([]);

function toggleSystem() {
  systemPaused.value = !systemPaused.value;
  log(systemPaused.value ? 'システム停止' : 'システム再開');
}

function toggleCamera() {
  cameraEnabled.value = !cameraEnabled.value;
  log(cameraEnabled.value ? 'カメラ有効化' : 'カメラ無効化');
}

function toggleCloud() {
  cloudEnabled.value = !cloudEnabled.value;
  log(cloudEnabled.value ? 'クラウド送信有効化' : 'クラウド送信無効化 (エッジのみ)');
}

function forceTVOn() {
  log('TV強制ON');
}

function forceTVOff() {
  log('TV強制OFF');
}

function log(action: string) {
  actionLog.value.unshift({
    time: new Date().toLocaleTimeString('ja-JP'),
    action,
  });
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-2xl font-bold text-red-600">緊急制御</h1>

    <!-- システム制御 -->
    <div class="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
      <h2 class="text-lg font-semibold mb-3">システム制御</h2>
      <div class="flex flex-wrap gap-3">
        <button
          class="px-4 py-2 rounded font-medium"
          :class="systemPaused ? 'bg-green-600 text-white' : 'bg-red-600 text-white'"
          data-testid="system-toggle"
          @click="toggleSystem"
        >
          {{ systemPaused ? 'システム再開' : 'システム停止' }}
        </button>
      </div>
    </div>

    <!-- デバイス制御 -->
    <div class="bg-white rounded-lg shadow p-4">
      <h2 class="text-lg font-semibold mb-3">デバイス制御</h2>
      <div class="flex flex-wrap gap-3">
        <button
          class="px-4 py-2 rounded font-medium"
          :class="cameraEnabled ? 'bg-yellow-500 text-white' : 'bg-green-600 text-white'"
          data-testid="camera-toggle"
          @click="toggleCamera"
        >
          {{ cameraEnabled ? 'カメラ停止' : 'カメラ開始' }}
        </button>
        <button
          class="px-4 py-2 rounded font-medium"
          :class="cloudEnabled ? 'bg-yellow-500 text-white' : 'bg-green-600 text-white'"
          data-testid="cloud-toggle"
          @click="toggleCloud"
        >
          {{ cloudEnabled ? 'クラウド送信停止' : 'クラウド送信開始' }}
        </button>
      </div>
    </div>

    <!-- TV手動制御 -->
    <div class="bg-white rounded-lg shadow p-4">
      <h2 class="text-lg font-semibold mb-3">TV手動制御</h2>
      <div class="flex gap-3">
        <button class="bg-blue-600 text-white px-4 py-2 rounded font-medium" data-testid="tv-on" @click="forceTVOn">
          TV ON
        </button>
        <button class="bg-gray-600 text-white px-4 py-2 rounded font-medium" data-testid="tv-off" @click="forceTVOff">
          TV OFF
        </button>
      </div>
    </div>

    <!-- アクションログ -->
    <div v-if="actionLog.length > 0" class="bg-white rounded-lg shadow p-4" data-testid="action-log">
      <h2 class="text-lg font-semibold mb-3">操作ログ</h2>
      <ul class="space-y-1 text-sm">
        <li v-for="(entry, i) in actionLog" :key="i" class="flex gap-2">
          <span class="text-gray-500">{{ entry.time }}</span>
          <span>{{ entry.action }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>
