const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const axios = require('axios');
const AdmZip = require('adm-zip');

const { getDB } = require('../database/connection');
const { logger } = require('../utils/logger');
const { authenticateToken, requireAnyRole, checkReportAccess } = require('../middleware/auth');
const { validateRequest, validateParams, validateQuery, schemas } = require('../middleware/validation');
const { createAuditLog } = require('../utils/audit');
const { generateAIReport } = require('../services/llm');
const { convertDicomToImage } = require('../utils/dicomConverter');
const { decryptSecret } = require('../utils/crypto');
const reportService = require('../services/reportService');

const router = express.Router();
const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');
const fsp = fs.promises;

const toAbsoluteUploadPath = (filePath) => {
    if (!filePath) return null;
    return path.isAbsolute(filePath) ? filePath : path.join(UPLOAD_ROOT, filePath);
};

const normalizeCredentials = (creds) => {
    if (!creds) return null;
    if (typeof creds === 'string') {
        const decrypted = decryptSecret(creds);
        if (!decrypted) return null;
        try {
            return JSON.parse(decrypted);
        } catch (_) {
            return null;
        }
    }
    return creds;
};

const resolveUploadPreview = async (db, studyInstanceUID, hostOrigin) => {
    if (!studyInstanceUID) return null;

    try {
        const result = await db.query(
            `SELECT id, stored_filename, converted_image_path, is_dicom, mime_type
             FROM uploads
             WHERE study_instance_uid = $1
               AND status = 'ready'
             ORDER BY updated_at DESC
             LIMIT 1`,
            [studyInstanceUID]
        );

        if (result.rows.length === 0) {
            return await generatePacsPreview(db, studyInstanceUID, hostOrigin);
        }

        const upload = result.rows[0];
        const downloadUrl = `${hostOrigin}/api/uploads/${upload.id}/file`;
        let imageUrl = downloadUrl;
        let imageMimeType = upload.mime_type || 'image/jpeg';
        let imagePath = null;

        if (upload.is_dicom) {
            const storedPath = toAbsoluteUploadPath(upload.stored_filename);
            if (!storedPath || !fs.existsSync(storedPath)) {
                logger.warn('Stored DICOM missing for preview', { studyInstanceUID, uploadId: upload.id });
                return { downloadUrl, imageUrl: '', imageMimeType: '', imagePath: '' };
            }

            let convertedPath = toAbsoluteUploadPath(upload.converted_image_path);
            if (!convertedPath || !fs.existsSync(convertedPath)) {
                try {
                    const baseName = path.parse(storedPath).name;
                    const convertedAbsolutePath = await convertDicomToImage(
                        storedPath,
                        path.dirname(storedPath),
                        baseName
                    );
                    convertedPath = convertedAbsolutePath;
                    imagePath = convertedAbsolutePath;
                    const relativePath = path.relative(UPLOAD_ROOT, convertedAbsolutePath);
                    try {
                        await db.query(
                            `UPDATE uploads
                             SET converted_image_path = $1,
                                 updated_at = CURRENT_TIMESTAMP
                             WHERE id = $2`,
                            [relativePath, upload.id]
                        );
                    } catch (updateError) {
                        if (updateError.code !== '42703') {
                            logger.warn('Failed to persist converted preview path for report', {
                                uploadId: upload.id,
                                updateError: updateError.message
                            });
                        }
                    }
                } catch (conversionError) {
                    logger.warn('DICOM conversion failed for report preview', {
                        studyInstanceUID,
                        uploadId: upload.id,
                        error: conversionError.message
                    });
                    return { downloadUrl, imageUrl: '', imageMimeType: '', imagePath: '' };
                }
            } else {
                imagePath = convertedPath;
            }

            imageUrl = `${hostOrigin}/api/uploads/${upload.id}/converted`;
            const ext = path.extname(convertedPath).toLowerCase();
            if (ext === '.png') imageMimeType = 'image/png';
            else if (ext === '.webp') imageMimeType = 'image/webp';
            else imageMimeType = 'image/jpeg';
        } else {
            const storedPath = toAbsoluteUploadPath(upload.stored_filename);
            if (storedPath && fs.existsSync(storedPath)) {
                imagePath = storedPath;
            }
        }

        return {
            downloadUrl,
            imageUrl,
            imageMimeType,
            imagePath: imagePath || '',
            uploadId: upload.id
        };
    } catch (error) {
        if (error.code === '42P01') {
            // uploads table not initialized yet
            return null;
        }
        logger.warn('Failed to resolve upload preview for report', {
            studyInstanceUID,
            error: error.message
        });
        return await generatePacsPreview(db, studyInstanceUID, hostOrigin);
    }
};

const normalizePacsCredentials = (creds) => {
    if (!creds) return {};
    if (typeof creds === 'string') {
        const decrypted = decryptSecret(creds);
        if (!decrypted) return {};
        try {
            return JSON.parse(decrypted);
        } catch (_err) {
            return {};
        }
    }
    return creds;
};

const buildPacsHeaders = (authType, credentials, referer) => {
    const headers = {
        'Accept-Language': 'en-US,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'User-Agent': 'Mozilla/5.0 (ChickadeeX PACS Bridge)'
    };
    if (referer) {
        headers['Referer'] = referer;
    }
    const creds = normalizePacsCredentials(credentials);
    if (authType === 'basic' && creds?.username) {
        const token = Buffer.from(`${creds.username}:${creds.password || ''}`).toString('base64');
        headers['Authorization'] = `Basic ${token}`;
    } else if (authType === 'token' && creds?.token) {
        headers['Authorization'] = `Bearer ${creds.token}`;
    }
    return headers;
};

const pickDicomEntry = (zipBuffer) => {
    try {
        const zip = new AdmZip(zipBuffer);
        const entries = zip.getEntries();
        if (!entries || !entries.length) {
            return null;
        }
        return (
            entries.find((entry) => !entry.isDirectory && /\.dcm$/i.test(entry.entryName)) ||
            entries.find((entry) => !entry.isDirectory)
        );
    } catch (error) {
        logger.warn('Failed to inspect PACS ZIP archive', { error: error.message });
        return null;
    }
};

const generatePacsPreview = async (db, studyInstanceUID, hostOrigin) => {
    if (!studyInstanceUID) {
        return null;
    }
    try {
        const cfg = await db.query('SELECT pacs_url, auth_type, credentials, query_timeout FROM pacs_config LIMIT 1');
        if (cfg.rows.length === 0 || !cfg.rows[0].pacs_url) {
            return null;
        }

        const { pacs_url, auth_type, credentials, query_timeout } = cfg.rows[0];
        const base = String(pacs_url || '').replace(/\/*$/, '');
        const studiesBase = /\/studies$/i.test(base) ? base : `${base}/studies`;
        const referer = `${base}/ui/imagefilemanagement`;
        const headers = buildPacsHeaders(auth_type, credentials, referer);
        headers['Accept'] = 'application/zip';
        const timeout = Math.min(60000, Math.max(10000, (query_timeout || 60) * 1000));

        const archiveResponse = await axios.get(
            `${studiesBase}/${encodeURIComponent(studyInstanceUID)}`,
            {
                headers,
                responseType: 'arraybuffer',
                timeout
            }
        );

        const dicomEntry = pickDicomEntry(Buffer.from(archiveResponse.data));
        if (!dicomEntry) {
            return null;
        }

        const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pacs-preview-'));
        const dicomFilename = `${studyInstanceUID.replace(/[^a-z0-9]/gi, '').slice(0, 16)}-${Date.now()}.dcm`;
        const dicomPath = path.join(tempDir, dicomFilename);
        await fsp.writeFile(dicomPath, dicomEntry.getData());

        let convertedPath;
        try {
            convertedPath = await convertDicomToImage(dicomPath, tempDir, 'preview');
        } catch (conversionError) {
            logger.warn('Failed to convert PACS DICOM for preview', {
                studyInstanceUID,
                error: conversionError.message
            });
            return null;
        }

        const ext = path.extname(convertedPath).toLowerCase();
        let imageMimeType = 'image/jpeg';
        if (ext === '.png') imageMimeType = 'image/png';
        else if (ext === '.webp') imageMimeType = 'image/webp';

        return {
            downloadUrl: `${hostOrigin}/api/dicom/studies/${encodeURIComponent(studyInstanceUID)}/download?format=dcm`,
            imageUrl: '',
            imageMimeType,
            imagePath: convertedPath,
            uploadId: null
        };
    } catch (error) {
        logger.warn('Failed to build PACS preview for AI generation', {
            studyInstanceUID,
            error: error.message || error
        });
        return null;
    }
};

// All routes require authentication
router.use(authenticateToken);

// Get current LLM configurations (for frontend display)
router.get('/llm-configs',
    requireAnyRole(['doctor', 'admin']),
    async (req, res) => {
        try {
            const configs = await reportService.getLlmConfigs();
            res.json(configs);
        } catch (error) {
            res.status(500).json({ error: 'Failed to retrieve LLM configurations' });
        }
    }
);

// Get reports with filtering and pagination
router.get('/',
    requireAnyRole(['admin', 'doctor', 'researcher', 'observer']),
    validateQuery(schemas.reportSearch),
    async (req, res) => {
        try {
            const payload = await reportService.searchReports(req);
            res.json(payload);
        } catch (error) {
            res.status(500).json({ error: 'Failed to retrieve reports' });
        }
    }
);

// Summary metrics for reports landing experience
router.get('/summary',
    requireAnyRole(['admin', 'doctor', 'researcher', 'observer']),
    async (req, res) => {
        try {
            const db = getDB();
            const role = req.user.role;
            const normalize = (value) => Number(value) || 0;

            if (role === 'admin') {
                const summaryRes = await db.query(`
                    SELECT
                        COUNT(*)::int AS total_reports,
                        COUNT(*) FILTER (WHERE finalized_at IS NULL)::int AS draft_reports,
                        COUNT(*) FILTER (WHERE finalized_at IS NOT NULL)::int AS finalized_reports
                    FROM reports
                `);
                const row = summaryRes.rows[0] || {};
                return res.json({
                    total_reports: normalize(row.total_reports),
                    draft_reports: normalize(row.draft_reports),
                    finalized_reports: normalize(row.finalized_reports)
                });
            }

            if (role === 'doctor') {
                const summaryRes = await db.query(`
                    SELECT
                        COUNT(*)::int AS total_reports,
                        COUNT(*) FILTER (WHERE finalized_at IS NULL)::int AS draft_reports,
                        COUNT(*) FILTER (WHERE finalized_at IS NOT NULL)::int AS finalized_reports
                    FROM reports
                    WHERE doctor_id = $1
                `, [req.user.id]);
                const row = summaryRes.rows[0] || {};
                return res.json({
                    total_reports: normalize(row.total_reports),
                    draft_reports: normalize(row.draft_reports),
                    finalized_reports: normalize(row.finalized_reports)
                });
            }

            if (role === 'observer') {
                // Observers see reports based on studies they have uploaded
                const summaryRes = await db.query(`
                    SELECT
                        COUNT(*)::int AS total_reports,
                        COUNT(*) FILTER (WHERE finalized_at IS NULL)::int AS draft_reports,
                        COUNT(*) FILTER (WHERE finalized_at IS NOT NULL)::int AS finalized_reports
                    FROM reports r
                    WHERE r.study_instance_uid IN (
                        SELECT DISTINCT study_instance_uid
                        FROM uploads
                        WHERE user_id = $1 AND status = 'ready'
                    )
                `, [req.user.id]);
                const row = summaryRes.rows[0] || {};
                return res.json({
                    total_reports: normalize(row.total_reports),
                    draft_reports: normalize(row.draft_reports),
                    finalized_reports: normalize(row.finalized_reports)
                });
            }

            // For researchers - only finalized reports
            const finalizedRes = await db.query(`
                SELECT
                    COUNT(*)::int AS finalized_reports
                FROM reports
                WHERE finalized_at IS NOT NULL
            `);
            const finalized = normalize(finalizedRes.rows[0]?.finalized_reports);
            return res.json({
                total_reports: finalized,
                draft_reports: 0,
                finalized_reports: finalized
            });
        } catch (error) {
            logger.error('Get reports summary error:', error);
            res.status(500).json({ error: 'Failed to retrieve reports summary' });
        }
    }
);

// Create new report (Doctor only)
router.post('/',
    requireAnyRole(['doctor']),
    validateRequest(schemas.createReport),
    async (req, res) => {
        try {
            const report = await reportService.createReport(req);
            res.status(201).json(report);
        } catch (error) {
            res.status(error.statusCode || 500).json({ error: error.message || 'Failed to create report' });
        }
    }
);

// Get specific report
router.get('/:reportId',
    validateParams({ reportId: schemas.uuid }),
    checkReportAccess,
    async (req, res) => {
        try {
            const { reportId } = req.params;
            const db = getDB();
            
            const reportQuery = `
                SELECT rs.*, 
                    (SELECT json_agg(json_build_object(
                        'id', rv.id,
                        'version_no', rv.version_no,
                        'findings', rv.findings,
                        'impression', rv.impression,
                        'template_used', rv.template_used,
                        'generated_by_ai', rv.generated_by_ai,
                        'ai_model_used', rv.ai_model_used,
                        'created_at', rv.created_at
                    ) ORDER BY rv.version_no)
                    FROM report_versions rv WHERE rv.report_id = rs.id) as versions
                FROM report_summary rs
                WHERE rs.id = $1
            `;
            
            const result = await db.query(reportQuery, [reportId]);
            
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Report not found' });
            }

            const reportRow = result.rows[0];
            let previewMeta = null;
            if (reportRow.study_instance_uid) {
                const hostOrigin = `${req.protocol}://${req.get('host')}`;
                previewMeta = await resolveUploadPreview(db, reportRow.study_instance_uid, hostOrigin);
            }

            await createAuditLog(req.user.id, 'report_viewed', 'report', reportId, {
                ip: req.ip,
                user_agent: req.get('User-Agent')
            });

            res.json({
                ...reportRow,
                preview_image_url: previewMeta?.imageUrl || null,
                preview_download_url: previewMeta?.downloadUrl || null,
                preview_upload_id: previewMeta?.uploadId || null
            });
        } catch (error) {
            logger.error('Get report error:', error);
            res.status(500).json({ error: 'Failed to retrieve report' });
        }
    }
);

// Create new report version (Doctor only)
router.post('/:reportId/versions',
    requireAnyRole(['doctor']),
    validateParams({ reportId: schemas.uuid }),
    validateRequest(schemas.createReportVersion),
    async (req, res) => {
        try {
            const version = await reportService.createVersion(req);
            res.status(201).json(version);
        } catch (error) {
            const status = error.statusCode || 500;
            const payload = { error: error.message || 'Failed to create report version' };
            if (error.code) {
                payload.code = error.code;
            }
            res.status(status).json(payload);
        }
    }
);

// Generate AI report preview (doesn't save to database)
router.post('/:reportId/generate-preview',
    requireAnyRole(['doctor']),
    validateParams({ reportId: schemas.uuid }),
    async (req, res) => {
        try {
            const preview = await reportService.generatePreview(req);
            res.json(preview);
        } catch (error) {
            const status = error.statusCode || 500;
            res.status(status).json({ error: error.message || 'Failed to generate AI report preview' });
        }
    }
);

// Generate AI report preview via SSE (real-time stage progress)
router.get('/:reportId/generate-preview-stream',
    requireAnyRole(['doctor']),
    validateParams({ reportId: schemas.uuid }),
    async (req, res) => {
        // SSE headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });

        const sendEvent = (event, data) => {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };

        try {
            const { reportId } = req.params;
            const db = getDB();

            // Reuse availability check
            const llmCheckRes = await db.query(`
                SELECT COUNT(*) as count FROM (
                    SELECT id FROM llm_configs WHERE enabled = true
                    UNION ALL
                    SELECT id FROM llm_pipelines WHERE enabled = true
                ) combined
            `);
            const availableModels = parseInt(llmCheckRes.rows[0]?.count || 0);
            if (availableModels === 0) {
                sendEvent('error', { message: 'No LLM models available. Please configure and enable at least one LLM model in the admin panel.' });
                sendEvent('done', {});
                res.end();
                return;
            }

            // Resolve report
            const reportQuery = `
                SELECT r.*,
                    (SELECT findings || '\n\n' || impression
                     FROM report_versions rv
                     WHERE rv.report_id = r.id
                     ORDER BY rv.version_no DESC
                     LIMIT 1) as previous_content
                FROM reports r
                WHERE r.id = $1 AND r.doctor_id = $2
            `;
            const reportResult = await db.query(reportQuery, [reportId, req.user.id]);
            if (reportResult.rows.length === 0) {
                sendEvent('error', { message: 'Report not found' });
                sendEvent('done', {});
                res.end();
                return;
            }

            const report = reportResult.rows[0];
            let dicom = { studyInstanceUID: report.study_instance_uid, imagePath: '' };
            try {
                const pacs = await db.query('SELECT pacs_url FROM pacs_config LIMIT 1');
                if (pacs.rows.length && pacs.rows[0].pacs_url) {
                    const base = String(pacs.rows[0].pacs_url || '').replace(/\/*$/, '');
                    const studiesBase = /\/studies$/i.test(base) ? base : `${base}/studies`;
                    dicom.studyUrl = `${studiesBase}/${encodeURIComponent(report.study_instance_uid)}`;
                }
            } catch (_) {}
            const hostOrigin = `${req.protocol}://${req.get('host')}`;
            dicom.downloadUrl = `${hostOrigin}/api/dicom/studies/${encodeURIComponent(report.study_instance_uid)}/download`;

            const preview = await resolveUploadPreview(db, report.study_instance_uid, hostOrigin);
            if (preview) {
                dicom.downloadUrl = preview.downloadUrl || dicom.downloadUrl;
                dicom.imageUrl = preview.imageUrl || '';
                dicom.imageMimeType = preview.imageMimeType || 'image/jpeg';
                dicom.imagePath = preview.imagePath || '';
            } else {
                dicom.imageUrl = '';
                dicom.imageMimeType = 'image/jpeg';
                dicom.imagePath = '';
            }

            // Generate with stage event callback
            const onStageEvent = (event) => {
                sendEvent('stage', event);
            };

            const aiResult = await generateAIReport({
                studyDescription: report.study_description,
                modality: report.modality,
                clinicalContext: report.clinical_context || '',
                previousContent: report.previous_content,
                dicom
            }, onStageEvent);

            sendEvent('result', aiResult);
            sendEvent('done', {});
            res.end();

        } catch (error) {
            logger.error('SSE generate-preview-stream error:', error);
            sendEvent('error', { message: error.message || 'AI generation failed' });
            sendEvent('done', {});
            res.end();
        }
    }
);

// Generate AI report version
router.post('/:reportId/generate',
    requireAnyRole(['doctor']),
    validateParams({ reportId: schemas.uuid }),
    async (req, res) => {
        try {
            const { reportId } = req.params;
            const { template_used } = req.body;
            const db = getDB();
            
            // Get report details
            const reportQuery = `
                SELECT r.*, 
                    (SELECT findings || '\n\n' || impression 
                     FROM report_versions rv 
                     WHERE rv.report_id = r.id 
                     ORDER BY rv.version_no DESC 
                     LIMIT 1) as previous_content
                FROM reports r
                WHERE r.id = $1 AND r.doctor_id = $2
            `;
            
            const reportResult = await db.query(reportQuery, [reportId, req.user.id]);
            
            if (reportResult.rows.length === 0) {
                return res.status(404).json({ error: 'Report not found' });
            }

            const report = reportResult.rows[0];
            
            // Build DICOM context URLs
            let dicom = { studyInstanceUID: report.study_instance_uid, imagePath: '' };
            try {
                const pacs = await db.query('SELECT pacs_url FROM pacs_config LIMIT 1');
                if (pacs.rows.length && pacs.rows[0].pacs_url) {
                    const base = String(pacs.rows[0].pacs_url || '').replace(/\/*$/,'');
                    const studiesBase = /\/studies$/i.test(base) ? base : `${base}/studies`;
                    dicom.studyUrl = `${studiesBase}/${encodeURIComponent(report.study_instance_uid)}`;
                }
            } catch (_) {}
            // Local download proxy
            const hostOrigin = `${req.protocol}://${req.get('host')}`;
            dicom.downloadUrl = `${hostOrigin}/api/dicom/studies/${encodeURIComponent(report.study_instance_uid)}/download`;

            const preview = await resolveUploadPreview(db, report.study_instance_uid, hostOrigin);
            if (preview) {
                dicom.downloadUrl = preview.downloadUrl || dicom.downloadUrl;
                dicom.imageUrl = preview.imageUrl || '';
                dicom.imageMimeType = preview.imageMimeType || 'image/jpeg';
                dicom.imagePath = preview.imagePath || '';
            } else {
                dicom.imageUrl = '';
                dicom.imageMimeType = 'image/jpeg';
                dicom.imagePath = '';
            }
            
            // Generate AI content
            const aiResult = await generateAIReport({
                studyDescription: report.study_description,
                modality: report.modality,
                clinicalContext: report.clinical_context || '',
                previousContent: report.previous_content,
                dicom
            });

            // Get next version number
            const versionQuery = 'SELECT COALESCE(MAX(version_no), 0) + 1 as next_version FROM report_versions WHERE report_id = $1';
            const versionResult = await db.query(versionQuery, [reportId]);
            const nextVersion = versionResult.rows[0].next_version;

            // Save as new version
            const insertQuery = `
                INSERT INTO report_versions (report_id, version_no, findings, impression, template_used, generated_by_ai, ai_model_used)
                VALUES ($1, $2, $3, $4, $5, true, $6)
                RETURNING *
            `;
            
            const result = await db.query(insertQuery, [
                reportId,
                nextVersion,
                aiResult.findings,
                aiResult.impression,
                template_used || null,
                aiResult.model_used
            ]);

            await createAuditLog(req.user.id, 'ai_report_generated', 'report', reportId, {
                version_no: nextVersion,
                model_used: aiResult.model_used,
                ip: req.ip,
                user_agent: req.get('User-Agent')
            });

            res.json(result.rows[0]);
        } catch (error) {
            logger.error('Generate AI report error:', error);
            if (error && /image preview required/i.test(error.message || '')) {
                return res.status(400).json({ error: 'Preview image unavailable for AI generation' });
            }
            res.status(500).json({ error: 'Failed to generate AI report' });
        }
    }
);

// Update latest report version in place (Doctor only, only owner, not finalized)
router.put('/:reportId/versions/latest',
    requireAnyRole(['doctor']),
    validateParams({ reportId: schemas.uuid }),
    validateRequest(schemas.updateReportVersion),
    async (req, res) => {
        try {
            const { reportId } = req.params;
            const { findings, impression } = req.body;
            const db = getDB();

            // Ensure report exists, is owned by doctor, and not finalized
            const repRes = await db.query(
                `SELECT id, doctor_id, finalized_at FROM reports WHERE id = $1 AND doctor_id = $2`,
                [reportId, req.user.id]
            );
            if (repRes.rows.length === 0) {
                return res.status(404).json({ error: 'Report not found' });
            }
            if (repRes.rows[0].finalized_at) {
                return res.status(400).json({ error: 'Cannot edit a finalized report' });
            }

            // Find latest version
            const vRes = await db.query(
                `SELECT id, version_no FROM report_versions WHERE report_id = $1 ORDER BY version_no DESC LIMIT 1`,
                [reportId]
            );
            if (vRes.rows.length === 0) {
                return res.status(400).json({ error: 'No versions to update' });
            }
            const latest = vRes.rows[0];

            // Build dynamic update
            const updates = [];
            const values = [];
            let c = 0;
            if (findings !== undefined) { c++; updates.push(`findings = $${c}`); values.push(findings); }
            if (impression !== undefined) { c++; updates.push(`impression = $${c}`); values.push(impression); }
            c++; values.push(latest.id);

            const q = `UPDATE report_versions SET ${updates.join(', ')}, created_at = created_at WHERE id = $${c} RETURNING *`;
            const upd = await db.query(q, values);

            await createAuditLog(req.user.id, 'report_version_updated', 'report', reportId, {
                version_no: latest.version_no,
                ip: req.ip,
                user_agent: req.get('User-Agent')
            });

            res.json(upd.rows[0]);
        } catch (error) {
            logger.error('Update latest report version error:', error);
            res.status(500).json({ error: 'Failed to update latest version' });
        }
    }
);

// Update report description (Doctor only, owner only, not finalized)
router.put('/:reportId/description',
    requireAnyRole(['doctor', 'observer']),
    validateParams({ reportId: schemas.uuid }),
    validateRequest(schemas.updateReportDescription),
    async (req, res) => {
        try {
            const { reportId } = req.params;
            const { study_description } = req.body;
            const db = getDB();

            // Ensure report exists, is owned by doctor, and not finalized
            const scopedQuery = `
                SELECT id, doctor_id, finalized_at, study_instance_uid
                FROM reports
                WHERE id = $1 AND doctor_id = $2
            `;
            const fallbackQuery = `
                SELECT id, doctor_id, finalized_at, study_instance_uid
                FROM reports
                WHERE id = $1
            `;

            let reportRow = null;
            const scopedResult = await db.query(scopedQuery, [reportId, req.user.id]);

            if (scopedResult.rows.length) {
                reportRow = scopedResult.rows[0];
            } else {
                const fallbackResult = await db.query(fallbackQuery, [reportId]);
                if (fallbackResult.rows.length === 0) {
                    return res.status(404).json({ error: 'Report not found' });
                }
                reportRow = fallbackResult.rows[0];

                if (req.user.role === 'doctor') {
                    return res.status(403).json({ error: 'Not authorized to edit this report' });
                }

                if (req.user.role === 'observer') {
                    try {
                        const accessCheck = await db.query(
                            `SELECT 1
                             FROM uploads
                             WHERE study_instance_uid = $1
                               AND user_id = $2
                               AND status = 'ready'
                             LIMIT 1`,
                            [reportRow.study_instance_uid, req.user.id]
                        );
                        if (accessCheck.rows.length === 0) {
                            return res.status(403).json({ error: 'Not authorized to edit this report' });
                        }
                    } catch (accessError) {
                        if (accessError.code === '42P01') {
                            return res.status(403).json({ error: 'Not authorized to edit this report' });
                        }
                        throw accessError;
                    }
                } else {
                    return res.status(403).json({ error: 'Not authorized to edit this report' });
                }
            }

            if (reportRow.finalized_at) {
                return res.status(400).json({ error: 'Cannot edit a finalized report' });
            }

            // Update the description
            const updateQuery = `
                UPDATE reports 
                SET study_description = $1, updated_at = CURRENT_TIMESTAMP 
                WHERE id = $2
                RETURNING *
            `;
            
            const result = await db.query(updateQuery, [study_description, reportId]);

            await createAuditLog(req.user.id, 'report_description_updated', 'report', reportId, {
                study_description,
                ip: req.ip,
                user_agent: req.get('User-Agent')
            });

            res.json(result.rows[0]);
        } catch (error) {
            logger.error('Update report description error:', error);
            res.status(500).json({ error: 'Failed to update report description' });
        }
    }
);

// Finalize report (Doctor and Observer)
router.post('/:reportId/finalize',
    requireAnyRole(['doctor']),
    validateParams({ reportId: schemas.uuid }),
    async (req, res) => {
        try {
            const result = await reportService.finalizeReport(req);
            res.json(result);
        } catch (error) {
            res.status(error.statusCode || 500).json({ error: error.message || 'Failed to finalize report' });
        }
    }
);

// Delete report (Doctor only)
router.delete('/:reportId',
    requireAnyRole(['doctor', 'observer', 'admin']),
    validateParams({ reportId: schemas.uuid }),
    async (req, res) => {
        try {
            const { reportId } = req.params;
            const db = getDB();

            const reportRes = await db.query(
                `SELECT id, doctor_id FROM reports WHERE id = $1`,
                [reportId]
            );

            if (reportRes.rows.length === 0) {
                return res.status(404).json({ error: 'Report not found' });
            }

            if (reportRes.rows[0].doctor_id !== req.user.id && req.user.role !== 'admin') {
                return res.status(403).json({ error: 'Not authorized to delete this report' });
            }

            await db.query('DELETE FROM reports WHERE id = $1', [reportId]);

            await createAuditLog(req.user.id, 'report_deleted', 'report', reportId, {
                ip: req.ip,
                user_agent: req.get('User-Agent')
            });

            res.json({ message: 'Report deleted', reportId });
        } catch (error) {
            logger.error('Delete report error:', error);
            res.status(500).json({ error: 'Failed to delete report' });
        }
    }
);

// Export report data (Researcher and Doctor only)
router.get('/:reportId/export',
    requireAnyRole(['doctor', 'researcher']),
    validateParams({ reportId: schemas.uuid }),
    checkReportAccess,
    async (req, res) => {
        try {
            const result = await reportService.exportReport(req);
            if (result.format === 'json') {
                return res.json(result.data);
            }
            if (result.format === 'csv') {
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
                return res.send(result.data);
            }
            return res.status(400).json({ error: 'Unsupported format' });
        } catch (error) {
            res.status(error.statusCode || 500).json({ error: error.message || 'Failed to export report' });
        }
    }
);

module.exports = router;
