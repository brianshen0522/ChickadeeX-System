import api from './api';

export const getReports = async (params = {}) => {
  const response = await api.get('/reports', { params });
  return response.data;
};

export const getReport = async (reportId) => {
  const response = await api.get(`/reports/${reportId}`);
  return response.data;
};

export const createReport = async (reportData) => {
  const response = await api.post('/reports', reportData);
  return response.data;
};

export const createReportVersion = async (reportId, versionData) => {
  const response = await api.post(`/reports/${reportId}/versions`, versionData);
  return response.data;
};

export const updateLatestReportVersion = async (reportId, payload) => {
  const response = await api.put(`/reports/${reportId}/versions/latest`, payload);
  return response.data;
};

export const generateAIReport = async (reportId, params) => {
  const response = await api.post(`/reports/${reportId}/generate`, params);
  return response.data;
};

export const generateReportPreview = async (reportId, params = {}) => {
  const response = await api.post(`/reports/${reportId}/generate-preview`, params);
  return response.data;
};

export const finalizeReport = async (reportId) => {
  const response = await api.post(`/reports/${reportId}/finalize`);
  return response.data;
};

export const exportReport = async (reportId, format = 'json') => {
  const response = await api.get(`/reports/${reportId}/export`, {
    params: { format },
    responseType: format === 'csv' ? 'blob' : 'json'
  });
  return response.data;
};

export const getReportsStats = async () => {
  try {
    // Fetch all reports by paginating through them
    let allReports = [];
    let offset = 0;
    const limit = 100; // Max allowed limit
    let hasMore = true;

    while (hasMore) {
      const response = await api.get('/reports', { 
        params: { 
          limit,
          offset 
        }
      });
      
      const reports = response.data.reports || [];
      allReports = [...allReports, ...reports];
      
      // Check if we got less than the limit, meaning we've reached the end
      hasMore = reports.length === limit;
      offset += limit;
    }
    
    const totalReports = allReports.length;
    const draftReports = allReports.filter(r => !r.is_finalized).length;
    const finalizedReports = allReports.filter(r => r.is_finalized).length;
    
    return {
      totalReports,
      draftReports,
      finalizedReports
    };
  } catch (error) {
    console.error('Error fetching report stats:', error);
    return {
      totalReports: 0,
      draftReports: 0,
      finalizedReports: 0
    };
  }
};
