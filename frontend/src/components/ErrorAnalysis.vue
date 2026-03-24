<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { frameHistoryApi, labelsApi, type FrameHistoryRecord } from '@/services/apiService';

const frames = ref<FrameHistoryRecord[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
// epochMs -> Set<label> のマップ（既存ラベル復元＋新規追加用）
const frameLabels = ref<Map<number, Set<string>>>(new Map());

const stateLabels: Record<string, string> = {
  chewing: '咀嚼中',
  chewing_stopped: '咀嚼停止',
  meal_ended: '食事終了',
  waiting: '待機',
};

const labelButtons = [
  { key: 'ok', text: 'OK', activeClass: 'bg-green-500 text-white', inactiveClass: 'bg-green-100 text-green-700 hover:bg-green-200' },
  { key: 'ng_face', text: 'NG顔', activeClass: 'bg-red-500 text-white', inactiveClass: 'bg-red-100 text-red-700 hover:bg-red-200' },
  { key: 'ng_mouth', text: 'NG口', activeClass: 'bg-orange-500 text-white', inactiveClass: 'bg-orange-100 text-orange-700 hover:bg-orange-200' },
  { key: 'ng_chewing', text: 'NG咀嚼', activeClass: 'bg-purple-500 text-white', inactiveClass: 'bg-purple-100 text-purple-700 hover:bg-purple-200' },
];

function hasLabel(epochMs: number, label: string): boolean {
  return frameLabels.value.get(epochMs)?.has(label) ?? false;
}

function getLabels(epochMs: number): Set<string> {
  if (!frameLabels.value.has(epochMs)) {
    frameLabels.value.set(epochMs, new Set());
  }
  return frameLabels.value.get(epochMs)!;
}

async function toggleLabel(frame: FrameHistoryRecord, label: string) {
  const labels = getLabels(frame.epochMs);
  try {
    if (labels.has(label)) {
      await labelsApi.remove({ epochMs: frame.epochMs, label });
      labels.delete(label);
    } else {
      await labelsApi.save({
        epochMs: frame.epochMs,
        s3Key: frame.s3Key,
        label,
        state: frame.state,
        confidence: frame.confidence,
        motionScore: frame.motionScore,
        facesDetected: frame.facesDetected,
      });
      labels.add(label);
    }
  } catch {
    error.value = 'ラベル操作に失敗しました';
  }
}

async function loadFrames() {
  loading.value = true;
  error.value = null;
  try {
    const [framesData, labelsData] = await Promise.all([
      frameHistoryApi.getRecent(undefined, 50),
      labelsApi.getRecent(undefined, 500),
    ]);
    frames.value = framesData;

    // 既存ラベルを復元
    const labelMap = new Map<number, Set<string>>();
    for (const lr of labelsData) {
      const existing = labelMap.get(lr.epochMs) || new Set<string>();
      for (const l of lr.labels) {
        existing.add(l);
      }
      labelMap.set(lr.epochMs, existing);
    }
    frameLabels.value = labelMap;
  } catch {
    error.value = 'データの取得に失敗しました';
  } finally {
    loading.value = false;
  }
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.5) return 'text-green-600';
  if (confidence > 0) return 'text-yellow-600';
  return 'text-red-600';
}

onMounted(() => {
  loadFrames();
});
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">検出ラベリング</h1>
      <button class="btn-secondary text-sm" @click="loadFrames" :disabled="loading">
        {{ loading ? '読込中...' : '更新' }}
      </button>
    </div>

    <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-700 text-sm">
      各フレームの検出結果を確認し、OK/NG をラベリングしてください。複数ラベルの選択・解除が可能です。ラベリングデータは将来の閾値最適化に使用されます。
    </div>

    <div v-if="error" class="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700">
      {{ error }}
    </div>

    <div v-if="frames.length === 0 && !loading" class="bg-white rounded-lg shadow p-6 text-center text-gray-500">
      フレームデータがありません
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div
        v-for="frame in frames"
        :key="frame.epochMs"
        class="bg-white rounded-lg shadow overflow-hidden"
        :class="{ 'ring-2 ring-green-400': getLabels(frame.epochMs).size > 0 }"
      >
        <!-- フレーム画像 -->
        <div class="aspect-video bg-gray-100 relative">
          <img
            v-if="frame.frameUrl"
            :src="frame.frameUrl"
            class="w-full h-full object-contain"
            loading="lazy"
          />
          <div v-if="getLabels(frame.epochMs).size > 0" class="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
            ラベル済 ({{ getLabels(frame.epochMs).size }})
          </div>
        </div>

        <!-- メタデータ -->
        <div class="p-3 text-sm space-y-2">
          <div class="flex justify-between items-center">
            <span class="text-gray-500">{{ new Date(frame.epochMs).toLocaleString('ja-JP') }}</span>
            <span
              class="inline-block px-2 py-0.5 rounded text-xs font-medium"
              :class="frame.state === 'chewing' ? 'bg-green-100 text-green-800' : frame.state === 'chewing_stopped' ? 'bg-yellow-100 text-yellow-800' : frame.state === 'meal_ended' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'"
            >
              {{ stateLabels[frame.state] || frame.state }}
            </span>
          </div>

          <div class="grid grid-cols-3 gap-2 text-xs">
            <div>
              <span class="text-gray-400">精度</span>
              <span class="ml-1 font-mono" :class="confidenceColor(frame.confidence)">
                {{ frame.confidence.toFixed(2) }}
              </span>
            </div>
            <div>
              <span class="text-gray-400">Motion</span>
              <span class="ml-1 font-mono">{{ frame.motionScore }}</span>
            </div>
            <div>
              <span class="text-gray-400">顔</span>
              <span class="ml-1 font-mono">{{ frame.facesDetected }}</span>
            </div>
          </div>

          <!-- ラベリングボタン（トグル式、常に表示） -->
          <div class="flex gap-1 pt-1">
            <button
              v-for="btn in labelButtons"
              :key="btn.key"
              class="flex-1 px-2 py-1.5 text-xs rounded transition-colors"
              :class="hasLabel(frame.epochMs, btn.key) ? btn.activeClass : btn.inactiveClass"
              @click="toggleLabel(frame, btn.key)"
            >
              {{ btn.text }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
