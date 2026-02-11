import api from './api';

export const getReports = async (params = {}) => {
  const response = await api.get('/reports', { params });
  return response.data;
};

export const getReportsSummary = async () => {
  const response = await api.get('/reports/summary');
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

export const updateReportDescription = async (reportId, payload) => {
  const response = await api.put(`/reports/${reportId}/description`, payload);
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

export const generateReportPreviewStream = (reportId, { onStage, onResult, onError, onDone } = {}) => {
  const API_URL = process.env.REACT_APP_API_URL || '';
  const url = `${API_URL}/api/reports/${reportId}/generate-preview-stream`;
  const eventSource = new EventSource(url, { withCredentials: true });

  eventSource.addEventListener('stage', (e) => {
    try { if (onStage) onStage(JSON.parse(e.data)); } catch (_) {}
  });

  eventSource.addEventListener('result', (e) => {
    try { if (onResult) onResult(JSON.parse(e.data)); } catch (_) {}
  });

  eventSource.addEventListener('error', (e) => {
    try {
      const data = e.data ? JSON.parse(e.data) : { message: 'Connection error' };
      if (onError) onError(data);
    } catch (_) {
      if (onError) onError({ message: 'Connection error' });
    }
  });

  eventSource.addEventListener('done', () => {
    eventSource.close();
    if (onDone) onDone();
  });

  // Handle connection errors
  eventSource.onerror = () => {
    eventSource.close();
    if (onError) onError({ message: 'SSE connection failed' });
    if (onDone) onDone();
  };

  // Return close function for cleanup
  return () => eventSource.close();
};

export const deleteReport = async (reportId) => {
  const response = await api.delete(`/reports/${reportId}`);
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

export const getReportsStats = async (params = {}) => {
  try {
    // Fetch all reports by paginating through them
    let allReports = [];
    let offset = 0;
    const limit = 100; // Max allowed limit
    let hasMore = true;

    while (hasMore) {
      const response = await api.get('/reports', {
        params: {
          ...params,
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
