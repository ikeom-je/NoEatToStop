<script setup lang="ts">
import { onMounted } from 'vue';
import { useTVControlStore } from '@/stores/tvControlStore';

const tvStore = useTVControlStore();

const actionLabels: Record<string, string> = {
  turn_on: 'TV ON',
  turn_off: 'TV OFF',
};

const sourceLabels: Record<string, string> = {
  edge: 'エッジ検出',
  console: '管理画面',
};

function formatTime(ts: string): string {
  return new Date(ts).toLocaleString('ja-JP');
}

onMounted(() => {
  tvStore.loadEvents();
});
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">TV制御ステータス</h1>
      <button class="btn-secondary text-sm" @click="tvStore.loadEvents()" :disabled="tvStore.loading">
        {{ tvStore.loading ? '読込中...' : '更新' }}
      </button>
    </div>

    <!-- TV 制御ボタン -->
    <div class="bg-white rounded-lg shadow p-4">
      <h2 class="text-lg font-semibold mb-3">手動制御</h2>
      <div class="flex gap-3">
        <button
          class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          :disabled="tvStore.commandSending"
          @click="tvStore.sendCommand('turn_on')"
        >
          {{ tvStore.commandSending ? '送信中...' : 'TV ON' }}
        </button>
        <button
          class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          :disabled="tvStore.commandSending"
          @click="tvStore.sendCommand('turn_off')"
        >
          {{ tvStore.commandSending ? '送信中...' : 'TV OFF' }}
        </button>
      </div>
    </div>

    <!-- エラー表示 -->
    <div v-if="tvStore.error" class="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700">
      {{ tvStore.error }}
    </div>

    <!-- イベント履歴 -->
    <div v-if="tvStore.events.length === 0 && !tvStore.loading" class="bg-white rounded-lg shadow p-6 text-center text-gray-500">
      制御履歴がありません
    </div>

    <div v-else class="bg-white rounded-lg shadow overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 text-gray-600">
          <tr>
            <th class="px-3 py-2 text-left">時刻</th>
            <th class="px-3 py-2 text-left">アクション</th>
            <th class="px-3 py-2 text-left">理由</th>
            <th class="px-3 py-2 text-left">ソース</th>
            <th class="px-3 py-2 text-left">結果</th>
            <th class="px-3 py-2 text-left">方式</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ev in tvStore.events" :key="ev.epochSeconds" class="border-t border-gray-100 hover:bg-gray-50">
            <td class="px-3 py-2 text-gray-600 whitespace-nowrap">{{ formatTime(ev.timestamp) }}</td>
            <td class="px-3 py-2">
              <span
                class="inline-block px-2 py-0.5 rounded text-xs font-medium"
                :class="ev.action === 'turn_on' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'"
              >
                {{ actionLabels[ev.action] || ev.action }}
              </span>
            </td>
            <td class="px-3 py-2 text-gray-600">{{ ev.reason }}</td>
            <td class="px-3 py-2">
              <span class="text-xs" :class="ev.source === 'console' ? 'text-blue-600' : 'text-gray-500'">
                {{ sourceLabels[ev.source] || ev.source }}
              </span>
            </td>
            <td class="px-3 py-2">
              <span :class="ev.success ? 'text-green-600' : 'text-red-600'">
                {{ ev.success ? '成功' : '失敗' }}
              </span>
              <span v-if="ev.error" class="text-xs text-red-400 ml-1">{{ ev.error }}</span>
            </td>
            <td class="px-3 py-2 text-gray-500 text-xs">{{ ev.method }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
