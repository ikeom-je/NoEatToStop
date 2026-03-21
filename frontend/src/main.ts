import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './style.css';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

// 認証チェック（router の beforeEach より先に実行）
import { useAuthStore } from '@/stores/authStore';
const authStore = useAuthStore();
authStore.checkAuth();

app.use(router);
app.mount('#app');
