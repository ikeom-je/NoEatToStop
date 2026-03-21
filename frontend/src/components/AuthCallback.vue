<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/authStore';

const router = useRouter();
const authStore = useAuthStore();
const error = ref<string | null>(null);

onMounted(async () => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');

  if (!code) {
    error.value = '認証コードが見つかりません';
    return;
  }

  try {
    await authStore.handleCallback(code);
    router.replace('/');
  } catch (e) {
    error.value = e instanceof Error ? e.message : '認証に失敗しました';
  }
});
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-100">
    <div class="bg-white p-8 rounded shadow text-center">
      <template v-if="error">
        <p class="text-red-600 mb-4">{{ error }}</p>
        <button
          class="text-blue-600 hover:underline"
          @click="authStore.login()"
        >
          ログインに戻る
        </button>
      </template>
      <template v-else>
        <p class="text-gray-600">認証中...</p>
      </template>
    </div>
  </div>
</template>
