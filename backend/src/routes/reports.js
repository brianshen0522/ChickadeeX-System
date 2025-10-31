const express = require('express');
const { v4: uuidv4 } = require('uuid');

const { getDB } = require('../database/connection');
const { logger } = require('../utils/logger');
const { authenticateToken, requireAnyRole, checkReportAccess } = require('../middleware/auth');
const { validateRequest, validateParams, validateQuery, schemas } = require('../middleware/validation');
const { createAuditLog } = require('../utils/audit');
const { generateAIReport } = require('../services/llm');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get current LLM configurations (for frontend display)
router.get('/llm-configs',
    requireAnyRole(['doctor', 'admin']),
    async (req, res) => {
        try {
            const db = getDB();
            const query = `
                SELECT id, name, model_name, api_url, priority, enabled, max_tokens, temperature, top_p,
                       (api_key IS NOT NULL) AS has_api_key
                FROM llm_configs
                WHERE enabled = true
                ORDER BY priority ASC
            `;
            
            const result = await db.query(query);
            res.json(result.rows);
        } catch (error) {
            logger.error('Get LLM configs error:', error);
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
            const {
                patient_id,
                patient_name,
                study_instance_uid,
                study_date_from,
                study_date_to,
                report_date_from,
                report_date_to,
                modality,
                doctor_id,
                status,
                finalized_only = false,
                draft_only = false,
                limit = 20,
                offset = 0
            } = req.query;

            const db = getDB();
            
            let query = `
                SELECT 
                    r.id,
                    r.study_instance_uid,
                    r.patient_id,
                    r.patient_name,
                    r.study_date,
                    r.study_description,
                    r.modality,
                    r.doctor_id,
                    u.name AS doctor_name,
                    r.created_at,
                    r.updated_at,
                    r.finalized_at,
                    r.tags,
                    COALESCE(rv.version_count, 0) AS version_count,
                    (r.finalized_at IS NOT NULL) AS is_finalized,
                    COUNT(*) OVER() AS total_count
                FROM reports r
                LEFT JOIN users u ON u.id = r.doctor_id
                LEFT JOIN (
                    SELECT report_id, COUNT(*)::int AS version_count
                    FROM report_versions
                    GROUP BY report_id
                ) rv ON rv.report_id = r.id
            `;
            
            const conditions = [];
            const values = [];
            let paramCount = 0;

            const normalizedStatus = (() => {
                if (!status) {
                    if (finalized_only) return 'finalized';
                    if (draft_only) return 'draft';
                    return null;
                }
                const lowered = status.toString().toLowerCase();
                if (lowered === 'all') return null;
                if (['finalized', 'completed'].includes(lowered)) return 'finalized';
                if (lowered === 'draft') return 'draft';
                return null;
            })();

            // Role-based filtering
            if (['researcher', 'observer'].includes(req.user.role)) {
                // Read-only roles only see finalized reports regardless of filters
                conditions.push('r.finalized_at IS NOT NULL');
            }

            if (patient_id) {
                paramCount++;
                conditions.push(`r.patient_id ILIKE $${paramCount}`);
                values.push(`%${patient_id}%`);
            }

            if (patient_name) {
                paramCount++;
                conditions.push(`r.patient_name ILIKE $${paramCount}`);
                values.push(`%${patient_name}%`);
            }

            if (study_instance_uid) {
                paramCount++;
                // Partial matching for Study Instance UID
                conditions.push(`r.study_instance_uid ILIKE $${paramCount}`);
                values.push(`%${study_instance_uid}%`);
            }

            // Date filtering should use report created date (created_at)
            const reportsDateFrom = report_date_from || study_date_from;
            const reportsDateTo = report_date_to || study_date_to;
            if (reportsDateFrom) {
                paramCount++;
                conditions.push(`r.created_at::date >= $${paramCount}::date`);
                values.push(reportsDateFrom);
            }

            if (reportsDateTo) {
                paramCount++;
                conditions.push(`r.created_at::date <= $${paramCount}::date`);
                values.push(reportsDateTo);
            }

            if (modality) {
                paramCount++;
                conditions.push(`r.modality = $${paramCount}`);
                values.push(modality);
            }

            if (doctor_id) {
                paramCount++;
                conditions.push(`r.doctor_id = $${paramCount}`);
                values.push(doctor_id);
            }

            // Finalization status filtering (doctor/admin only)
            if (!['researcher', 'observer'].includes(req.user.role) && normalizedStatus) {
                if (normalizedStatus === 'finalized') {
                    conditions.push('r.finalized_at IS NOT NULL');
                } else if (normalizedStatus === 'draft') {
                    conditions.push('r.finalized_at IS NULL');
                }
            }

            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
            }

            query += ' ORDER BY r.created_at DESC';

            paramCount++;
            query += ` LIMIT $${paramCount}`;
            values.push(parseInt(limit));

            paramCount++;
            query += ` OFFSET $${paramCount}`;
            values.push(parseInt(offset));

            const result = await db.query(query, values);
            const reports = result.rows.map((row) => {
                const {
                    total_count,
                    ...report
                } = row;
                const statusValue = report.is_finalized ? 'finalized' : 'draft';
                return {
                    ...report,
                    status: statusValue,
                    title: report.study_description
                        ? report.study_description
                        : `Report for ${report.patient_name || report.patient_id}`,
                    description: report.study_description || null,
                    total_count
                };
            });

            const total = reports.length > 0 ? Number(reports[0].total_count ?? reports.length) : 0;
            await createAuditLog(req.user.id, 'reports_listed', 'report', null, {
                filters: req.query,
                count: reports.length,
                ip: req.ip,
                user_agent: req.get('User-Agent')
            });

            res.json({
                reports: reports.map(({ total_count, ...rest }) => rest),
                pagination: {
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    total
                }
            });
        } catch (error) {
            logger.error('Get reports error:', error);
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

            if (['admin', 'doctor'].includes(role)) {
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
            const {
                study_instance_uid,
                patient_id,
                patient_name,
                patient_dob,
                study_date,
                study_description,
                modality
            } = req.body;

            const db = getDB();
            
            // Check if report already exists for this study
            const existingQuery = 'SELECT id FROM reports WHERE study_instance_uid = $1';
            const existing = await db.query(existingQuery, [study_instance_uid]);
            
            if (existing.rows.length > 0) {
                return res.status(409).json({ error: 'Report already exists for this study' });
            }

            const reportId = uuidv4();
            
            const insertQuery = `
                INSERT INTO reports (id, study_instance_uid, patient_id, patient_name, patient_dob, study_date, study_description, modality, doctor_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *
            `;
            
            const result = await db.query(insertQuery, [
                reportId,
                study_instance_uid,
                patient_id,
                patient_name || null,
                patient_dob || null,
                study_date || null,
                study_description || null,
                modality || null,
                req.user.id
            ]);

            await createAuditLog(req.user.id, 'report_created', 'report', reportId, {
                study_instance_uid,
                patient_id,
                ip: req.ip,
                user_agent: req.get('User-Agent')
            });

            res.status(201).json(result.rows[0]);
        } catch (error) {
            logger.error('Create report error:', error);
            res.status(500).json({ error: 'Failed to create report' });
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

            await createAuditLog(req.user.id, 'report_viewed', 'report', reportId, {
                ip: req.ip,
                user_agent: req.get('User-Agent')
            });

            res.json(result.rows[0]);
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
            const { reportId } = req.params;
            const { findings, impression, template_used } = req.body;
            const db = getDB();
            
            // Check if report exists and user has access
            const reportQuery = 'SELECT id, doctor_id FROM reports WHERE id = $1';
            const reportResult = await db.query(reportQuery, [reportId]);
            
            if (reportResult.rows.length === 0) {
                return res.status(404).json({ error: 'Report not found' });
            }

            // Prevent duplicate save: compare to latest version content
            const lastRes = await db.query(
                'SELECT findings, impression FROM report_versions WHERE report_id = $1 ORDER BY version_no DESC LIMIT 1',
                [reportId]
            );
            if (lastRes.rows.length) {
                const last = lastRes.rows[0];
                const norm = (v) => (v || '').trim();
                if (norm(last.findings) === norm(findings) && norm(last.impression) === norm(impression)) {
                    return res.status(409).json({ error: 'No changes to save', code: 'NO_CHANGES' });
                }
            }

            // Get next version number
            const versionQuery = 'SELECT COALESCE(MAX(version_no), 0) + 1 as next_version FROM report_versions WHERE report_id = $1';
            const versionResult = await db.query(versionQuery, [reportId]);
            const nextVersion = versionResult.rows[0].next_version;

            const insertQuery = `
                INSERT INTO report_versions (report_id, version_no, findings, impression, template_used)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `;
            
            const result = await db.query(insertQuery, [
                reportId,
                nextVersion,
                findings,
                impression,
                template_used || null
            ]);

            await createAuditLog(req.user.id, 'report_version_created', 'report', reportId, {
                version_no: nextVersion,
                ip: req.ip,
                user_agent: req.get('User-Agent')
            });

            res.status(201).json(result.rows[0]);
        } catch (error) {
            logger.error('Create report version error:', error);
            res.status(500).json({ error: 'Failed to create report version' });
        }
    }
);

// Generate AI report preview (doesn't save to database)
router.post('/:reportId/generate-preview',
    requireAnyRole(['doctor']),
    validateParams({ reportId: schemas.uuid }),
    async (req, res) => {
        try {
            const { reportId } = req.params;
            const { template_used } = req.body;
            const db = getDB();
            
            // Check if any LLM models are available and enabled
            const llmCheckRes = await db.query(`SELECT COUNT(*) as count FROM llm_configs WHERE enabled = true AND api_key IS NOT NULL`);
            const availableModels = parseInt(llmCheckRes.rows[0]?.count || 0);
            
            if (availableModels === 0) {
                return res.status(400).json({ 
                    error: 'No LLM models available. Please configure and enable at least one LLM model in the admin panel before generating reports.' 
                });
            }
            
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
            let dicom = { studyInstanceUID: report.study_instance_uid };
            try {
                const pacs = await db.query('SELECT pacs_url FROM pacs_config LIMIT 1');
                if (pacs.rows.length && pacs.rows[0].pacs_url) {
                    const base = String(pacs.rows[0].pacs_url || '').replace(/\/*$/,'');
                    const studiesBase = /\/studies$/i.test(base) ? base : `${base}/studies`;
                    dicom.studyUrl = `${studiesBase}/${encodeURIComponent(report.study_instance_uid)}`;
                }
            } catch (_) {}
            // Local download proxy
            dicom.downloadUrl = `${req.protocol}://${req.get('host')}/api/dicom/studies/${encodeURIComponent(report.study_instance_uid)}/download`;
            
            // Generate AI content
            const aiResult = await generateAIReport({
                studyDescription: report.study_description,
                modality: report.modality,
                clinicalContext: report.clinical_context || '',
                previousContent: report.previous_content,
                dicom
            });

            // Return preview content without saving
            res.json({
                findings: aiResult.findings,
                impression: aiResult.impression,
                model_used: aiResult.model_used,
                model_config: aiResult.model_config,
                preview: true
            });
        } catch (error) {
            logger.error('Generate AI report preview error:', error);
            res.status(500).json({ error: 'Failed to generate AI report preview' });
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
            let dicom = { studyInstanceUID: report.study_instance_uid };
            try {
                const pacs = await db.query('SELECT pacs_url FROM pacs_config LIMIT 1');
                if (pacs.rows.length && pacs.rows[0].pacs_url) {
                    const base = String(pacs.rows[0].pacs_url || '').replace(/\/*$/,'');
                    const studiesBase = /\/studies$/i.test(base) ? base : `${base}/studies`;
                    dicom.studyUrl = `${studiesBase}/${encodeURIComponent(report.study_instance_uid)}`;
                }
            } catch (_) {}
            // Local download proxy
            dicom.downloadUrl = `${req.protocol}://${req.get('host')}/api/dicom/studies/${encodeURIComponent(report.study_instance_uid)}/download`;
            
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
    requireAnyRole(['doctor']),
    validateParams({ reportId: schemas.uuid }),
    validateRequest(schemas.updateReportDescription),
    async (req, res) => {
        try {
            const { reportId } = req.params;
            const { study_description } = req.body;
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

// Finalize report (Doctor only)
router.post('/:reportId/finalize',
    requireAnyRole(['doctor']),
    validateParams({ reportId: schemas.uuid }),
    async (req, res) => {
        try {
            const { reportId } = req.params;
            const db = getDB();
            
            // Check if report exists and has versions
            const checkQuery = `
                SELECT r.id, r.finalized_at,
                    (SELECT COUNT(*) FROM report_versions rv WHERE rv.report_id = r.id) as version_count
                FROM reports r
                WHERE r.id = $1 AND r.doctor_id = $2
            `;
            
            const checkResult = await db.query(checkQuery, [reportId, req.user.id]);
            
            if (checkResult.rows.length === 0) {
                return res.status(404).json({ error: 'Report not found' });
            }

            if (checkResult.rows[0].version_count === 0) {
                return res.status(400).json({ error: 'Cannot finalize report without versions' });
            }

            if (checkResult.rows[0].finalized_at) {
                return res.status(400).json({ error: 'Report is already finalized' });
            }

            // Finalize report
            const updateQuery = `
                UPDATE reports 
                SET finalized_at = CURRENT_TIMESTAMP 
                WHERE id = $1
                RETURNING *
            `;
            
            const result = await db.query(updateQuery, [reportId]);

            await createAuditLog(req.user.id, 'report_finalized', 'report', reportId, {
                ip: req.ip,
                user_agent: req.get('User-Agent')
            });

            res.json(result.rows[0]);
        } catch (error) {
            logger.error('Finalize report error:', error);
            res.status(500).json({ error: 'Failed to finalize report' });
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
            // Export allowed in development (system_flags removed)
            const db = getDB();

            const { reportId } = req.params;
            const { format = 'json' } = req.query;
            
            const exportQuery = `
                SELECT 
                    r.*,
                    u.name as doctor_name,
                    u.email as doctor_email,
                    json_agg(json_build_object(
                        'version_no', rv.version_no,
                        'findings', rv.findings,
                        'impression', rv.impression,
                        'template_used', rv.template_used,
                        'generated_by_ai', rv.generated_by_ai,
                        'ai_model_used', rv.ai_model_used,
                        'created_at', rv.created_at
                    ) ORDER BY rv.version_no) as versions
                FROM reports r
                JOIN users u ON r.doctor_id = u.id
                LEFT JOIN report_versions rv ON r.id = rv.report_id
                WHERE r.id = $1
                GROUP BY r.id, u.name, u.email
            `;
            
            const result = await db.query(exportQuery, [reportId]);
            
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Report not found' });
            }

            await createAuditLog(req.user.id, 'report_exported', 'report', reportId, {
                format,
                ip: req.ip,
                user_agent: req.get('User-Agent')
            });

            const reportData = result.rows[0];
            
            if (format === 'json') {
                res.json(reportData);
            } else if (format === 'csv') {
                // Simple CSV export - in production, use a proper CSV library
                const csvData = [
                    'Study Instance UID,Patient ID,Patient Name,Study Date,Modality,Doctor,Created,Finalized,Latest Findings,Latest Impression',
                    [
                        reportData.study_instance_uid,
                        reportData.patient_id,
                        reportData.patient_name || '',
                        reportData.study_date || '',
                        reportData.modality || '',
                        reportData.doctor_name,
                        reportData.created_at,
                        reportData.finalized_at || '',
                        reportData.versions?.[reportData.versions.length - 1]?.findings || '',
                        reportData.versions?.[reportData.versions.length - 1]?.impression || ''
                    ].join(',')
                ].join('\n');
                
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="report-${reportId}.csv"`);
                res.send(csvData);
            } else {
                res.status(400).json({ error: 'Unsupported format' });
            }
        } catch (error) {
            logger.error('Export report error:', error);
            res.status(500).json({ error: 'Failed to export report' });
        }
    }
);

module.exports = router;
