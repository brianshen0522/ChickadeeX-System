import api from './api';

export const getProfile = async () => {
  const res = await api.get('/users/profile');
  return res.data;
};

export const updateProfile = async (payload) => {
  const res = await api.put('/users/profile', payload);
  return res.data;
};

export const updatePassword = async (payload) => {
  const res = await api.put('/users/password', payload);
  return res.data;
};

