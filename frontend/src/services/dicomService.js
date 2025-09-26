import api from './api';

export const searchStudies = async (params = {}) => {
  const response = await api.get('/dicom/studies', { params });
  return response.data; // { items, limit, offset }
};

export const getPACSBase = async () => {
  const response = await api.get('/dicom/base-url');
  return response.data; // { pacs_url, studies_base }
};

export const getStudiesStats = async () => {
  try {
    // Try to get a sample of studies to get a reasonable count
    // Since DICOM studies might not support high limits, we'll use a smaller sample
    const response = await api.get('/dicom/studies', { 
      params: { 
        limit: 50, // Use a smaller, safer limit
        offset: 0 
      }
    });
    const studies = response.data.items || [];
    
    // For now, return the sample count
    // In a real system, you might want to implement a dedicated count endpoint
    return {
      totalStudies: studies.length
    };
  } catch (error) {
    console.error('Error fetching studies stats:', error);
    return {
      totalStudies: 0
    };
  }
};

export const checkPACSHealth = async () => {
  try {
    const response = await api.get('/dicom/health');
    return response.data; // { status, healthy, responseTime?, message, error? }
  } catch (error) {
    console.error('Error checking PACS health:', error);
    return {
      status: 'error',
      healthy: false,
      message: 'Failed to check PACS health',
      error: 'REQUEST_FAILED'
    };
  }
};
