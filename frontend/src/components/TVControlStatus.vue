<script setup lang="ts">
import { ref } from 'vue';
import { useTVControlStore } from '@/stores/tvControlStore';

const tvStore = useTVControlStore();
const sessionIdInput = ref('');

async function loadHistory() {
  if (sessionIdInput.value.trim()) {
    await tvStore.loadHistory(sessionIdInput.value.trim());
  }
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-2xl font-bold">TV制御ステータス</h1>

    <!-- セッション選択 -->
    <div class="bg-white rounded-lg shadow p-4">
      <div class="flex gap-2">
        <input
          v-model="sessionIdInput"
          type="text"
          placeholder="セッションID"
          class="input-field flex-1"
          data-testid="session-input"
        />
        <button class="btn-primary" data-testid="load-btn" @click="loadHistory">履歴読み込み</button>
      </div>
    </div>

    <!-- エラー表示 -->
    <div v-if="tvStore.error" class="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700" data-testid="error-msg">
      {{ tvStore.error }}
    </div>

    <!-- ステータス -->
    <div v-if="tvStore.status" class="bg-white rounded-lg shadow p-4" data-testid="status-card">
      <h2 class="text-lg font-semibold mb-3">現在のステータス</h2>
      <div class="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span class="text-gray-500">リクエスト中:</span>
          <span class="ml-1 font-medium">{{ tvStore.status.isRequesting ? 'はい' : 'いいえ' }}</span>
        </div>
        <div>
          <span class="text-gray-500">リクエスト数:</span>
          <span class="ml-1 font-medium">{{ tvStore.status.requestCount }}</span>
        </div>
      </div>
    </div>

    <!-- 制御履歴 -->
    <div v-if="tvStore.history.length > 0" class="bg-white rounded-lg shadow p-4" data-testid="history-table">
      <h2 class="text-lg font-semibold mb-3">制御履歴</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b">
              <th class="text-left p-2">時刻</th>
              <th class="text-left p-2">アクション</th>
              <th class="text-left p-2">理由</th>
              <th class="text-left p-2">結果</th>
              <th class="text-left p-2">方式</th>
              <th class="text-left p-2">エラー</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="record in tvStore.history" :key="record.timestamp" class="border-b">
              <td class="p-2">{{ new Date(record.timestamp).toLocaleTimeString('ja-JP') }}</td>
              <td class="p-2">{{ record.action }}</td>
              <td class="p-2">{{ record.reason }}</td>
              <td class="p-2">
                <span :class="record.success ? 'text-green-600' : 'text-red-600'">
                  {{ record.success ? '成功' : '失敗' }}
                </span>
              </td>
              <td class="p-2">{{ record.method }}</td>
              <td class="p-2">{{ record.error || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
