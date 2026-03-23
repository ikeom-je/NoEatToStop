import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/authStore';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/callback',
      name: 'callback',
      component: () => import('@/components/AuthCallback.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/components/Dashboard.vue'),
    },
    {
      path: '/live-video',
      name: 'live-video',
      component: () => import('@/components/LiveVideo.vue'),
    },
    {
      path: '/meal-history',
      name: 'meal-history',
      component: () => import('@/components/MealHistory.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/components/SystemSettings.vue'),
    },
    {
      path: '/emergency',
      name: 'emergency',
      component: () => import('@/components/EmergencyControl.vue'),
    },
    {
      path: '/tv-control',
      name: 'tv-control',
      component: () => import('@/components/TVControlStatus.vue'),
    },
    {
      path: '/error-analysis',
      name: 'error-analysis',
      component: () => import('@/components/ErrorAnalysis.vue'),
    },
    {
      path: '/chewing-states',
      name: 'chewing-states',
      component: () => import('@/components/ChewingStates.vue'),
    },
    {
      path: '/evidence',
      name: 'evidence',
      component: () => import('@/components/EvidenceAnalysis.vue'),
    },
  ],
});

router.beforeEach(async (to) => {
  if (to.meta.requiresAuth === false) return true;

  const authStore = useAuthStore();
  if (!authStore.authenticated) {
    await authStore.login();
    return false;
  }
  return true;
});

export default router;
