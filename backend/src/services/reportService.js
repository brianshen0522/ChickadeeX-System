const path = require('path');
const fs = require('fs');
const os = require('os');
const axios = require('axios');
const AdmZip = require('adm-zip');
const { v4: uuidv4 } = require('uuid');

const { getDB } = require('../database/connection');
const { logger } = require('../utils/logger');
const { createAuditLog } = require('../utils/audit');
const { generateAIReport } = require('./llm');
const { convertDicomToImage } = require('../utils/dicomConverter');
const { decryptSecret } = require('../utils/crypto');
const AppError = require('../utils/AppError');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');
const fsp = fs.promises;

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

        const dicomEntry = pickDicomEntry(archiveResponse.data);
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
            const storedPath = path.isAbsolute(upload.stored_filename)
                ? upload.stored_filename
                : path.join(UPLOAD_ROOT, upload.stored_filename);
            if (!storedPath || !fs.existsSync(storedPath)) {
                logger.warn('Stored DICOM missing for preview', { studyInstanceUID, uploadId: upload.id });
                return { downloadUrl, imageUrl: '', imageMimeType: '', imagePath: '' };
            }

            let convertedPath = upload.converted_image_path
                ? (path.isAbsolute(upload.converted_image_path)
                    ? upload.converted_image_path
                    : path.join(UPLOAD_ROOT, upload.converted_image_path))
                : null;
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
                                error: updateError.message
                            });
                        }
                    }
                } catch (error) {
                    logger.warn('Failed to convert DICOM for report preview', {
                        uploadId: upload.id,
                        error: error.message
                    });
                    return { downloadUrl, imageUrl: '', imageMimeType: '', imagePath: '' };
                }
            }

            imageUrl = `${hostOrigin}/api/uploads/${upload.id}/converted`;
            imageMimeType = 'image/jpeg';
            imagePath = convertedPath;
        }

        return {
            downloadUrl,
            imageUrl,
            imageMimeType,
            imagePath,
            uploadId: upload.id
        };
    } catch (error) {
        if (error.code === '42P01') {
            return null;
        }
        logger.warn('Failed to resolve upload preview for report', {
            studyInstanceUID,
            error: error.message
        });
        return await generatePacsPreview(db, studyInstanceUID, hostOrigin);
    }
};

const escapeCsvField = (value) => {
    if (value === null || value === undefined) return '';
    let str = String(value);
    if (/^[=+\-@]/.test(str)) {
        str = `'${str}`;
    }
    if (/[",\n\r]/.test(str)) {
        str = `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

const getLlmConfigs = async () => {
    const db = getDB();
    const query = `
        SELECT id, name, model_name, api_url, priority, enabled, max_tokens, temperature, top_p,
               (api_key IS NOT NULL) AS has_api_key
        FROM llm_configs
        WHERE enabled = true
        ORDER BY priority ASC
    `;
    const result = await db.query(query);
    return result.rows;
};

const searchReports = async (req) => {
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

    if (req.user.role === 'researcher') {
        conditions.push('r.finalized_at IS NOT NULL');
    } else if (req.user.role === 'observer') {
        paramCount++;
        conditions.push(`r.study_instance_uid IN (
            SELECT DISTINCT study_instance_uid
            FROM uploads
            WHERE user_id = $${paramCount} AND status = 'ready'
        )`);
        values.push(req.user.id);
    }

    if (req.user.role === 'doctor') {
        paramCount++;
        conditions.push(`r.doctor_id = $${paramCount}`);
        values.push(req.user.id);
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
        conditions.push(`r.study_instance_uid ILIKE $${paramCount}`);
        values.push(`%${study_instance_uid}%`);
    }

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

    const restrictStatusForRole = req.user.role === 'researcher';
    if (!restrictStatusForRole && normalizedStatus) {
        if (normalizedStatus === 'finalized') {
            conditions.push('r.finalized_at IS NOT NULL');
        } else if (normalizedStatus === 'draft') {
            conditions.push('r.finalized_at IS NULL');
        }
    }

    const whereClause = conditions.length > 0
        ? 'WHERE ' + conditions.join(' AND ')
        : '';

    const limitIndex = ++paramCount;
    values.push(parseInt(limit, 10));

    const offsetIndex = ++paramCount;
    values.push(parseInt(offset, 10));

    const buildListQuery = ({ includeTags = true, includeVersions = true } = {}) => {
        const columns = [
            'r.id',
            'r.study_instance_uid',
            'r.patient_id',
            'r.patient_name',
            'r.study_date',
            'r.study_description',
            'r.modality',
            'r.doctor_id',
            'u.name AS doctor_name',
            'r.created_at',
            'r.updated_at',
            'r.finalized_at'
        ];

        columns.push(includeTags ? 'r.tags' : `'{}'::text[] AS tags`);

        columns.push(
            includeVersions ? 'COALESCE(rv.version_count, 0) AS version_count' : '0::int AS version_count',
            '(r.finalized_at IS NOT NULL) AS is_finalized',
            'COUNT(*) OVER() AS total_count'
        );

        let queryText = `
            SELECT 
                ${columns.join(',\n                ')}
            FROM reports r
            LEFT JOIN users u ON u.id = r.doctor_id
        `;

        if (includeVersions) {
            queryText += `
            LEFT JOIN (
                SELECT report_id, COUNT(*)::int AS version_count
                FROM report_versions
                GROUP BY report_id
            ) rv ON rv.report_id = r.id`;
        }

        if (whereClause) {
            queryText += `\n${whereClause}`;
        }

        queryText += `
            ORDER BY r.created_at DESC
            LIMIT $${limitIndex}
            OFFSET $${offsetIndex}
        `;

        return queryText;
    };

    const executeQuery = async (queryText) => {
        return db.query(queryText, values);
    };

    let result;
    try {
        result = await executeQuery(buildListQuery({ includeTags: true, includeVersions: true }));
    } catch (error) {
        if (error.code === '42703') {
            logger.warn('Reports list query missing extended columns, retrying without optional fields');
            try {
                result = await executeQuery(buildListQuery({ includeTags: false, includeVersions: true }));
            } catch (nestedError) {
                if (nestedError.code === '42P01') {
                    logger.warn('Report versions table missing, retrying without version counts');
                    result = await executeQuery(buildListQuery({ includeTags: false, includeVersions: false }));
                } else {
                    throw nestedError;
                }
            }
        } else if (error.code === '42P01') {
            logger.warn('Report versions table missing, retrying without version counts');
            result = await executeQuery(buildListQuery({ includeTags: true, includeVersions: false }));
        } else {
            throw error;
        }
    }

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

    return {
        reports: reports.map(({ total_count, ...rest }) => rest),
        pagination: {
            limit: parseInt(limit, 10),
            offset: parseInt(offset, 10),
            total
        }
    };
};

const createReport = async (req) => {
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
    const reportId = uuidv4();

    const insertQuery = `
        INSERT INTO reports (id, study_instance_uid, patient_id, patient_name, patient_dob, study_date, study_description, modality, doctor_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (study_instance_uid) DO NOTHING
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

    if (result.rows.length === 0) {
        throw new AppError('Report already exists for this study', 409, 'REPORT_EXISTS');
    }

    await createAuditLog(req.user.id, 'report_created', 'report', reportId, {
        study_instance_uid,
        patient_id,
        ip: req.ip,
        user_agent: req.get('User-Agent')
    });

    return result.rows[0];
};

const createVersion = async (req) => {
    const { reportId } = req.params;
    const { findings, impression, template_used } = req.body;
    const db = getDB();

    const reportQuery = 'SELECT id FROM reports WHERE id = $1';
    const reportResult = await db.query(reportQuery, [reportId]);
    if (reportResult.rows.length === 0) {
        throw new AppError('Report not found', 404, 'REPORT_NOT_FOUND');
    }

    const lastRes = await db.query(
        'SELECT findings, impression FROM report_versions WHERE report_id = $1 ORDER BY version_no DESC LIMIT 1',
        [reportId]
    );
    if (lastRes.rows.length) {
        const last = lastRes.rows[0];
        const norm = (v) => (v || '').trim();
        if (norm(last.findings) === norm(findings) && norm(last.impression) === norm(impression)) {
            throw new AppError('No changes to save', 409, 'NO_CHANGES');
        }
    }

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

    return result.rows[0];
};

const generatePreview = async (req) => {
    const { reportId } = req.params;
    const db = getDB();

    const llmCheckRes = await db.query(`SELECT COUNT(*) as count FROM llm_configs WHERE enabled = true`);
    const availableModels = parseInt(llmCheckRes.rows[0]?.count || 0);
    if (availableModels === 0) {
        throw new AppError('No LLM models available. Please configure and enable at least one LLM model in the admin panel before generating reports.', 400, 'LLM_NOT_CONFIGURED');
    }

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
        throw new AppError('Report not found', 404, 'REPORT_NOT_FOUND');
    }

    const report = reportResult.rows[0];
    let dicom = { studyInstanceUID: report.study_instance_uid, imagePath: '' };
    try {
        const pacs = await db.query('SELECT pacs_url FROM pacs_config LIMIT 1');
        if (pacs.rows.length && pacs.rows[0].pacs_url) {
            const base = String(pacs.rows[0].pacs_url || '').replace(/\/*$/,'');
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

    let aiResult;
    try {
        aiResult = await generateAIReport({
            studyDescription: report.study_description,
            modality: report.modality,
            clinicalContext: report.clinical_context || '',
            previousContent: report.previous_content,
            dicom
        });
    } catch (error) {
        if (error && /image preview required/i.test(error.message || '')) {
            throw new AppError('Preview image unavailable for AI generation', 400, 'PREVIEW_MISSING');
        }
        throw error;
    }

    return {
        findings: aiResult.findings,
        impression: aiResult.impression,
        model_used: aiResult.model_used,
        model_config: aiResult.model_config,
        preview: true
    };
};

const finalizeReport = async (req) => {
    const { reportId } = req.params;
    const db = getDB();

    const checkQuery = `
        SELECT r.id, r.finalized_at,
               (SELECT COUNT(*)::int FROM report_versions rv WHERE rv.report_id = r.id) AS version_count
        FROM reports r
        WHERE r.id = $1 AND r.doctor_id = $2
    `;

    const checkResult = await db.query(checkQuery, [reportId, req.user.id]);
    if (checkResult.rows.length === 0) {
        throw new AppError('Report not found', 404, 'REPORT_NOT_FOUND');
    }

    if (checkResult.rows[0].version_count === 0) {
        throw new AppError('Cannot finalize report without versions', 400, 'REPORT_NO_VERSIONS');
    }

    if (checkResult.rows[0].finalized_at) {
        throw new AppError('Report is already finalized', 400, 'REPORT_ALREADY_FINALIZED');
    }

    await db.query(
        `UPDATE reports
         SET finalized_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [reportId]
    );

    await createAuditLog(req.user.id, 'report_finalized', 'report', reportId, {
        ip: req.ip,
        user_agent: req.get('User-Agent')
    });

    return { message: 'Report finalized', reportId };
};

const exportReport = async (req) => {
    const { reportId } = req.params;
    const { format = 'json' } = req.query;
    const db = getDB();

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
        throw new AppError('Report not found', 404, 'REPORT_NOT_FOUND');
    }

    await createAuditLog(req.user.id, 'report_exported', 'report', reportId, {
        format,
        ip: req.ip,
        user_agent: req.get('User-Agent')
    });

    const reportData = result.rows[0];

    if (format === 'json') {
        return { format: 'json', data: reportData };
    }

    if (format === 'csv') {
        const latestVersion = reportData.versions?.[reportData.versions.length - 1] || {};
        const csvRow = [
            reportData.study_instance_uid,
            reportData.patient_id,
            reportData.patient_name || '',
            reportData.study_date || '',
            reportData.modality || '',
            reportData.doctor_name,
            reportData.created_at,
            reportData.finalized_at || '',
            latestVersion.findings || '',
            latestVersion.impression || ''
        ].map(escapeCsvField).join(',');

        const csvData = [
            'Study Instance UID,Patient ID,Patient Name,Study Date,Modality,Doctor,Created,Finalized,Latest Findings,Latest Impression',
            csvRow
        ].join('\n');

        return { format: 'csv', data: csvData, filename: `report-${reportId}.csv` };
    }

    throw new AppError('Unsupported format', 400, 'UNSUPPORTED_FORMAT');
};

module.exports = {
    getLlmConfigs,
    searchReports,
    createReport,
    createVersion,
    generatePreview,
    finalizeReport,
    exportReport
};
