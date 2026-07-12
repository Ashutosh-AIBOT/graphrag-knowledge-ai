import axios, { AxiosError } from 'axios';
import { API_BASE_URL } from './constants';
import { useAuthStore } from '@/store/auth';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 90000, // 90s — LLM calls can be slow
});

// Attach Bearer token to every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Handle 401 (auto-refresh) and 429 (rate limit)
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as any;

    // 429 – surface a clear, user-friendly rate limit message
    if (error.response?.status === 429) {
      const err: any = new Error(
        'LLM rate limit reached (429). Please wait 30 seconds and try again.'
      );
      err.response = { data: { error: err.message }, status: 429 };
      return Promise.reject(err);
    }

    // 401 – try to refresh the token once
    if (
      error.response?.status === 401 &&
      !original._retry &&
      typeof window !== 'undefined'
    ) {
      original._retry = true;
      const refresh = useAuthStore.getState().refreshToken;
      if (refresh) {
        try {
          const { data } = await axios.post(`${API_BASE_URL}/auth/token/refresh/`, { refresh });
          useAuthStore.getState().setTokens(data.access, refresh);
          original.headers.Authorization = `Bearer ${data.access}`;
          return api(original);
        } catch {
          useAuthStore.getState().logout();
        }
      }
    }

    return Promise.reject(error);
  }
);

export default api;
