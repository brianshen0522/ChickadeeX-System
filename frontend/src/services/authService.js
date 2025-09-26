import api from './api';

export const login = async (credentials) => {
  const response = await api.post('/auth/login', credentials);
  return response.data;
};

export const ssoCallback = async (accessToken) => {
  const response = await api.post('/auth/sso/callback', { access_token: accessToken });
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

// setAuthToken removed - using httpOnly cookies now