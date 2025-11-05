import api from './api';

const AUTH_TOKEN_KEY = 'cx_auth_token';

const applyAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
};

export const storeAuthToken = (token) => {
  if (typeof window !== 'undefined') {
    if (token) {
      window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  }
  applyAuthToken(token);
};

export const bootstrapAuthToken = () => {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem(AUTH_TOKEN_KEY);
  applyAuthToken(stored);
  return stored;
};

export const clearAuthToken = () => {
  storeAuthToken(null);
};

export const login = async (credentials) => {
  const response = await api.post('/auth/login', credentials);
  return response.data;
};


export const logout = async () => {
  const response = await api.post('/auth/logout');
  return response.data;
};

export const refreshToken = async () => {
  const response = await api.post('/auth/refresh');
  return response.data;
};

export const getCurrentUser = async () => {
  const response = await api.get('/auth/me');
  return response.data;
};
