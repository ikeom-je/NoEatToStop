<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '@/stores/authStore';

const menuOpen = ref(false);
const authStore = useAuthStore();

const navItems = [
  { path: '/', label: 'ダッシュボード' },
  { path: '/live-video', label: 'ライブ映像' },
  { path: '/meal-history', label: '食事履歴' },
  { path: '/settings', label: 'システム設定' },
  { path: '/tv-control', label: 'TV制御' },
  { path: '/chewing-states', label: '咀嚼状態' },
  { path: '/error-analysis', label: 'エラー分析' },
  { path: '/evidence', label: 'エビデンス' },
  { path: '/emergency', label: '緊急制御' },
];
</script>

<template>
  <div class="min-h-screen bg-gray-100">
    <!-- ヘッダー -->
    <header class="bg-white shadow">
      <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <h1 class="text-xl font-bold text-blue-600">NoEatToStop</h1>
        <div class="flex items-center gap-4">
          <template v-if="authStore.authenticated">
            <span class="hidden sm:inline text-sm text-gray-500">{{ authStore.userEmail }}</span>
            <button
              class="text-sm text-gray-600 hover:text-red-600"
              @click="authStore.logout()"
            >
              ログアウト
            </button>
          </template>
          <button class="md:hidden" @click="menuOpen = !menuOpen">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
        <nav class="hidden md:flex gap-4 text-sm">
          <router-link
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="text-gray-600 hover:text-blue-600"
            active-class="text-blue-600 font-semibold"
          >
            {{ item.label }}
          </router-link>
        </nav>
      </div>
      <!-- モバイルメニュー -->
      <nav v-if="menuOpen" class="md:hidden border-t px-4 py-2 space-y-1">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="block py-1 text-gray-600 hover:text-blue-600"
          active-class="text-blue-600 font-semibold"
          @click="menuOpen = false"
        >
          {{ item.label }}
        </router-link>
      </nav>
    </header>

    <!-- メインコンテンツ -->
    <main class="max-w-7xl mx-auto px-4 py-6">
      <router-view />
    </main>
  </div>
</template>
