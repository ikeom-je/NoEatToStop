import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  redirectToLogin,
  handleCallback as authHandleCallback,
  isAuthenticated as authIsAuthenticated,
  getUserEmail,
  logout as authLogout,
} from '@/services/authService';

export const useAuthStore = defineStore('auth', () => {
  const authenticated = ref(false);
  const isLoading = ref(false);
  const userEmail = ref<string | null>(null);

  function checkAuth() {
    authenticated.value = authIsAuthenticated();
    userEmail.value = getUserEmail();
  }

  async function login() {
    await redirectToLogin();
  }

  async function handleCallback(code: string) {
    isLoading.value = true;
    try {
      await authHandleCallback(code);
      authenticated.value = true;
      userEmail.value = getUserEmail();
    } finally {
      isLoading.value = false;
    }
  }

  function logout() {
    authenticated.value = false;
    userEmail.value = null;
    authLogout();
  }

  return { authenticated, isLoading, userEmail, checkAuth, login, handleCallback, logout };
});
