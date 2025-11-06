import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = process.env.REACT_APP_API_URL || '';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Include cookies in requests
});

// Request interceptor - cookies are handled automatically
api.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    const { response, config } = error;

    if (response?.status === 401) {
      // Unauthorized - cookies are cleared by server, just redirect
      if (window.location.pathname !== '/login') {
        toast.error('Session expired. Please log in again.');
        window.location.href = '/login';
      }
    } else if (response?.status === 403) {
      toast.error('Access denied. You do not have permission to perform this action.');
    } else if (response?.status === 429) {
      toast.error('Too many requests. Please wait a moment and try again.');
    } else if (response?.status === 503) {
      // Service unavailable - don't show toast for auth/me calls to avoid spam
      if (!config?.url?.includes('/auth/me')) {
        toast.error('Service temporarily unavailable. Please try again in a moment.');
      }
    } else if (response?.status >= 500) {
      // Don't show toast for auth/me calls to avoid spam during startup
      if (!config?.url?.includes('/auth/me')) {
        toast.error('Server error. Please try again later.');
      }
    } else if (response?.data?.error) {
      toast.error(response.data.error);
    } else if (error.message && !config?.url?.includes('/auth/me')) {
      toast.error(error.message);
    }

    return Promise.reject(error);
  }
);

export default api;