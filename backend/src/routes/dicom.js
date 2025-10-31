const express = require('express');
const axios = require('axios');
const { authenticateToken, requireAnyRole } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const { getDB } = require('../database/connection');

const router = express.Router();

router.use(authenticateToken);
router.use(requireAnyRole(['doctor']));

// GET /api/dicom/base-url - expose configured PACS base and studies endpoint
router.get('/base-url', async (req, res) => {
  try {
    const db = getDB();
    const cfg = await db.query('SELECT pacs_url FROM pacs_config LIMIT 1');
    if (cfg.rows.length === 0 || !cfg.rows[0].pacs_url) {
      return res.status(503).json({ error: 'PACS settings not configured' });
    }
    const pacsUrl = String(cfg.rows[0].pacs_url || '').replace(/\/*$/, '');
    const studiesBase = /\/studies$/i.test(pacsUrl) ? pacsUrl : `${pacsUrl}/studies`;
    return res.json({ pacs_url: pacsUrl, studies_base: studiesBase });
  } catch (error) {
    logger.error('Get PACS base-url failed:', error?.message || error);
    return res.status(500).json({ error: 'Failed to get PACS base URL' });
  }
});

// GET /api/dicom/studies - proxy to DICOMweb QIDO-RS with filters
router.get('/studies', async (req, res) => {
  try {
    // Resolve PACS DICOMweb studies endpoint from settings
    const db = getDB();
    const cfg = await db.query('SELECT pacs_url, auth_type, credentials, connection_timeout, query_timeout FROM pacs_config LIMIT 1');
    if (cfg.rows.length === 0 || !cfg.rows[0].pacs_url) {
      return res.status(503).json({ error: 'PACS settings not configured' });
    }
    const { pacs_url: baseUrl, auth_type, credentials, query_timeout } = cfg.rows[0];
    const {
      patientId,
      patientName,
      studyUID,
      accessionNumber,
      studyDescription,
      modalitySelect,
      modalities,
      studyDate,
      studyDateFrom,
      studyDateTo,
      limit = 50,
      offset = 0
    } = req.query;

    const params = {};
    if (patientId) params['PatientID'] = patientId;
    if (patientName) {
      // Add wildcard matching for patient name - support partial matching
      const searchName = patientName.trim();
      if (searchName) {
        // If the user input doesn't already contain wildcards, make it partial match
        if (!searchName.includes('*')) {
          params['PatientName'] = `*${searchName}*`;
        } else {
          params['PatientName'] = searchName;
        }
      }
    }
    if (studyUID) params['StudyInstanceUID'] = studyUID;
    if (accessionNumber) params['AccessionNumber'] = accessionNumber;
    if (studyDescription) params['StudyDescription'] = studyDescription;
    // Modality: free text CSV takes precedence, else selection (ALL=omit)
    if (modalities) params['ModalitiesInStudy'] = String(modalities);
    else if (modalitySelect && modalitySelect !== 'ALL') params['ModalitiesInStudy'] = modalitySelect;

    // StudyDate: single text range like YYYYMMDD-YYYYMMDD (allow slashes/spaces)
    const toDA = (d) => d.replace(/[\s/\-]/g, '');
    if (studyDate) {
      params['StudyDate'] = String(studyDate).replace(/[\s]/g, '').replace(/[\/]/g, '').replace(/--+/, '-');
    } else if (studyDateFrom || studyDateTo) {
      const from = studyDateFrom ? toDA(studyDateFrom) : '';
      const to = studyDateTo ? toDA(studyDateTo) : '';
      params['StudyDate'] = `${from}-${to}`;
    }

    // Pagination (QIDO supports limit/offset)
    params['limit'] = parseInt(limit);
    params['offset'] = parseInt(offset);

    // Build headers, including optional auth
    const headers = { Accept: 'application/dicom+json' };
    if (auth_type === 'basic' && credentials?.username) {
      const token = Buffer.from(`${credentials.username}:${credentials.password || ''}`).toString('base64');
      headers['Authorization'] = `Basic ${token}`;
    } else if (auth_type === 'token' && credentials?.token) {
      headers['Authorization'] = `Bearer ${credentials.token}`;
    }

    // Build studies endpoint from base URL, ensure single /studies suffix
    const base = String(baseUrl || '').replace(/\/*$/,'');
    const studiesUrl = /\/studies$/i.test(base) ? base : `${base}/studies`;

    const response = await axios.get(studiesUrl, {
      params,
      headers,
      timeout: Math.min(60000, Math.max(5000, (query_timeout || 15) * 1000))
    });

    res.json({ items: response.data || [], limit: params.limit, offset: params.offset });
  } catch (error) {
    const status = error?.response?.status;
    const limitValue = parseInt(req.query.limit || 50, 10);
    const offsetValue = parseInt(req.query.offset || 0, 10);

    if (status === 204 || status === 404) {
      logger.info('DICOM studies request returned no results');
      return res.json({ items: [], limit: limitValue, offset: offsetValue });
    }

    logger.error('DICOM studies fetch failed:', error?.response?.data || error.message || error);
    res.json({
      items: [],
      limit: limitValue,
      offset: offsetValue,
      warning: 'Unable to retrieve studies from PACS at this time.'
    });
  }
});

const normalizeCredentials = (creds) => {
  if (!creds) return {};
  if (typeof creds === 'string') {
    try {
      return JSON.parse(creds);
    } catch (_) {
      return {};
    }
  }
  return creds;
};

const DEFAULT_PACS_HEADERS = {
  'Accept-Language': 'en-US,en;q=0.8',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
};

const buildAuthHeaders = (authType, credentials, referer) => {
  const headers = { ...DEFAULT_PACS_HEADERS };
  if (referer) {
    headers['Referer'] = referer;
  }
  const creds = normalizeCredentials(credentials);
  if (authType === 'basic' && creds?.username) {
    const token = Buffer.from(`${creds.username}:${creds.password || ''}`).toString('base64');
    headers['Authorization'] = `Basic ${token}`;
  } else if (authType === 'token' && creds?.token) {
    headers['Authorization'] = `Bearer ${creds.token}`;
  }
  return headers;
};

const extractTag = (dataset, tag) => {
  if (!dataset || !dataset[tag] || !dataset[tag].Value || !dataset[tag].Value.length) return undefined;
  const value = dataset[tag].Value[0];
  if (value && typeof value === 'object' && value.Alphabetic) {
    return value.Alphabetic;
  }
  return value;
};

const normalizeDicomArray = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
};

const resolveFirstInstance = async ({
  studyUID,
  studiesBase,
  authHeaders,
  timeout
}) => {
  const seriesUrl = `${studiesBase}/${encodeURIComponent(studyUID)}/series`;
  const seriesResp = await axios.get(seriesUrl, {
    params: { limit: 1 },
    headers: { ...authHeaders, Accept: 'application/dicom+json' },
    timeout
  });
  const series = normalizeDicomArray(seriesResp.data);
  if (!series.length) {
    return null;
  }
  const seriesUID = extractTag(series[0], '0020000E');
  if (!seriesUID) {
    return null;
  }

  const instancesUrl = `${seriesUrl}/${encodeURIComponent(seriesUID)}/instances`;
  const instancesResp = await axios.get(instancesUrl, {
    params: { limit: 1 },
    headers: { ...authHeaders, Accept: 'application/dicom+json' },
    timeout
  });
  const instances = normalizeDicomArray(instancesResp.data);
  if (!instances.length) {
    return null;
  }
  const sopInstanceUID = extractTag(instances[0], '00080018');
  if (!sopInstanceUID) {
    return null;
  }

  return { seriesUID, sopInstanceUID };
};

// Download a study via WADO-RS (zip, dcm sample, or rendered png)
router.get('/studies/:studyUID/download', async (req, res) => {
  try {
    const { studyUID } = req.params;
    const format = String(req.query.format || 'zip').toLowerCase();
    const allowedFormats = ['zip', 'dcm', 'png'];
    if (!allowedFormats.includes(format)) {
      return res.status(400).json({ error: 'Unsupported format requested' });
    }
    // Resolve PACS URL from settings
    const db = getDB();
    const cfg = await db.query('SELECT pacs_url, auth_type, credentials, query_timeout FROM pacs_config LIMIT 1');
    if (cfg.rows.length === 0 || !cfg.rows[0].pacs_url) {
      return res.status(503).json({ error: 'PACS settings not configured' });
    }
    const { pacs_url, auth_type, credentials, query_timeout } = cfg.rows[0];
    // Build studies endpoint base from configured base URL
    const base = String(pacs_url || '').replace(/\/*$/,'');
    const studiesBase = /\/studies$/i.test(base) ? base : `${base}/studies`;
    const referer = `${base}/ui/imagefilemanagement`;
    const authHeaders = buildAuthHeaders(auth_type, credentials, referer);
    const timeout = Math.min(60000, Math.max(10000, (query_timeout || 60) * 1000));
    const requestedFilename = req.query.filename ? String(req.query.filename) : null;

    const sanitizeFilename = (name, fallback) => {
      if (!name) return fallback;
      const cleaned = name.replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '');
      return cleaned || fallback;
    };

    if (format === 'zip') {
      const url = `${studiesBase}/${encodeURIComponent(studyUID)}`;
      const response = await axios.get(url, {
        headers: { ...authHeaders, Accept: 'application/zip' },
        responseType: 'stream',
        timeout
      });
      if (response.headers['content-type']) {
        res.setHeader('Content-Type', response.headers['content-type']);
      } else {
        res.setHeader('Content-Type', 'application/zip');
      }
      if (response.headers['content-disposition']) {
        res.setHeader('Content-Disposition', response.headers['content-disposition']);
      } else {
        const fallback = sanitizeFilename(requestedFilename, `study-${studyUID}`);
        res.setHeader('Content-Disposition', `attachment; filename="${fallback}.zip"`);
      }
      if (response.headers['content-length']) {
        res.setHeader('Content-Length', response.headers['content-length']);
      }
      res.status(200);
      response.data.on('error', (err) => {
        logger.error('Stream error during ZIP download:', err?.message || err);
        res.destroy(err);
      });
      response.data.pipe(res);
      return;
    }

    const instanceKeys = await resolveFirstInstance({
      studyUID,
      studiesBase,
      authHeaders,
      timeout
    });

    if (!instanceKeys) {
      return res.status(404).json({ error: 'No instances available for requested study' });
    }

    const { seriesUID, sopInstanceUID } = instanceKeys;
    const instanceBase = `${studiesBase}/${encodeURIComponent(studyUID)}/series/${encodeURIComponent(seriesUID)}/instances/${encodeURIComponent(sopInstanceUID)}`;

    if (format === 'dcm') {
      const response = await axios.get(instanceBase, {
        headers: { ...authHeaders, Accept: 'application/dicom' },
        responseType: 'stream',
        timeout
      });
      if (response.headers['content-type']) {
        res.setHeader('Content-Type', response.headers['content-type']);
      } else {
        res.setHeader('Content-Type', 'application/dicom');
      }
      if (response.headers['content-disposition']) {
        res.setHeader('Content-Disposition', response.headers['content-disposition']);
      } else {
        const fallback = sanitizeFilename(requestedFilename, `study-${studyUID}`);
        res.setHeader('Content-Disposition', `attachment; filename="${fallback}.dcm"`);
      }
      if (response.headers['content-length']) {
        res.setHeader('Content-Length', response.headers['content-length']);
      }
      res.status(200);
      response.data.on('error', (err) => {
        logger.error('Stream error during DCM download:', err?.message || err);
        res.destroy(err);
      });
      response.data.pipe(res);
      return;
    }

    const renderedUrl = `${instanceBase}/rendered`;
    const response = await axios.get(renderedUrl, {
      headers: { ...authHeaders, Accept: 'image/png' },
      responseType: 'stream',
      timeout
    });
    if (response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type']);
    } else {
      res.setHeader('Content-Type', 'image/png');
    }
    if (response.headers['content-disposition']) {
      res.setHeader('Content-Disposition', response.headers['content-disposition']);
    } else {
      const fallback = sanitizeFilename(requestedFilename, `study-${studyUID}`);
      res.setHeader('Content-Disposition', `attachment; filename="${fallback}.png"`);
    }
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }
    res.status(200);
    response.data.on('error', (err) => {
      logger.error('Stream error during PNG download:', err?.message || err);
      res.destroy(err);
    });
    response.data.pipe(res);
    return;
  } catch (error) {
    logger.error('Study download failed:', error?.response?.status || '', error.message || error);
    return res.status(502).json({ error: 'Failed to download study' });
  }
});

// GET /api/dicom/health - check PACS connectivity and health
router.get('/health', async (req, res) => {
  try {
    const db = getDB();
    const cfg = await db.query('SELECT pacs_url, auth_type, credentials, connection_timeout FROM pacs_config LIMIT 1');
    
    if (cfg.rows.length === 0 || !cfg.rows[0].pacs_url) {
      return res.json({ 
        status: 'unconfigured', 
        healthy: false,
        message: 'PACS not configured'
      });
    }

    const { pacs_url: baseUrl, auth_type, credentials, connection_timeout = 5000 } = cfg.rows[0];
    const pacsUrl = String(baseUrl || '').replace(/\/*$/, '');
    const studiesEndpoint = /\/studies$/i.test(pacsUrl) ? pacsUrl : `${pacsUrl}/studies`;

    // Prepare auth headers
    let headers = {
      'Accept': 'application/dicom+json',
      'Content-Type': 'application/dicom+json'
    };

    if (auth_type === 'basic' && credentials) {
      const creds = JSON.parse(credentials);
      const auth = Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    } else if (auth_type === 'bearer' && credentials) {
      const creds = JSON.parse(credentials);
      headers['Authorization'] = `Bearer ${creds.token}`;
    }

    // Make a lightweight health check request (limit to 1 study)
    const healthCheckUrl = `${studiesEndpoint}?limit=1`;
    
    const startTime = Date.now();
    const response = await axios.get(healthCheckUrl, {
      headers,
      timeout: connection_timeout,
      validateStatus: (status) => status < 500 // Accept 2xx, 3xx, 4xx but not 5xx
    });
    const responseTime = Date.now() - startTime;

    // PACS is healthy if we get a response (even if empty or auth error)
    const isHealthy = response.status < 500;
    
    logger.info(`PACS health check: ${response.status} in ${responseTime}ms`);
    
    return res.json({
      status: 'online',
      healthy: isHealthy,
      responseTime,
      httpStatus: response.status,
      message: isHealthy ? 'PACS responding' : 'PACS server error'
    });

  } catch (error) {
    logger.error('PACS health check failed:', error?.message || error);
    
    // Determine error type
    let status = 'offline';
    let message = 'PACS unreachable';
    
    if (error.code === 'ECONNREFUSED') {
      message = 'Connection refused';
    } else if (error.code === 'ENOTFOUND') {
      message = 'Host not found';  
    } else if (error.code === 'ETIMEDOUT') {
      message = 'Connection timeout';
    }

    return res.json({
      status,
      healthy: false,
      message,
      error: error.code || 'UNKNOWN_ERROR'
    });
  }
});

module.exports = router;
