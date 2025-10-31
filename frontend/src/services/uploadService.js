import api from './api';

const BASE_PATH = '/demo';

const buildParams = (params = {}) => {
  const result = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      result[key] = value;
    }
  });
  return result;
};

export const listUploads = async ({ cursor, limit } = {}) => {
  const response = await api.get(BASE_PATH, { params: buildParams({ cursor, limit }) });
  return response.data;
};

export const getUpload = async (uploadId) => {
  const response = await api.get(`${BASE_PATH}/${uploadId}`);
  return response.data;
};

export const uploadFile = async (file, options = {}) => {
  const formData = new FormData();
  formData.append('file', file);
  if (options.modality) {
    formData.append('modality', options.modality);
  }

  const response = await api.post(BASE_PATH, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
};

export const deleteUpload = async (uploadId) => {
  const response = await api.delete(`${BASE_PATH}/${uploadId}`);
  return response.data;
};

export const generateUploadReport = async (uploadId, payload = {}) => {
  const response = await api.post(`${BASE_PATH}/${uploadId}/generate`, payload);
  return response.data;
};

export const createReportFromUpload = async (uploadId) => {
  const response = await api.post(`${BASE_PATH}/${uploadId}/reports`);
  return response.data;
};

export const saveReportVersion = async (uploadId, reportId, { findings, impression }) => {
  const response = await api.post(`${BASE_PATH}/${uploadId}/reports/${reportId}/versions`, {
    findings,
    impression
  });
  return response.data;
};

export const getUploadReport = async (uploadId) => {
  const response = await api.get(`${BASE_PATH}/${uploadId}/reports`);
  return response.data;
};
