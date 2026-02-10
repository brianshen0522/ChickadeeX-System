const bcrypt = require('bcryptjs');
const { getDB } = require('../database/connection');
const { logger } = require('../utils/logger');
const { createAuditLog } = require('../utils/audit');
const { callLLM } = require('./llm');
const { encryptSecret, decryptSecret } = require('../utils/crypto');
const AppError = require('../utils/AppError');

const LLM_TEST_PLACEHOLDER_IMAGE = {
    base64: 'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAAFTklEQVR4nO3QZzcQDAAF4FtaGqiUSinakxYqmjS0NTWshgbSljS1rDS1d2nSQtsu7dAW2ntrr3Pec94/cb/c5yc8wP+KFClStGhRAwODYsWKFS9evESJEiVLlixVqpShoWHp0qXLlClTtmzZcuXKGRkZGRsbm5iYlC9fvkKFChUrVjQ1Na1UqVLlypXNzMyqVKlStWrVatWqmZubV69evUaNGhYWFjVr1qxVq5alpaWVlVXt2rXr1KlTt27devXq1a9fv0GDBg0bNmzUqFHjxo2bNGnStGnTZs2aWVtb29jYNG/evEWLFi1btmzVqlXr1q1tbW3t7Ozs7e3btGnTtm3bdu3aOTg4ODo6tm/fvkOHDh07duzUqVPnzp27dOni5OTk7OzctWvXbt26de/evUePHi4uLj179uzVq1fv3r379OnTt2/ffv369e/f39XVdcCAAQMHDhw0aNDgwYOHDBkydOhQNze3YcOGDR8+fMSIESNHjnR3d/fw8PD09PTy8vL29h41atTo0aPHjBkzduxYHx+fcePGjR8/fsKECRMnTvT19fXz8/P39580aVJAQMDkyZOnTJkyderUadOmTZ8+fcaMGTNnzgwMDJw1a1ZQUNDs2bODg4PnzJkzd+5c7TP3582bp33m/vz586F94v6CBQugfeL+woULoX3ifkhICLRP3F+0aBG0T9xfvHgxtE/cX7JkCbRP3F+6dCm0T9xftmwZtE/cDw0NhfaJ+2FhYdA+cT88PBzaJ+5HRERA+8T9yMhIaJ+4v3z5cmifuB8VFQXtE/dXrFgB7RP3V65cCe0T91etWgXtE/dXr14N7RP316xZA+0T99euXQvtE/ejo6OhfeL+unXroH3i/vr166F94v6GDRugfeL+xo0boX3i/qZNm6B94v7mzZuhfeL+li1boH3i/tatW6F94v62bdugfeL+9u3boX3i/o4dO6B94v7OnTuhfeL+rl27oH3i/u7du6F94v6ePXugfeJ+TEwMtE/c37t3L7RP3N+3bx+0T9zfv38/tE/cP3DgALRP3D948CC0T9w/dOgQtE/cj42NhfaJ+3FxcdA+cf/w4cPQPnH/yJEj0D5x/+jRo9A+cf/YsWPQPnH/+PHj0D5xPz4+Hton7ickJED7xP3ExERon7h/4sQJaJ+4f/LkSWifuH/q1Clon7h/+vRpaJ+4f+bMGWifuH/27Flon7h/7tw5aJ+4n5SUBO0T95OTk6F94n5KSgq0T9xPTU2F9on7aWlp0D5xPz09Hdon7mdkZED7xP3z589D+8T9CxcuQPvE/czMTGifuH/x4kVon7h/6dIlaJ+4f/nyZWifuH/lyhVon7h/9epVaJ+4f+3aNWifuH/9+nVon7h/48YNaJ+4n5WVBe0T97Ozs6F94n5OTg60T9y/efMmtE/cv3XrFrRP3L99+za0T9y/c+cOtE/cv3v3LrRP3L937x60T9y/f/8+tE/cz83NhfaJ+w8ePID2ift5eXnQPnE/Pz8f2ifuFxQUQPvE/YcPH0L7xP1Hjx5B+8T9x48fQ/vE/SdPnkD7xP2nT59C+8T9Z8+eQfvE/efPn0P7xP0XL15A+8T9ly9fQvvE/VevXkH7xP3Xr19D+8T9N2/eQPvE/bdv30L7xP13795B+8T99+/fQ/vE/Q8fPkD7xP2PHz9C+8T9T58+QfvE/c+fP0P7xP3CwkJon7j/5csXaJ+4//XrV2ifuP/t2zdon7j//ft3aJ+4/+PHD2ifuP/z509on7j/69cvaJ+4//v3b2ifuP/nzx9on7j/9+9faJ+4/+/fv/8AX9WFhvb2dsEAAAAASUVORK5CYII=',
    mimeType: 'image/png'
};

const extractLLMTestError = (error) => {
    if (!error) return 'LLM test failed';

    if (error.response) {
        if (typeof error.response.data === 'string') {
            return error.response.data;
        }
        if (error.response.data?.error) {
            return error.response.data.error;
        }
        if (error.response.data?.message) {
            return error.response.data.message;
        }
        if (error.response.statusText) {
            return `${error.response.status} ${error.response.statusText}`;
        }
    }

    if (error.message) {
        return error.message;
    }

    return 'LLM test failed';
};

const listUsers = async () => {
    const db = getDB();
    const query = `
        SELECT u.id, u.email, u.name, u.is_active, u.last_login, u.created_at,
               r.name as role,
               (u.local_password IS NOT NULL) AS has_local_password
        FROM users u
        JOIN roles r ON u.role_id = r.id
        ORDER BY u.created_at DESC
    `;

    const result = await db.query(query);
    return result.rows;
};

const getUser = async (req) => {
    const { userId } = req.params;
    const db = getDB();
    const query = `
        SELECT u.id, u.email, u.name, u.is_active, u.last_login, u.created_at,
               r.name as role,
               (u.local_password IS NOT NULL) AS has_local_password
        FROM users u
        JOIN roles r ON u.role_id = r.id
        WHERE u.id = $1
    `;
    const result = await db.query(query, [userId]);
    if (result.rows.length === 0) {
        throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }
    return result.rows[0];
};

const updateUser = async (req) => {
    const { userId } = req.params;
    const { name, is_active, password } = req.body;
    const db = getDB();

    if (userId === req.user.id) {
        throw new AppError('Modify your own profile via /api/users endpoints', 403, 'SELF_UPDATE_FORBIDDEN');
    }

    const updates = [];
    const values = [];
    let paramCount = 0;

    if (name) {
        paramCount++;
        updates.push(`name = $${paramCount}`);
        values.push(name);
    }

    if (typeof is_active === 'boolean') {
        const roleRes = await db.query(`
            SELECT r.name AS role
            FROM users u JOIN roles r ON u.role_id = r.id
            WHERE u.id = $1
        `, [userId]);
        if (roleRes.rows.length) {
            const roleName = roleRes.rows[0].role;
            if (roleName === 'admin' && is_active === false) {
                const adminCountRes = await db.query(`
                    SELECT COUNT(*)::int AS count
                    FROM users u JOIN roles r ON u.role_id = r.id
                    WHERE r.name = 'admin' AND u.is_active = true
                `);
                if (adminCountRes.rows[0].count <= 1) {
                    throw new AppError('Cannot disable the last active admin', 409, 'LAST_ADMIN');
                }
            }
        }
        paramCount++;
        updates.push(`is_active = $${paramCount}`);
        values.push(is_active);
    }

    if (password) {
        const hashed = await bcrypt.hash(password, 12);
        paramCount++;
        updates.push(`local_password = $${paramCount}`);
        values.push(hashed);
    }

    if (updates.length === 0) {
        throw new AppError('No valid fields to update', 400, 'NO_UPDATES');
    }

    paramCount++;
    values.push(userId);

    const query = `
        UPDATE users 
        SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramCount}
        RETURNING id, email, name, is_active, updated_at
    `;
    const result = await db.query(query, values);
    if (result.rows.length === 0) {
        throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    await createAuditLog(req.user.id, 'user_updated', 'user', userId, {
        updates: Object.keys(req.body),
        ip: req.ip,
        user_agent: req.get('User-Agent')
    });

    return result.rows[0];
};

const updateUserRole = async (req) => {
    const { userId } = req.params;
    const { role } = req.body;
    const db = getDB();

    if (userId === req.user.id) {
        throw new AppError('Cannot modify your own role', 403, 'SELF_ROLE_FORBIDDEN');
    }

    if (role === 'admin') {
        throw new AppError('Assigning admin role is not allowed', 403, 'ADMIN_ASSIGN_FORBIDDEN');
    }

    const targetRes = await db.query(`
        SELECT r.name AS role
        FROM users u JOIN roles r ON u.role_id = r.id
        WHERE u.id = $1
    `, [userId]);
    if (targetRes.rows.length === 0) {
        throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }
    if (targetRes.rows[0].role === 'admin' && role !== 'admin') {
        const adminCountRes = await db.query(`
            SELECT COUNT(*)::int AS count
            FROM users u JOIN roles r ON u.role_id = r.id
            WHERE r.name = 'admin' AND u.is_active = true
        `);
        if (adminCountRes.rows[0].count <= 1) {
            throw new AppError('Cannot demote the last active admin', 409, 'LAST_ADMIN');
        }
    }

    const roleRes = await db.query('SELECT id FROM roles WHERE name = $1', [role]);
    if (roleRes.rows.length === 0) {
        throw new AppError('Invalid role', 400, 'INVALID_ROLE');
    }

    const result = await db.query(
        `UPDATE users SET role_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 
         RETURNING id, email, name, is_active`,
        [roleRes.rows[0].id, userId]
    );
    if (result.rows.length === 0) {
        throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    await createAuditLog(req.user.id, 'user_role_updated', 'user', userId, {
        new_role: role,
        ip: req.ip,
        user_agent: req.get('User-Agent')
    });

    return result.rows[0];
};

const clearUserPassword = async (req) => {
    const { userId } = req.params;
    const db = getDB();

    if (userId === req.user.id) {
        throw new AppError('Modify your own password via /api/users/password', 403, 'SELF_PASSWORD_FORBIDDEN');
    }

    const roleCheck = await db.query(
        `SELECT r.name AS role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1`,
        [userId]
    );
    if (roleCheck.rows.length === 0) {
        throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    const result = await db.query(
        `UPDATE users SET local_password = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1 
         RETURNING id, email, name, is_active`,
        [userId]
    );
    if (result.rows.length === 0) {
        throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    await createAuditLog(req.user.id, 'user_password_cleared', 'user', userId, {
        ip: req.ip,
        user_agent: req.get('User-Agent')
    });

    return { message: 'Local password removed', user: result.rows[0] };
};

const deleteUser = async (req) => {
    const { userId } = req.params;
    const db = getDB();

    if (userId === req.user.id) {
        throw new AppError('Cannot delete your own account', 403, 'SELF_DELETE_FORBIDDEN');
    }

    const userRes = await db.query(`
        SELECT u.id, r.name AS role
        FROM users u JOIN roles r ON u.role_id = r.id
        WHERE u.id = $1
    `, [userId]);
    if (userRes.rows.length === 0) {
        throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    const roleName = userRes.rows[0].role;
    if (roleName === 'admin') {
        const adminCountRes = await db.query(`
            SELECT COUNT(*)::int AS count
            FROM users u JOIN roles r ON u.role_id = r.id
            WHERE r.name = 'admin' AND u.is_active = true
        `);
        if (adminCountRes.rows[0].count <= 1) {
            throw new AppError('Cannot delete the last active admin', 409, 'LAST_ADMIN');
        }
    }

    const reportCountRes = await db.query('SELECT COUNT(*)::int AS count FROM reports WHERE doctor_id = $1', [userId]);
    if (reportCountRes.rows[0].count > 0) {
        throw new AppError('User has associated reports', 409, 'USER_HAS_REPORTS');
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
        await client.query('UPDATE audit_logs SET user_id = NULL WHERE user_id = $1', [userId]);
        await client.query('UPDATE llm_configs SET created_by = NULL WHERE created_by = $1', [userId]);
        await client.query('UPDATE llm_configs SET updated_by = NULL WHERE updated_by = $1', [userId]);
        await client.query('UPDATE pacs_config SET updated_by = NULL WHERE updated_by = $1', [userId]);
        await client.query('UPDATE rag_config SET updated_by = NULL WHERE updated_by = $1', [userId]);
        await client.query('UPDATE system_settings SET updated_by = NULL WHERE updated_by = $1', [userId]);
        await client.query('DELETE FROM users WHERE id = $1', [userId]);
        await client.query('COMMIT');
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        throw error;
    } finally {
        client.release();
    }

    await createAuditLog(req.user.id, 'user_deleted', 'user', userId, {
        ip: req.ip,
        user_agent: req.get('User-Agent')
    });

    return { message: 'User deleted' };
};

const listLlmConfigs = async () => {
    const db = getDB();
    const query = `
        SELECT id, name, model_name, api_url, prompt, priority, enabled, max_tokens, temperature, top_p,
               (api_key IS NOT NULL) AS has_api_key,
               updated_at
        FROM llm_configs
        ORDER BY priority ASC
    `;

    const result = await db.query(query);
    return result.rows;
};

const createLlmConfig = async (req) => {
    const {
        name,
        model_name,
        api_url,
        api_key,
        prompt = null,
        priority = 100,
        enabled = true,
        max_tokens = 2000,
        temperature = 0.7,
        top_p = 1.0
    } = req.body;

    const db = getDB();
    const encryptedApiKey = encryptSecret(api_key);

    const query = `
        INSERT INTO llm_configs (name, model_name, api_url, api_key, prompt, priority, enabled, max_tokens, temperature, top_p, created_by, updated_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
        RETURNING id, name, model_name, api_url, prompt, priority, enabled, max_tokens, temperature, top_p,
                  (api_key IS NOT NULL) AS has_api_key,
                  created_at
    `;

    const result = await db.query(query, [
        name || null,
        model_name,
        api_url,
        encryptedApiKey,
        prompt,
        priority,
        enabled,
        max_tokens,
        temperature,
        top_p,
        req.user.id
    ]);

    await createAuditLog(req.user.id, 'llm_config_created', 'llm_config', result.rows[0].id, {
        model_name,
        ip: req.ip,
        user_agent: req.get('User-Agent')
    });

    let testResult = null;
    if (api_key && enabled) {
        try {
            const start = Date.now();
            await callLLM({ ...result.rows[0], api_key }, {
                studyDescription: 'Health check',
                modality: 'GEN',
                clinicalContext: 'Ping',
                previousContent: '',
                dicom: {
                    imageBase64: LLM_TEST_PLACEHOLDER_IMAGE.base64,
                    imageMimeType: LLM_TEST_PLACEHOLDER_IMAGE.mimeType,
                    studyInstanceUID: 'LLM-CONFIG-AUTOTEST'
                }
            });
            const latency = Date.now() - start;
            testResult = { healthy: true, latency_ms: latency };
        } catch (testError) {
            logger.warn('Auto-test failed for new LLM config:', testError?.response?.data || testError.message || testError);
            testResult = { healthy: false, error: 'Auto-test failed' };
        }
    }

    const response = { ...result.rows[0] };
    if (testResult) {
        response.test_result = testResult;
    }

    return response;
};

const updateLlmConfig = async (req) => {
    const { configId } = req.params;
    const db = getDB();

    const updates = [];
    const values = [];
    let paramCount = 0;

    const allowedFields = ['name', 'model_name', 'api_url', 'api_key', 'prompt', 'priority', 'enabled', 'max_tokens', 'temperature', 'top_p'];

    for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
            paramCount++;
            updates.push(`${field} = $${paramCount}`);
            if (field === 'api_key') {
                values.push(encryptSecret(req.body[field]));
            } else {
                values.push(req.body[field]);
            }
        }
    }

    if (updates.length === 0) {
        throw new AppError('No valid fields to update', 400, 'NO_UPDATES');
    }

    paramCount++;
    updates.push(`updated_by = $${paramCount}`);
    values.push(req.user.id);

    paramCount++;
    values.push(configId);

    const query = `
        UPDATE llm_configs 
        SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramCount}
        RETURNING id, name, model_name, api_url, priority, enabled, max_tokens, temperature, top_p,
                  (api_key IS NOT NULL) AS has_api_key,
                  updated_at
    `;

    const result = await db.query(query, values);
    if (result.rows.length === 0) {
        throw new AppError('LLM configuration not found', 404, 'LLM_NOT_FOUND');
    }

    await createAuditLog(req.user.id, 'llm_config_updated', 'llm_config', configId, {
        updates: Object.keys(req.body),
        ip: req.ip,
        user_agent: req.get('User-Agent')
    });

    return result.rows[0];
};

const listLlmModels = async (req) => {
    const { provider, api_key, endpoint } = req.body || {};
    const axios = require('axios');

    if (!provider) {
        throw new AppError('provider is required', 400, 'PROVIDER_REQUIRED');
    }

    let actualApiKey = api_key;
    if (api_key === 'USE_STORED_KEY') {
        const db = getDB();
        const query = 'SELECT api_key FROM llm_configs WHERE enabled = true AND api_key IS NOT NULL ORDER BY priority ASC LIMIT 1';
        const result = await db.query(query);
        if (result.rows.length === 0) {
            throw new AppError('No stored API key found. Please configure an LLM first.', 400, 'NO_STORED_KEY');
        }
        actualApiKey = decryptSecret(result.rows[0].api_key);
    }

    let url = '';
    const headers = {};

    if (provider === 'gpt') {
        url = 'https://api.openai.com/v1/models';
        if (actualApiKey) headers['Authorization'] = `Bearer ${actualApiKey}`;
    } else if (provider === 'gemini') {
        url = 'https://generativelanguage.googleapis.com/v1beta/models';
        if (actualApiKey) headers['x-goog-api-key'] = actualApiKey;
    } else if (provider === 'anthropic') {
        url = 'https://api.anthropic.com/v1/models';
        if (actualApiKey) headers['x-api-key'] = actualApiKey;
    } else if (provider === 'openrouter') {
        url = 'https://openrouter.ai/api/v1/models';
        if (actualApiKey) headers['Authorization'] = `Bearer ${actualApiKey}`;
    } else if (provider === 'ollama') {
        const base = (endpoint || '').trim();
        if (!base) {
            throw new AppError('Ollama endpoint is required', 400, 'ENDPOINT_REQUIRED');
        }
        url = base.includes('/api/')
            ? base
            : `${base.replace(/\/+$/, '')}/api/tags`;
    } else if (provider === 'custom' || provider === 'other') {
        const base = (endpoint || '').trim();
        if (!base) {
            throw new AppError('Custom endpoint is required', 400, 'ENDPOINT_REQUIRED');
        }
        if (base.endsWith('/v1') || base.endsWith('/v1/')) {
            url = `${base.replace(/\/+$/, '')}/models`;
        } else if (base.includes('/models')) {
            url = base;
        } else {
            url = `${base.replace(/\/+$/, '')}/models`;
        }
        if (actualApiKey) headers['Authorization'] = `Bearer ${actualApiKey}`;
    } else {
        throw new AppError('Unknown provider', 400, 'UNKNOWN_PROVIDER');
    }

    const response = await axios.get(url, { headers, timeout: 10000 });
    return response.data;
};

const deleteLlmConfig = async (req) => {
    const { configId } = req.params;
    const db = getDB();
    const exists = await db.query('SELECT id FROM llm_configs WHERE id = $1', [configId]);
    if (exists.rows.length === 0) {
        throw new AppError('LLM configuration not found', 404, 'LLM_NOT_FOUND');
    }
    await db.query('DELETE FROM llm_configs WHERE id = $1', [configId]);

    await createAuditLog(req.user.id, 'llm_config_deleted', 'llm_config', configId, {
        ip: req.ip,
        user_agent: req.get('User-Agent')
    });

    return { message: 'LLM configuration deleted' };
};

const getSystemSettings = async () => {
    const db = getDB();
    const result = await db.query('SELECT system_name, max_concurrent_tasks, backup_frequency, updated_at FROM system_settings LIMIT 1');
    return result.rows[0] || null;
};

const updateSystemSettings = async (req) => {
    const { system_name, max_concurrent_tasks, backup_frequency } = req.body;
    const db = getDB();

    const updates = [];
    const values = [];
    let paramCount = 0;

    if (system_name !== undefined) {
        paramCount++;
        updates.push(`system_name = $${paramCount}`);
        values.push(system_name);
    }

    if (max_concurrent_tasks !== undefined) {
        paramCount++;
        updates.push(`max_concurrent_tasks = $${paramCount}`);
        values.push(max_concurrent_tasks);
    }

    if (backup_frequency !== undefined) {
        paramCount++;
        updates.push(`backup_frequency = $${paramCount}`);
        values.push(backup_frequency);
    }

    if (updates.length === 0) {
        throw new AppError('No valid fields to update', 400, 'NO_UPDATES');
    }

    const setClause = updates.join(', ');
    const result = await db.query(
        `UPDATE system_settings SET ${setClause} WHERE id = 1 RETURNING system_name, max_concurrent_tasks, backup_frequency, updated_at`,
        values
    );

    await createAuditLog(req.user.id, 'system_settings_updated', 'system_settings', null, {
        system_name,
        max_concurrent_tasks,
        backup_frequency,
        ip: req.ip,
        user_agent: req.get('User-Agent')
    });

    return result.rows[0];
};

const getPacsConfig = async () => {
    const db = getDB();
    const query = 'SELECT id, pacs_url, auth_type, connection_timeout, query_timeout, updated_at FROM pacs_config LIMIT 1';
    const result = await db.query(query);
    return result.rows[0] || null;
};

const updatePacsConfig = async (req) => {
    const {
        pacs_url,
        auth_type,
        credentials,
        connection_timeout = 30,
        query_timeout = 60
    } = req.body;

    const db = getDB();

    await db.query('DELETE FROM pacs_config');

    const query = `
        INSERT INTO pacs_config (pacs_url, auth_type, credentials, connection_timeout, query_timeout, updated_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, pacs_url, auth_type, connection_timeout, query_timeout, updated_at
    `;

    const result = await db.query(query, [
        pacs_url, auth_type, encryptSecret(JSON.stringify(credentials)), connection_timeout, query_timeout, req.user.id
    ]);

    await createAuditLog(req.user.id, 'pacs_config_updated', 'pacs_config', result.rows[0].id, {
        pacs_url,
        auth_type,
        ip: req.ip,
        user_agent: req.get('User-Agent')
    });

    return result.rows[0];
};

const getStatistics = async (req) => {
    const db = getDB();

    const [
        usersByRoleRes,
        totalReportsRes,
        finalizedReportsRes,
        recentActivityRes,
        userStatusRes,
        llmBreakdownRes,
        systemSettingsRes
    ] = await Promise.all([
        db.query(`
            SELECT r.name as role, COUNT(u.id) as count
            FROM roles r
            LEFT JOIN users u ON r.id = u.role_id AND u.is_active = true
            GROUP BY r.id, r.name
            ORDER BY r.name
        `),
        db.query('SELECT COUNT(*)::int as total_reports FROM reports'),
        db.query('SELECT COUNT(*)::int as finalized_reports FROM reports WHERE finalized_at IS NOT NULL'),
        db.query(`
            SELECT a.id, a.action, a.timestamp, u.name AS user_name
            FROM audit_logs a
            LEFT JOIN users u ON a.user_id = u.id
            ORDER BY a.timestamp DESC
            LIMIT 10
        `),
        db.query(`
            SELECT
                COUNT(*)::int AS total_users,
                COUNT(*) FILTER (WHERE is_active = true)::int AS active_users,
                COUNT(*) FILTER (WHERE is_active = false)::int AS inactive_users
            FROM users
        `),
        db.query(`
            SELECT
                COUNT(*)::int AS total_llms,
                COUNT(*) FILTER (WHERE enabled = true)::int AS enabled_llms,
                COUNT(*) FILTER (WHERE enabled = false)::int AS disabled_llms
            FROM llm_configs
        `),
        db.query('SELECT system_name, max_concurrent_tasks, backup_frequency FROM system_settings LIMIT 1')
    ]);

    let pacsHealthy = false;
    try {
        const cfg = await db.query('SELECT pacs_url, auth_type, credentials, query_timeout FROM pacs_config LIMIT 1');
        if (cfg.rows.length > 0 && cfg.rows[0].pacs_url) {
            const { pacs_url, auth_type, credentials, query_timeout } = cfg.rows[0];
            const decrypted = decryptSecret(credentials);
            const parsedCredentials = decrypted ? JSON.parse(decrypted) : null;
            const base = String(pacs_url || '').replace(/\/*$/,'');
            const studiesUrl = /\/studies$/i.test(base) ? base : `${base}/studies`;
            const headers = { Accept: 'application/dicom+json' };
            if (auth_type === 'basic' && parsedCredentials?.username) {
                const token = Buffer.from(`${parsedCredentials.username}:${parsedCredentials.password || ''}`).toString('base64');
                headers['Authorization'] = `Basic ${token}`;
            } else if (auth_type === 'token' && parsedCredentials?.token) {
                headers['Authorization'] = `Bearer ${parsedCredentials.token}`;
            }
            const axios = require('axios');
            const resp = await axios.get(studiesUrl, {
                params: { limit: 1, offset: 0 },
                headers,
                timeout: Math.min(10000, Math.max(2000, (query_timeout || 10) * 1000))
            });
            pacsHealthy = resp.status >= 200 && resp.status < 300;
        }
    } catch (e) {
        pacsHealthy = false;
    }

    const toNumber = (value) => Number(value) || 0;
    const totalReports = toNumber(totalReportsRes.rows[0]?.total_reports);
    const finalizedReports = toNumber(finalizedReportsRes.rows[0]?.finalized_reports);
    const draftReports = Math.max(0, totalReports - finalizedReports);
    const userCountsRow = userStatusRes.rows[0] || {};
    const llmCountsRow = llmBreakdownRes.rows[0] || {};

    return {
        users_by_role: usersByRoleRes.rows,
        total_reports: totalReports,
        finalized_reports: finalizedReports,
        draft_reports: draftReports,
        llm_count: toNumber(llmCountsRow.enabled_llms),
        user_counts: {
            total: toNumber(userCountsRow.total_users),
            active: toNumber(userCountsRow.active_users),
            inactive: toNumber(userCountsRow.inactive_users)
        },
        llm_counts: {
            total: toNumber(llmCountsRow.total_llms),
            enabled: toNumber(llmCountsRow.enabled_llms),
            disabled: toNumber(llmCountsRow.disabled_llms)
        },
        system_settings: systemSettingsRes.rows[0] || null,
        pacs_healthy: pacsHealthy,
        recent_activity: recentActivityRes.rows
    };
};

const testLlmConfig = async (req) => {
    const { configId } = req.params;
    const db = getDB();
    const cfgRes = await db.query('SELECT * FROM llm_configs WHERE id = $1', [configId]);
    if (cfgRes.rows.length === 0) {
        throw new AppError('LLM configuration not found', 404, 'LLM_NOT_FOUND');
    }

    const cfg = { ...cfgRes.rows[0], api_key: decryptSecret(cfgRes.rows[0].api_key) };

    const start = Date.now();
    await callLLM(cfg, {
        studyDescription: 'Health check',
        modality: 'GEN',
        clinicalContext: 'Ping',
        previousContent: '',
        dicom: {
            imageBase64: LLM_TEST_PLACEHOLDER_IMAGE.base64,
            imageMimeType: LLM_TEST_PLACEHOLDER_IMAGE.mimeType,
            studyInstanceUID: 'LLM-CONFIG-TEST'
        }
    });
    const latency = Date.now() - start;

    return { healthy: true, latency_ms: latency, model_name: cfg.model_name };
};

module.exports = {
    listUsers,
    getUser,
    updateUser,
    updateUserRole,
    clearUserPassword,
    deleteUser,
    listLlmConfigs,
    createLlmConfig,
    updateLlmConfig,
    listLlmModels,
    deleteLlmConfig,
    getSystemSettings,
    updateSystemSettings,
    getPacsConfig,
    updatePacsConfig,
    getStatistics,
    testLlmConfig,
    extractLLMTestError
};
