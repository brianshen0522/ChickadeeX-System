const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const { authenticateToken, requireAnyRole } = require('../middleware/auth');
const { getDB } = require('../database/connection');
const { logger } = require('../utils/logger');
const { createAuditLog } = require('../utils/audit');
const { generateAIReport } = require('../services/llm');
const { convertDicomToImage, getDicomMetadata } = require('../utils/dicomConverter');

const router = express.Router();

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

if (!fs.existsSync(UPLOAD_ROOT)) {
    fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

const ALLOWED_EXTENSIONS = new Set(['.dcm', '.dicom', '.jpg', '.jpeg', '.png', '.webp']);
const IMAGE_MIME_PREFIX = 'image/';
let uploadsTableInitPromise = null;

const ensureUploadsTable = async () => {
    if (uploadsTableInitPromise) {
        return uploadsTableInitPromise;
    }

    uploadsTableInitPromise = (async () => {
        try {
            const db = getDB();
            await db.query(`
                CREATE TABLE IF NOT EXISTS uploads (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    stored_filename TEXT NOT NULL,
                    original_filename TEXT NOT NULL,
                    mime_type TEXT NOT NULL,
                    file_size BIGINT NOT NULL,
                    modality VARCHAR(32),
                    hash TEXT,
                    status VARCHAR(16) NOT NULL DEFAULT 'ready',
                    source VARCHAR(32) NOT NULL DEFAULT 'upload',
                    thumbnail_key TEXT,
                    converted_image_path TEXT,
                    dicom_metadata JSONB,
                    is_dicom BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    deleted_at TIMESTAMP
                )
            `);

            await db.query(`CREATE INDEX IF NOT EXISTS idx_uploads_user_id ON uploads(user_id)`);
            await db.query(`CREATE INDEX IF NOT EXISTS idx_uploads_created_at ON uploads(created_at)`);
            await db.query(`CREATE INDEX IF NOT EXISTS idx_uploads_status ON uploads(status)`);
            await db.query(`ALTER TABLE uploads ADD COLUMN IF NOT EXISTS study_instance_uid TEXT`);
        } catch (error) {
            uploadsTableInitPromise = null;
            logger.error('Failed to ensure uploads table exists:', error);
            throw error;
        }
    })();

    return uploadsTableInitPromise;
};

const storage = multer.diskStorage({
    destination: (req, _file, cb) => {
        const now = new Date();
        const year = now.getFullYear().toString();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const userSegment = req.user?.id || 'anonymous';
        const targetDir = path.join(UPLOAD_ROOT, userSegment, year, month, day);
        fs.mkdir(targetDir, { recursive: true }, (err) => cb(err, targetDir));
    },
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const unique = `${uuidv4()}${ext}`;
        cb(null, unique);
    }
});

const fileFilter = (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ALLOWED_EXTENSIONS.has(ext)) {
        return cb(null, true);
    }
    if (file.mimetype && file.mimetype.startsWith(IMAGE_MIME_PREFIX)) {
        return cb(null, true);
    }
    const error = new Error('Unsupported file type. Upload DICOM (.dcm) or image files (JPEG, PNG, WebP).');
    error.status = 400;
    cb(error);
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 200 * 1024 * 1024 // 200 MB
    }
});

const parseDicomMetadata = (value) => {
    if (!value) {
        return null;
    }

    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch (error) {
            logger.warn('Failed to parse DICOM metadata string', error);
            return null;
        }
    }

    return value;
};

const selectUploadRowsWithFallback = async (db, primaryQuery, params, fallbackQuery, mapRow) => {
    try {
        const result = await db.query(primaryQuery, params);
        return result.rows;
    } catch (error) {
        if (error.code === '42703' && fallbackQuery) {
            logger.warn('Uploads table missing extended columns, using fallback projection');
            const legacyResult = await db.query(fallbackQuery, params);
            return legacyResult.rows.map(mapRow);
        }
        throw error;
    }
};

const createFallbackStudyInstanceUID = (uploadId) => {
    if (!uploadId) {
        return `1.2.276.0.7230010.3.1.2.${Date.now()}`;
    }

    const hex = uploadId.replace(/[^a-fA-F0-9]/g, '');
    if (!hex) {
        return `1.2.276.0.7230010.3.1.2.${Date.now()}`;
    }

    try {
        const numeric = BigInt(`0x${hex}`).toString();
        return `1.2.276.0.7230010.3.1.2.${numeric}`;
    } catch (error) {
        logger.warn('Failed to derive numeric studyInstanceUID from upload id', { uploadId, error });
        return `1.2.276.0.7230010.3.1.2.${Date.now()}`;
    }
};

const resolveStudyInstanceUID = ({ uploadId, dicomMetadata, storedValue }) => {
    if (dicomMetadata?.studyInstanceUID) {
        return String(dicomMetadata.studyInstanceUID);
    }
    if (typeof storedValue === 'string' && storedValue.trim().length > 0) {
        return storedValue.trim();
    }
    return createFallbackStudyInstanceUID(uploadId);
};

const mapUploadRow = (row, req) => {
    const isDicom = row.is_dicom || false;
    const hasConvertedImage = row.converted_image_path;
    const dicomMetadata = parseDicomMetadata(row.dicom_metadata);
    const studyInstanceUID = resolveStudyInstanceUID({
        uploadId: row.id,
        dicomMetadata,
        storedValue: row.study_instance_uid
    });

    // For DICOM files with converted images, use the converted image for display
    // For regular images, use the original file
    const type = isDicom ? 'dicom' : 'image';
    const downloadPath = `/api/uploads/${row.id}/file`;
    const displayPath = isDicom && hasConvertedImage
        ? `/api/uploads/${row.id}/converted`
        : downloadPath;

    return {
        id: row.id,
        originalFilename: row.original_filename,
        mimeType: row.mime_type,
        fileSize: Number(row.file_size),
        modality: row.modality,
        createdAt: row.created_at,
        status: row.status,
        type,
        isDicom,
        hasConvertedImage: !!hasConvertedImage,
        downloadPath,
        displayPath,
        viewerParams: isDicom
            ? { dicomUrl: downloadPath, imageUrl: displayPath }
            : { imageUrl: downloadPath },
        absoluteDownloadUrl: `${req.protocol}://${req.get('host')}${downloadPath}`,
        absoluteDisplayUrl: `${req.protocol}://${req.get('host')}${displayPath}`,
        thumbnailPath: row.thumbnail_key
            ? `${req.protocol}://${req.get('host')}/api/uploads/${row.id}/thumbnail`
            : null,
        dicomMetadata,
        studyInstanceUID
    };
};

router.use(authenticateToken);
router.use(requireAnyRole(['doctor', 'admin', 'observer']));

router.post('/', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        await ensureUploadsTable();
    } catch (error) {
        return res.status(500).json({ error: 'Upload storage unavailable' });
    }

    const db = getDB();
    const uploadId = uuidv4();
    const ext = path.extname(req.file.originalname || '').toLowerCase();
    const mimeType = req.file.mimetype || (ext === '.dcm' || ext === '.dicom' ? 'application/dicom' : 'application/octet-stream');
    const storedRelativePath = path.relative(UPLOAD_ROOT, path.join(req.file.destination, req.file.filename));
    const isDicom = ext === '.dcm' || ext === '.dicom' || mimeType === 'application/dicom';

    let convertedImagePath = null;
    let dicomMetadata = null;
    let studyInstanceUID = null;

    try {
        // Handle DICOM conversion
        if (isDicom) {
            try {
                const fullFilePath = path.join(req.file.destination, req.file.filename);
                const outputDir = req.file.destination;
                const baseFileName = path.parse(req.file.filename).name;

                convertedImagePath = await convertDicomToImage(fullFilePath, outputDir, baseFileName);
                dicomMetadata = await getDicomMetadata(fullFilePath);

                // Store relative path for converted image
                convertedImagePath = path.relative(UPLOAD_ROOT, convertedImagePath);

                logger.info(`DICOM file converted: ${req.file.originalname} -> ${convertedImagePath}`);
            } catch (conversionError) {
                logger.error('DICOM conversion failed:', conversionError);
                // Continue with upload even if conversion fails
            }
        }

        const resolvedMetadata = dicomMetadata ? JSON.stringify(dicomMetadata) : null;
        studyInstanceUID = resolveStudyInstanceUID({
            uploadId,
            dicomMetadata,
            storedValue: null
        });

        let insertedRow;
        try {
            const insertResult = await db.query(
                `INSERT INTO uploads (id, user_id, stored_filename, original_filename, mime_type, file_size, modality, status, source, converted_image_path, dicom_metadata, is_dicom, study_instance_uid, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'ready', 'upload', $8, $9, $10, $11, CURRENT_TIMESTAMP)
                 RETURNING id, original_filename, mime_type, file_size, modality, created_at, status, thumbnail_key, converted_image_path, is_dicom, dicom_metadata, study_instance_uid`,
                [
                    uploadId,
                    req.user.id,
                    storedRelativePath,
                    req.file.originalname,
                    mimeType,
                    req.file.size,
                    req.body.modality || null,
                    convertedImagePath,
                    resolvedMetadata,
                    isDicom,
                    studyInstanceUID
                ]
            );
            insertedRow = insertResult.rows[0];
        } catch (error) {
            if (error.code !== '42703') {
                throw error;
            }

            logger.warn('Uploads table missing extended columns, using legacy insert');
            const legacyResult = await db.query(
                `INSERT INTO uploads (id, user_id, stored_filename, original_filename, mime_type, file_size, status, source, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, 'ready', 'upload', CURRENT_TIMESTAMP)
                 RETURNING id, original_filename, mime_type, file_size, created_at, status`,
                [
                    uploadId,
                    req.user.id,
                    storedRelativePath,
                    req.file.originalname,
                    mimeType,
                    req.file.size
                ]
            );
            const legacyRow = legacyResult.rows[0];
            insertedRow = {
                ...legacyRow,
                modality: req.body.modality || null,
                thumbnail_key: null,
                converted_image_path: null,
                is_dicom: isDicom,
                dicom_metadata: resolvedMetadata,
                study_instance_uid: studyInstanceUID
            };
            if (convertedImagePath) {
                const convertedFullPath = path.join(UPLOAD_ROOT, convertedImagePath);
                fs.unlink(convertedFullPath, () => {});
            }
            convertedImagePath = null; // ensure downstream references are accurate
        }

        await createAuditLog(req.user.id, 'upload_created', 'upload', uploadId, {
            original_filename: req.file.originalname,
            mime_type: mimeType,
            file_size: req.file.size,
            is_dicom: isDicom,
            converted: !!convertedImagePath,
            ip: req.ip,
            user_agent: req.get('User-Agent')
        });

        res.status(201).json(mapUploadRow(insertedRow, req));
    } catch (error) {
        logger.error('Upload save failed:', error);

        // Cleanup uploaded files on failure
        const filesToDelete = [path.join(req.file.destination, req.file.filename)];
        if (convertedImagePath) {
            filesToDelete.push(path.join(UPLOAD_ROOT, convertedImagePath));
        }

        filesToDelete.forEach(filePath => {
            fs.unlink(filePath, () => {});
        });

        res.status(500).json({ error: 'Failed to save upload' });
    }
});

router.get('/', async (req, res) => {
    try {
        await ensureUploadsTable();
        const db = getDB();
        const limit = Math.min(Number(req.query.limit) || 20, 50);
        let cursor = null;
        if (req.query.cursor) {
            try {
                cursor = JSON.parse(Buffer.from(req.query.cursor, 'base64').toString('utf8'));
            } catch (_err) {
                return res.status(400).json({ error: 'Invalid cursor' });
            }
        }

        let cursorFilter = '';
        const params = [req.user.id];
        if (cursor && cursor.createdAt && cursor.id) {
            params.push(new Date(cursor.createdAt), cursor.id);
            cursorFilter = `AND (created_at < $2 OR (created_at = $2 AND id < $3))`;
        }
        params.push(limit + 1);

        const buildQuery = (columns) => `
            SELECT ${columns}
            FROM uploads
            WHERE user_id = $1
              AND status = 'ready'
              ${cursorFilter}
            ORDER BY created_at DESC, id DESC
            LIMIT $${params.length}
        `;

        let rows;
        try {
            const result = await db.query(
                buildQuery('id, original_filename, mime_type, file_size, modality, created_at, status, thumbnail_key, converted_image_path, is_dicom, dicom_metadata, study_instance_uid'),
                params
            );
            rows = result.rows;
        } catch (error) {
            if (error.code === '42703') {
                logger.warn('Uploads table missing optional columns, retrying with legacy projection');
                const legacyResult = await db.query(
                    buildQuery('id, original_filename, mime_type, file_size, modality, created_at, status'),
                    params
                );
                rows = legacyResult.rows.map((row) => ({
                    ...row,
                    thumbnail_key: row.thumbnail_key || null,
                    converted_image_path: null,
                    is_dicom: row.is_dicom || false,
                    dicom_metadata: row.dicom_metadata || null,
                    study_instance_uid: row.study_instance_uid || null
                }));
            } else {
                throw error;
            }
        }

        let nextCursor = null;
        if (rows.length > limit) {
            const next = rows.pop();
            nextCursor = Buffer.from(JSON.stringify({ createdAt: next.created_at, id: next.id })).toString('base64');
        }

        res.json({
            items: rows.map((row) => mapUploadRow(row, req)),
            nextCursor
        });
    } catch (error) {
        if (error?.code === '42P01') { // relation does not exist
            logger.warn('Uploads table missing, returning empty list');
            return res.json({ items: [], nextCursor: null });
        }
        logger.error('List uploads failed:', error);
        res.status(500).json({ error: 'Failed to retrieve uploads' });
    }
});

router.get('/:uploadId', async (req, res) => {
    try {
        await ensureUploadsTable();
        const db = getDB();
        const rows = await selectUploadRowsWithFallback(
            db,
            `SELECT id, original_filename, mime_type, file_size, modality, created_at, status, thumbnail_key, converted_image_path, is_dicom, dicom_metadata, study_instance_uid
             FROM uploads
             WHERE id = $1
               AND (user_id = $2 OR $3 = 'admin')
               AND status = 'ready'`,
            [req.params.uploadId, req.user.id, req.user.role],
            `SELECT id, original_filename, mime_type, file_size, created_at, status
             FROM uploads
             WHERE id = $1
               AND (user_id = $2 OR $3 = 'admin')
               AND status = 'ready'`,
            (row) => ({
                id: row.id,
                original_filename: row.original_filename,
                mime_type: row.mime_type,
                file_size: row.file_size,
                modality: null,
                created_at: row.created_at,
                status: row.status,
                thumbnail_key: null,
                converted_image_path: null,
                is_dicom: false,
                dicom_metadata: null,
                study_instance_uid: null
            })
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Upload not found' });
        }

        const item = mapUploadRow(rows[0], req);
        res.json(item);
    } catch (error) {
        logger.error('Get upload metadata failed:', error);
        res.status(500).json({ error: 'Failed to retrieve upload' });
    }
});

router.get('/:uploadId/file', async (req, res) => {
    try {
        await ensureUploadsTable();
        const db = getDB();
        const result = await db.query(
            `SELECT id, stored_filename, original_filename, mime_type, file_size, status
             FROM uploads
             WHERE id = $1
               AND (user_id = $2 OR $3 = 'admin')
               AND status = 'ready'`,
            [req.params.uploadId, req.user.id, req.user.role]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Upload not found' });
        }

        const uploadRow = result.rows[0];
        const filePath = path.join(UPLOAD_ROOT, uploadRow.stored_filename);

        if (!fs.existsSync(filePath)) {
            logger.warn(`Upload file missing on disk: ${filePath}`);
            return res.status(410).json({ error: 'Uploaded file is no longer available' });
        }

        res.setHeader('Content-Type', uploadRow.mime_type || 'application/octet-stream');
        res.setHeader('Content-Length', uploadRow.file_size);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(uploadRow.original_filename)}"`);
        const stream = fs.createReadStream(filePath);
        stream.on('error', (err) => {
            logger.error('Stream error for upload:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to read file' });
            } else {
                res.destroy(err);
            }
        });
        stream.pipe(res);
    } catch (error) {
        logger.error('Download upload failed:', error);
        res.status(500).json({ error: 'Failed to download file' });
    }
});

router.get('/:uploadId/converted', async (req, res) => {
    try {
        await ensureUploadsTable();
        const db = getDB();
        let result;
        try {
            result = await db.query(
                `SELECT id, converted_image_path, original_filename, is_dicom, status
                 FROM uploads
                 WHERE id = $1
                   AND (user_id = $2 OR $3 = 'admin')
                   AND status = 'ready'`,
                [req.params.uploadId, req.user.id, req.user.role]
            );
        } catch (error) {
            if (error.code === '42703') {
                logger.warn('Converted image columns unavailable on uploads table');
                return res.status(404).json({ error: 'Converted image not available' });
            }
            throw error;
        }

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Upload not found' });
        }

        const uploadRow = result.rows[0];

        if (!uploadRow.is_dicom || !uploadRow.converted_image_path) {
            return res.status(404).json({ error: 'Converted image not available' });
        }

        const filePath = path.join(UPLOAD_ROOT, uploadRow.converted_image_path);

        if (!fs.existsSync(filePath)) {
            logger.warn(`Converted image file missing on disk: ${filePath}`);
            return res.status(410).json({ error: 'Converted image is no longer available' });
        }

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Disposition', `inline; filename="converted_${encodeURIComponent(uploadRow.original_filename)}.png"`);

        const stream = fs.createReadStream(filePath);
        stream.on('error', (err) => {
            logger.error('Stream error for converted image:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to read converted image' });
            } else {
                res.destroy(err);
            }
        });
        stream.pipe(res);
    } catch (error) {
        logger.error('Download converted image failed:', error);
        res.status(500).json({ error: 'Failed to download converted image' });
    }
});

router.delete('/:uploadId', async (req, res) => {
    try {
        await ensureUploadsTable();
        const db = getDB();

        // Start transaction for atomic deletion
        await db.query('BEGIN');

        try {
            // Get file information before deletion
            const uploadRows = await selectUploadRowsWithFallback(
                db,
                `SELECT stored_filename, original_filename, converted_image_path, is_dicom, status, dicom_metadata, study_instance_uid
                 FROM uploads
                 WHERE id = $1
                   AND user_id = $2
                   AND status = 'ready'`,
                [req.params.uploadId, req.user.id],
                `SELECT stored_filename, original_filename, status
                 FROM uploads
                 WHERE id = $1
                   AND user_id = $2
                   AND status = 'ready'`,
                (row) => ({
                    stored_filename: row.stored_filename,
                    original_filename: row.original_filename,
                    converted_image_path: null,
                    is_dicom: false,
                    status: row.status,
                    dicom_metadata: null,
                    study_instance_uid: null
                })
            );

            if (uploadRows.length === 0) {
                await db.query('ROLLBACK');
                return res.status(404).json({ error: 'Upload not found' });
            }

            const uploadRecord = uploadRows[0];
            const dicomMetadata = parseDicomMetadata(uploadRecord.dicom_metadata);
            const studyInstanceUID = resolveStudyInstanceUID({
                uploadId: req.params.uploadId,
                dicomMetadata,
                storedValue: uploadRecord.study_instance_uid
            });

            const linkedReports = await db.query(
                `SELECT id FROM reports WHERE study_instance_uid = $1 LIMIT 1`,
                [studyInstanceUID]
            );

            if (linkedReports.rows.length > 0) {
                await db.query('ROLLBACK');
                return res.status(409).json({
                    error: 'This study is linked to an existing report. Delete the report before removing the image.',
                    reportId: linkedReports.rows[0].id
                });
            }

            const { stored_filename, original_filename, converted_image_path, is_dicom } = uploadRecord;
            if (!stored_filename) {
                await db.query('ROLLBACK');
                return res.status(404).json({ error: 'Upload file not found' });
            }

            // Mark as deleted in database
            const updateResult = await db.query(
                `UPDATE uploads
                 SET status = 'deleted',
                     updated_at = CURRENT_TIMESTAMP,
                     deleted_at = CURRENT_TIMESTAMP
                 WHERE id = $1
                   AND user_id = $2
                   AND status = 'ready'
                 RETURNING id`,
                [req.params.uploadId, req.user.id]
            );

            if (updateResult.rows.length === 0) {
                await db.query('ROLLBACK');
                return res.status(404).json({ error: 'Upload not found or already deleted' });
            }

            // Delete physical files
            const filesToDelete = [path.join(UPLOAD_ROOT, stored_filename)];

            // If it's a DICOM file with converted image, delete both files
            if (is_dicom && converted_image_path) {
                filesToDelete.push(path.join(UPLOAD_ROOT, converted_image_path));
            }

            filesToDelete.forEach((filePath) => {
                fs.unlink(filePath, (err) => {
                    if (err) {
                        logger.warn(`Failed to delete file: ${filePath}`, err);
                    } else {
                        logger.info(`Deleted file: ${filePath}`);
                    }
                });
            });

            // Create audit log
            await createAuditLog(req.user.id, 'upload_deleted', 'upload', req.params.uploadId, {
                original_filename,
                is_dicom,
                files_deleted: filesToDelete.length,
                ip: req.ip,
                user_agent: req.get('User-Agent')
            });

            // Commit transaction
            await db.query('COMMIT');

            res.json({
                message: 'Upload removed successfully',
                filesDeleted: filesToDelete.length,
                isDicom: is_dicom
            });

        } catch (transactionError) {
            await db.query('ROLLBACK');
            throw transactionError;
        }
    } catch (error) {
        logger.error('Delete upload failed:', error);
        res.status(500).json({ error: 'Failed to delete upload' });
    }
});

router.post('/:uploadId/generate', async (req, res) => {
    try {
        await ensureUploadsTable();
        const db = getDB();
        const result = await db.query(
            `SELECT id, original_filename, mime_type
             FROM uploads
             WHERE id = $1
               AND user_id = $2
               AND status = 'ready'`,
            [req.params.uploadId, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Upload not found' });
        }

        const uploadRow = result.rows[0];
        const downloadPath = `${req.protocol}://${req.get('host')}/api/uploads/${uploadRow.id}/file`;

        const payload = {
            studyDescription: req.body?.study_description || uploadRow.original_filename,
            modality: req.body?.modality || null,
            clinicalContext: req.body?.clinical_context || '',
            dicom: {
                studyInstanceUID: uploadRow.id,
                downloadUrl: downloadPath
            }
        };

        const aiResult = await generateAIReport(payload);

        await createAuditLog(req.user.id, 'upload_ai_generated', 'upload', uploadRow.id, {
            original_filename: uploadRow.original_filename,
            model_used: aiResult?.model_used,
            ip: req.ip,
            user_agent: req.get('User-Agent')
        });

        res.json(aiResult);
    } catch (error) {
        logger.error('Upload AI generation failed:', error);
        res.status(500).json({ error: 'AI generation failed' });
    }
});

// Create a report from an upload
router.post('/:uploadId/reports', async (req, res) => {
    try {
        await ensureUploadsTable();
        const db = getDB();

        // Get upload information
        const uploadRows = await selectUploadRowsWithFallback(
            db,
            `SELECT id, original_filename, user_id, modality, dicom_metadata, is_dicom, study_instance_uid
             FROM uploads
             WHERE id = $1
               AND user_id = $2
               AND status = 'ready'`,
            [req.params.uploadId, req.user.id],
            `SELECT id, original_filename, user_id
             FROM uploads
             WHERE id = $1
               AND user_id = $2
               AND status = 'ready'`,
            (row) => ({
                id: row.id,
                original_filename: row.original_filename,
                user_id: row.user_id,
                modality: row.modality || null,
                dicom_metadata: null,
                is_dicom: false,
                study_instance_uid: null
            })
        );

        if (uploadRows.length === 0) {
            return res.status(404).json({ error: 'Upload not found' });
        }

        const upload = uploadRows[0];
        const dicomMetadata = parseDicomMetadata(upload.dicom_metadata);
        const isDicom = upload.is_dicom || Boolean(dicomMetadata);

        const studyInstanceUID = resolveStudyInstanceUID({
            uploadId: upload.id,
            dicomMetadata,
            storedValue: upload.study_instance_uid
        });

        if (upload.study_instance_uid !== studyInstanceUID) {
            try {
                await db.query(
                    `UPDATE uploads SET study_instance_uid = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
                    [studyInstanceUID, upload.id]
                );
            } catch (updateError) {
                if (updateError.code !== '42703') {
                    logger.warn('Failed to persist study_instance_uid for upload', { uploadId: upload.id, updateError });
                }
            }
        }

        // Check if report already exists for this study
        const existingQuery = 'SELECT id FROM reports WHERE study_instance_uid = $1 AND doctor_id = $2';
        const existing = await db.query(existingQuery, [studyInstanceUID, req.user.id]);

        if (existing.rows.length > 0) {
            return res.status(409).json({
                error: 'Report already exists for this study',
                reportId: existing.rows[0].id
            });
        }

        const reportId = uuidv4();

        // Extract metadata from DICOM if available
        let patientId = 'ANON';
        let patientName = 'Anonymous';
        let studyDate = null;
        let studyDescription = upload.original_filename;

        if (isDicom && dicomMetadata) {
            const metadata = dicomMetadata;
            patientId = metadata.patientId || patientId;
            patientName = metadata.patientName || patientName;
            if (metadata.studyDate) {
                // Convert DICOM date format (YYYYMMDD) to ISO date
                const dateStr = metadata.studyDate.toString();
                if (dateStr.length === 8) {
                    studyDate = `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}`;
                }
            }
            studyDescription = metadata.studyDescription || studyDescription;
        }

        const insertQuery = `
            INSERT INTO reports (id, study_instance_uid, patient_id, patient_name, study_date, study_description, modality, doctor_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `;

        const result = await db.query(insertQuery, [
            reportId,
            studyInstanceUID,
            patientId,
            patientName,
            studyDate,
            studyDescription,
            upload.modality || 'OT',
            req.user.id
        ]);

        await createAuditLog(req.user.id, 'report_created_from_upload', 'report', reportId, {
            upload_id: upload.id,
            study_instance_uid: studyInstanceUID,
            patient_id: patientId,
            ip: req.ip,
            user_agent: req.get('User-Agent')
        });

        res.status(201).json(result.rows[0]);
    } catch (error) {
        logger.error('Create report from upload failed:', error);
        res.status(500).json({ error: 'Failed to create report from upload' });
    }
});

// Save or update report content linked to an upload
router.post('/:uploadId/reports/:reportId/versions', async (req, res) => {
    try {
        await ensureUploadsTable();
        const { uploadId, reportId } = req.params;
        const { findings, impression } = req.body;
        const db = getDB();

        // Verify upload ownership
        const uploadResult = await db.query(
            `SELECT id FROM uploads WHERE id = $1 AND user_id = $2 AND status = 'ready'`,
            [uploadId, req.user.id]
        );

        if (uploadResult.rows.length === 0) {
            return res.status(404).json({ error: 'Upload not found' });
        }

        // Check if report exists and user has access
        const reportQuery = 'SELECT id, doctor_id, finalized_at FROM reports WHERE id = $1';
        const reportResult = await db.query(reportQuery, [reportId]);

        if (reportResult.rows.length === 0) {
            return res.status(404).json({ error: 'Report not found' });
        }

        const report = reportResult.rows[0];
        if (report.doctor_id !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized to edit this report' });
        }

        if (report.finalized_at) {
            return res.status(400).json({ error: 'Cannot edit a finalized report' });
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
            INSERT INTO report_versions (report_id, version_no, findings, impression)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;

        const result = await db.query(insertQuery, [
            reportId,
            nextVersion,
            findings || '',
            impression || ''
        ]);

        await createAuditLog(req.user.id, 'report_version_created_from_upload', 'report', reportId, {
            upload_id: uploadId,
            version_no: nextVersion,
            ip: req.ip,
            user_agent: req.get('User-Agent')
        });

        res.status(201).json(result.rows[0]);
    } catch (error) {
        logger.error('Save report version from upload failed:', error);
        res.status(500).json({ error: 'Failed to save report version' });
    }
});

// Get report associated with an upload
router.get('/:uploadId/reports', async (req, res) => {
    try {
        await ensureUploadsTable();
        const db = getDB();

        // Get upload information
        const uploadRows = await selectUploadRowsWithFallback(
            db,
            `SELECT id, original_filename, user_id, dicom_metadata, is_dicom, study_instance_uid
             FROM uploads
             WHERE id = $1
               AND user_id = $2
               AND status = 'ready'`,
            [req.params.uploadId, req.user.id],
            `SELECT id, original_filename, user_id
             FROM uploads
             WHERE id = $1
               AND user_id = $2
               AND status = 'ready'`,
            (row) => ({
                id: row.id,
                original_filename: row.original_filename,
                user_id: row.user_id,
                dicom_metadata: null,
                is_dicom: false,
                study_instance_uid: null
            })
        );

        if (uploadRows.length === 0) {
            return res.status(404).json({ error: 'Upload not found' });
        }

        const upload = uploadRows[0];
        const dicomMetadata = parseDicomMetadata(upload.dicom_metadata);
        const isDicom = upload.is_dicom || Boolean(dicomMetadata);

        const studyInstanceUID = resolveStudyInstanceUID({
            uploadId: upload.id,
            dicomMetadata,
            storedValue: upload.study_instance_uid
        });

        if (upload.study_instance_uid !== studyInstanceUID) {
            try {
                await db.query(
                    `UPDATE uploads SET study_instance_uid = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
                    [studyInstanceUID, upload.id]
                );
            } catch (updateError) {
                if (updateError.code !== '42703') {
                    logger.warn('Failed to persist study_instance_uid for upload', { uploadId: upload.id, updateError });
                }
            }
        }

        // Find report for this study
        const params = [`%${upload.id}%`, studyInstanceUID];
        let doctorFilter = '';
        if (req.user.role !== 'admin') {
            doctorFilter = ' AND rs.doctor_id = $3';
            params.push(req.user.id);
        }

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
                ) ORDER BY rv.version_no DESC)
                FROM report_versions rv WHERE rv.report_id = rs.id) as versions
            FROM report_summary rs
            WHERE (rs.study_instance_uid LIKE $1 OR rs.study_instance_uid = $2)
            ${doctorFilter}
        `;

        let result;
        try {
            result = await db.query(reportQuery, params);
        } catch (error) {
            if (error.code === '42P01') {
                logger.warn('report_summary view unavailable; using fallback reports query');
                result = await db.query(
                    `SELECT r.*,
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
                        FROM report_versions rv WHERE rv.report_id = r.id) as versions
                     FROM reports r
                     WHERE (r.study_instance_uid LIKE $1 OR r.study_instance_uid = $2)
                       ${req.user.role !== 'admin' ? 'AND r.doctor_id = $3' : ''}
                     ORDER BY r.created_at DESC`,
                    params
                );
            } else {
                throw error;
            }
        }

        if (result.rows.length === 0) {
            return res.json({
                id: null,
                study_instance_uid: studyInstanceUID,
                upload_id: upload.id,
                doctor_id: req.user.id,
                patient_id: null,
                patient_name: null,
                versions: []
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        logger.error('Get upload report failed:', error);
        res.status(500).json({ error: 'Failed to get upload report' });
    }
});

module.exports = router;
