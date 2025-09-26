import api from './api';

// User management
export const getUsers = async () => {
  const response = await api.get('/admin/users');
  return response.data;
};

export const getUser = async (userId) => {
  const response = await api.get(`/admin/users/${userId}`);
  return response.data;
};

export const updateUser = async (userId, userData) => {
  const response = await api.put(`/admin/users/${userId}`, userData);
  return response.data;
};

export const setUserRole = async (userId, role) => {
  const response = await api.put(`/admin/users/${userId}/role`, { role });
  return response.data;
};

export const clearUserPassword = async (userId) => {
  const response = await api.delete(`/admin/users/${userId}/password`);
  return response.data;
};

export const deleteUser = async (userId) => {
  const response = await api.delete(`/admin/users/${userId}`);
  return response.data;
};

// LLM configurations
export const getLLMConfigs = async () => {
  const response = await api.get('/admin/llm-configs');
  return response.data;
};

export const createLLMConfig = async (configData) => {
  const response = await api.post('/admin/llm-configs', configData);
  return response.data;
};

export const updateLLMConfig = async (configId, configData) => {
  const response = await api.put(`/admin/llm-configs/${configId}`, configData);
  return response.data;
};

export const testLLMConfig = async (configId) => {
  const response = await api.post(`/admin/llm-configs/${configId}/test`);
  return response.data;
};

export const deleteLLMConfig = async (configId) => {
  const response = await api.delete(`/admin/llm-configs/${configId}`);
  return response.data;
};

export const listProviderModels = async (provider, apiKey, endpoint) => {
  const response = await api.post('/admin/llm-models', {
    provider,
    api_key: apiKey,
    endpoint,
  });
  return response.data; // { provider, models: [{id}] }
};

// System flags
export const getSystemSettings = async () => {
  const response = await api.get('/admin/system-settings');
  return response.data;
};

export const updateSystemSettings = async (payload) => {
  const response = await api.put('/admin/system-settings', payload);
  return response.data;
};

// PACS configuration
export const getPACSConfig = async () => {
  const response = await api.get('/admin/pacs-config');
  return response.data;
};

export const updatePACSConfig = async (configData) => {
  const response = await api.post('/admin/pacs-config', configData);
  return response.data;
};

// Statistics
export const getStatistics = async () => {
  const response = await api.get('/admin/statistics');
  return response.data;
};

// Simple user statistics
export const getUserStats = async () => {
  try {
    const users = await getUsers();
    const totalUsers = users.length;
    
    // Check for is_active field (true = active, false/null = inactive)
    const activeUsers = users.filter(user => user.is_active !== false).length;
    const inactiveUsers = users.filter(user => user.is_active === false).length;
    
    return {
      totalUsers,
      activeUsers,
      inactiveUsers
    };
  } catch (error) {
    console.error('Error fetching user stats:', error);
    return {
      totalUsers: 0,
      activeUsers: 0,
      inactiveUsers: 0
    };
  }
};

// LLM configurations for doctors (non-admin access)
export const getCurrentLLMConfigs = async () => {
  const response = await api.get('/reports/llm-configs');
  return response.data;
};

// Audit logs
export const getAuditLogs = async (params = {}) => {
  const response = await api.get('/audit', { params });
  return response.data;
};

export const getAuditStats = async (params = {}) => {
  const response = await api.get('/audit/stats', { params });
  return response.data;
};
