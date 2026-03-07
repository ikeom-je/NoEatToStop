<script setup lang="ts">
import { onMounted } from 'vue';
import { useSettingsStore } from '@/stores/settingsStore';

const settingsStore = useSettingsStore();

onMounted(() => {
  settingsStore.loadSettings();
});

async function handleSave() {
  await settingsStore.saveSettings();
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-2xl font-bold">システム設定</h1>

    <div v-if="settingsStore.error" class="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700" data-testid="error-msg">
      {{ settingsStore.error }}
    </div>
    <div v-if="settingsStore.saved" class="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700" data-testid="saved-msg">
      設定を保存しました
    </div>

    <!-- 咀嚼・検出設定 -->
    <div class="bg-white rounded-lg shadow p-4">
      <h2 class="text-lg font-semibold mb-3">検出・判定設定</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="label-text">咀嚼停止閾値 (秒)</label>
          <input
            type="number"
            :value="settingsStore.config.pauseThreshold"
            class="input-field"
            data-testid="pause-threshold"
            @input="settingsStore.updateField('pauseThreshold', Number(($event.target as HTMLInputElement).value))"
          />
        </div>
        <div>
          <label class="label-text">信頼度閾値</label>
          <input
            type="number"
            step="0.05"
            min="0"
            max="1"
            :value="settingsStore.config.confidenceThreshold"
            class="input-field"
            data-testid="confidence-threshold"
            @input="settingsStore.updateField('confidenceThreshold', Number(($event.target as HTMLInputElement).value))"
          />
        </div>
        <div>
          <label class="label-text">顔検出閾値</label>
          <input
            type="number"
            step="0.05"
            min="0"
            max="1"
            :value="settingsStore.config.faceDetectionThreshold"
            class="input-field"
            @input="settingsStore.updateField('faceDetectionThreshold', Number(($event.target as HTMLInputElement).value))"
          />
        </div>
        <div>
          <label class="label-text">口検出閾値</label>
          <input
            type="number"
            step="0.05"
            min="0"
            max="1"
            :value="settingsStore.config.mouthDetectionThreshold"
            class="input-field"
            @input="settingsStore.updateField('mouthDetectionThreshold', Number(($event.target as HTMLInputElement).value))"
          />
        </div>
        <div>
          <label class="label-text">咀嚼検出閾値</label>
          <input
            type="number"
            step="0.05"
            min="0"
            max="1"
            :value="settingsStore.config.chewingDetectionThreshold"
            class="input-field"
            @input="settingsStore.updateField('chewingDetectionThreshold', Number(($event.target as HTMLInputElement).value))"
          />
        </div>
      </div>
    </div>

    <!-- 対象設定 -->
    <div class="bg-white rounded-lg shadow p-4">
      <h2 class="text-lg font-semibold mb-3">対象設定</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="label-text">子供人数</label>
          <input
            type="number"
            min="1"
            :value="settingsStore.config.childCount"
            class="input-field"
            data-testid="child-count"
            @input="settingsStore.updateField('childCount', Number(($event.target as HTMLInputElement).value))"
          />
        </div>
        <div class="flex items-center gap-2 pt-6">
          <input
            type="checkbox"
            :checked="settingsStore.config.excludeAdults"
            data-testid="exclude-adults"
            @change="settingsStore.updateField('excludeAdults', ($event.target as HTMLInputElement).checked)"
          />
          <label class="label-text mb-0">大人を検出対象から除外</label>
        </div>
      </div>
    </div>

    <!-- 映像設定 -->
    <div class="bg-white rounded-lg shadow p-4">
      <h2 class="text-lg font-semibold mb-3">映像設定</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="label-text">解像度</label>
          <select
            :value="settingsStore.config.videoResolution"
            class="input-field"
            @change="settingsStore.updateField('videoResolution', ($event.target as HTMLSelectElement).value)"
          >
            <option value="320x180">320x180</option>
            <option value="640x360">640x360</option>
            <option value="1280x720">1280x720</option>
          </select>
        </div>
        <div>
          <label class="label-text">フレームレート (fps)</label>
          <input
            type="number"
            min="1"
            max="60"
            :value="settingsStore.config.videoFrameRate"
            class="input-field"
            @input="settingsStore.updateField('videoFrameRate', Number(($event.target as HTMLInputElement).value))"
          />
        </div>
        <div>
          <label class="label-text">ライブ映像更新間隔 (秒)</label>
          <input
            type="number"
            min="1"
            :value="settingsStore.config.liveVideoUpdateInterval"
            class="input-field"
            @input="settingsStore.updateField('liveVideoUpdateInterval', Number(($event.target as HTMLInputElement).value))"
          />
        </div>
        <div>
          <label class="label-text">映像保存期間 (日)</label>
          <input
            type="number"
            min="1"
            :value="settingsStore.config.videoRetentionDays"
            class="input-field"
            @input="settingsStore.updateField('videoRetentionDays', Number(($event.target as HTMLInputElement).value))"
          />
        </div>
      </div>
    </div>

    <!-- TV制御設定 -->
    <div class="bg-white rounded-lg shadow p-4">
      <h2 class="text-lg font-semibold mb-3">TV制御設定</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="label-text">制御方式</label>
          <select
            :value="settingsStore.config.tvControlMethod"
            class="input-field"
            @change="settingsStore.updateField('tvControlMethod', ($event.target as HTMLSelectElement).value as 'smart_tv_api' | 'alexa_voice' | 'mock')"
          >
            <option value="smart_tv_api">Smart TV API</option>
            <option value="alexa_voice">Alexa Voice</option>
            <option value="mock">Mock (テスト用)</option>
          </select>
        </div>
        <div>
          <label class="label-text">リトライ回数</label>
          <input
            type="number"
            min="0"
            :value="settingsStore.config.tvControlRetryCount"
            class="input-field"
            @input="settingsStore.updateField('tvControlRetryCount', Number(($event.target as HTMLInputElement).value))"
          />
        </div>
        <div>
          <label class="label-text">リトライ間隔 (秒)</label>
          <input
            type="number"
            min="1"
            :value="settingsStore.config.tvControlRetryInterval"
            class="input-field"
            @input="settingsStore.updateField('tvControlRetryInterval', Number(($event.target as HTMLInputElement).value))"
          />
        </div>
      </div>
    </div>

    <!-- アクション -->
    <div class="flex gap-3">
      <button class="btn-primary" data-testid="save-btn" @click="handleSave" :disabled="settingsStore.loading">
        {{ settingsStore.loading ? '保存中...' : '設定を保存' }}
      </button>
      <button class="btn-secondary" data-testid="reset-btn" @click="settingsStore.resetToDefaults">
        デフォルトに戻す
      </button>
    </div>
  </div>
</template>
