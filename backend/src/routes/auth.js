const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const { getDB } = require('../database/connection');
const { getRedis } = require('../database/redis');
const { logger } = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');
const { validateRequest, schemas } = require('../middleware/validation');
const { createAuditLog } = require('../utils/audit');

const router = express.Router();

const parseBoolean = (value, defaultValue = false) => {
    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }
    const normalized = String(value).trim().toLowerCase();
    return ['true', '1', 'yes', 'on'].includes(normalized);
};

const resolveAuthCookieOptions = () => {
    const protocol = (process.env.PUBLIC_PROTOCOL || '').toLowerCase();
    const defaultSecure = protocol === 'https';
    let secure = parseBoolean(process.env.AUTH_COOKIE_SECURE, defaultSecure);

    let sameSite = (process.env.AUTH_COOKIE_SAMESITE || 'lax').toLowerCase();
    const validSameSites = ['lax', 'strict', 'none'];
    if (!validSameSites.includes(sameSite)) {
        logger.warn(`Invalid AUTH_COOKIE_SAMESITE value "${process.env.AUTH_COOKIE_SAMESITE}"; defaulting to "lax".`);
        sameSite = 'lax';
    }
    if (sameSite === 'none' && !secure) {
        secure = true;
        logger.warn('AUTH_COOKIE_SAMESITE set to "none" but AUTH_COOKIE_SECURE disabled. Forcing secure cookies to satisfy browser requirements.');
    }

    const domain = process.env.AUTH_COOKIE_DOMAIN || undefined;
    const maxAgeSource = process.env.AUTH_COOKIE_MAX_AGE;
    const maxAgeParsed = Number(maxAgeSource);
    const maxAge = Number.isFinite(maxAgeParsed) && maxAgeParsed > 0 ? maxAgeParsed : 30 * 60 * 1000; // 30 minutes

    return {
        httpOnly: true,
        secure,
        sameSite,
        domain,
        path: '/',
        maxAge
    };
};

const baseAuthCookieOptions = resolveAuthCookieOptions();
const getAuthCookieOptions = () => ({ ...baseAuthCookieOptions });
const getClearAuthCookieOptions = () => ({ ...baseAuthCookieOptions, expires: new Date(0), maxAge: 0 });

// Local login
router.post('/login', validateRequest(schemas.login), async (req, res) => {
    try {
        const { email, password } = req.body;
        const db = getDB();

        // Local password login enabled in development (system_flags removed).

        // Find user
        const userQuery = `
            SELECT u.id, u.email, u.name, u.local_password, u.is_active, r.name as role
            FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE u.email = $1
        `;
        
        const result = await db.query(userQuery, [email]);
        
        if (result.rows.length === 0) {
            await createAuditLog(null, 'login_failed', 'user', null, { 
                email, 
                reason: 'user_not_found',
                ip: req.ip,
                user_agent: req.get('User-Agent')
            });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        if (!user.is_active) {
            await createAuditLog(user.id, 'login_failed', 'user', user.id, { 
                reason: 'account_inactive',
                ip: req.ip,
                user_agent: req.get('User-Agent')
            });
            return res.status(401).json({ error: 'Account is inactive' });
        }

        if (!user.local_password) {
            await createAuditLog(user.id, 'login_failed', 'user', user.id, { 
                reason: 'no_local_password',
                ip: req.ip,
                user_agent: req.get('User-Agent')
            });
            return res.status(401).json({ error: 'Please use SSO login' });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.local_password);
        
        if (!isValidPassword) {
            await createAuditLog(user.id, 'login_failed', 'user', user.id, { 
                reason: 'invalid_password',
                ip: req.ip,
                user_agent: req.get('User-Agent')
            });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '30m' }
        );

        // Update last login
        await db.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

        // Create session record
        const sessionId = uuidv4();
        await db.query(`
            INSERT INTO sessions (id, user_id, token, expires_at, ip_address, user_agent)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            sessionId,
            user.id,
            token,
            new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
            req.ip,
            req.get('User-Agent')
        ]);

        await createAuditLog(user.id, 'login_success', 'user', user.id, {
            method: 'local',
            ip: req.ip,
            user_agent: req.get('User-Agent')
        });

        // Set httpOnly cookie for security
        const cookieOptions = getAuthCookieOptions();
        res.cookie('auth_token', token, cookieOptions);

        res.json({
            token,
            expires_in: cookieOptions.maxAge,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role
            }
        });
    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// SSO callback (Keycloak)
router.post('/sso/callback', async (req, res) => {
    try {
        const { access_token } = req.body;
        
        if (!access_token) {
            return res.status(400).json({ error: 'Access token required' });
        }

        // Verify token with Keycloak
        const keycloakUrl = process.env.KEYCLOAK_INTERNAL_URL || process.env.KEYCLOAK_URL;
        if (!keycloakUrl) {
            logger.error('SSO callback missing Keycloak URL configuration');
            return res.status(500).json({ error: 'SSO misconfigured' });
        }
        const realm = process.env.KEYCLOAK_REALM;
        
        const userInfoResponse = await axios.get(
            `${keycloakUrl}/realms/${realm}/protocol/openid-connect/userinfo`,
            {
                headers: {
                    'Authorization': `Bearer ${access_token}`
                }
            }
        );

        const userInfo = userInfoResponse.data;
        const db = getDB();

        // Find or create user using stable Keycloak subject to prevent duplicates on email change
        const kcSub = userInfo.sub;
        const desiredName = userInfo.name || userInfo.preferred_username;
        const desiredEmail = userInfo.email;

        let user;

        // 1) Try by keycloak_user_id
        const bySub = await db.query(`
            SELECT u.id, u.email, u.name, u.is_active, u.keycloak_user_id, r.name as role
            FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE u.keycloak_user_id = $1
        `, [kcSub]);

        if (bySub.rows.length > 0) {
            user = bySub.rows[0];
        } else {
            // 2) Legacy link by email, then backfill keycloak_user_id
            const byEmail = await db.query(`
                SELECT u.id, u.email, u.name, u.is_active, u.keycloak_user_id, r.name as role
                FROM users u
                JOIN roles r ON u.role_id = r.id
                WHERE u.email = $1
            `, [desiredEmail]);

            if (byEmail.rows.length > 0) {
                user = byEmail.rows[0];
                try {
                    await db.query(
                        'UPDATE users SET keycloak_user_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND keycloak_user_id IS NULL',
                        [kcSub, user.id]
                    );
                } catch (e) {
                    logger.warn('Backfilling keycloak_user_id failed:', e.message || e);
                }
            } else {
                // 3) Create new user: first-ever admin if none exists, else observer
                const adminCountRes = await db.query(`
                    SELECT COUNT(*)::int AS count
                    FROM users u
                    JOIN roles r ON u.role_id = r.id
                    WHERE r.name = 'admin'
                `);
                const defaultRoleName = adminCountRes.rows[0].count === 0 ? 'admin' : 'observer';

                const roleQuery = 'SELECT id FROM roles WHERE name = $1';
                const roleResult = await db.query(roleQuery, [defaultRoleName]);
                if (roleResult.rows.length === 0) {
                    throw new Error('Default role not found');
                }

                const insertResult = await db.query(
                    `INSERT INTO users (email, name, role_id, is_active, keycloak_user_id)
                     VALUES ($1, $2, $3, true, $4)
                     RETURNING id`,
                    [desiredEmail, desiredName, roleResult.rows[0].id, kcSub]
                );

                user = {
                    id: insertResult.rows[0].id,
                    email: desiredEmail,
                    name: desiredName,
                    role: defaultRoleName,
                    is_active: true
                };

                await createAuditLog(user.id, 'user_created_sso', 'user', user.id, {
                    email: user.email,
                    ip: req.ip,
                    user_agent: req.get('User-Agent')
                });
            }
        }

        // Sync mutable fields from Keycloak
        try {
            if (user && (desiredName !== user.name || desiredEmail !== user.email)) {
                await db.query(
                    'UPDATE users SET name = $1, email = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
                    [desiredName, desiredEmail, user.id]
                );
                user.name = desiredName;
                user.email = desiredEmail;
            }
        } catch (e) {
            logger.warn('SSO sync (name/email) failed:', e.message || e);
        }

        if (user && !user.is_active) {
            await createAuditLog(user.id, 'login_failed', 'user', user.id, { 
                reason: 'account_inactive',
                method: 'sso',
                ip: req.ip,
                user_agent: req.get('User-Agent')
            });
            return res.status(401).json({ error: 'Account is inactive' });
        }

        // Generate internal JWT token
        const token = jwt.sign(
            { userId: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '30m' }
        );

        // Update last login
        await db.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

        // Create session record
        const sessionId = uuidv4();
        await db.query(`
            INSERT INTO sessions (id, user_id, token, expires_at, ip_address, user_agent)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            sessionId,
            user.id,
            token,
            new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
            req.ip,
            req.get('User-Agent')
        ]);

        await createAuditLog(user.id, 'login_success', 'user', user.id, {
            method: 'sso',
            ip: req.ip,
            user_agent: req.get('User-Agent')
        });

        // Set httpOnly cookie for security
        const cookieOptions = getAuthCookieOptions();
        res.cookie('auth_token', token, cookieOptions);

        res.json({
            token,
            expires_in: cookieOptions.maxAge,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role
            }
        });
    } catch (error) {
        logger.error('SSO callback error:', error);
        res.status(500).json({ error: 'SSO authentication failed' });
    }
});

// SSO redirect handler (Keycloak Authorization Code → Internal token)
// This endpoint is used as the redirect_uri during the Keycloak auth request.
// It exchanges the authorization code for tokens, verifies userinfo, and
// redirects back to the frontend with the app's internal JWT token.
router.get('/sso/redirect', async (req, res) => {
    try {
        const { code, state } = req.query;
        if (!code) {
            return res.redirect(`${process.env.CORS_ORIGIN || 'http://localhost:3001'}/login?error=missing_code`);
        }

        const keycloakUrl = process.env.KEYCLOAK_INTERNAL_URL || process.env.KEYCLOAK_URL;
        if (!keycloakUrl) {
            logger.error('SSO redirect missing Keycloak URL configuration');
            return res.redirect(`${process.env.CORS_ORIGIN || 'http://localhost:3001'}/login?error=sso_config`);
        }
        const realm = process.env.KEYCLOAK_REALM;
        const clientId = process.env.KEYCLOAK_CLIENT_ID;
        const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET; // Optional

        const tokenEndpoint = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/token`;

        // Compute redirect_uri to match exactly what was sent during the auth request
        const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/sso/redirect`;

        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('redirect_uri', redirectUri);
        params.append('client_id', clientId);

        // Prepare headers; use HTTP Basic if client secret is configured
        const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
        if (clientSecret) {
            const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
            headers['Authorization'] = `Basic ${basic}`;
        }

        // Exchange code for tokens
        const tokenResponse = await axios.post(tokenEndpoint, params.toString(), { headers });

        const { access_token: accessToken } = tokenResponse.data || {};

        if (!accessToken) {
            return res.redirect(`${process.env.CORS_ORIGIN || 'http://localhost:3001'}/login?error=missing_access_token`);
        }

        // Verify token and fetch user info from Keycloak
        const userInfoResponse = await axios.get(
            `${keycloakUrl}/realms/${realm}/protocol/openid-connect/userinfo`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );

        const userInfo = userInfoResponse.data;
        const db = getDB();

        const kcSub = userInfo.sub;
        const desiredName = userInfo.name || userInfo.preferred_username;
        const desiredEmail = userInfo.email;

        let user;

        // 1) Try by keycloak_user_id
        const bySub = await db.query(`
            SELECT u.id, u.email, u.name, u.is_active, u.keycloak_user_id, r.name as role
            FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE u.keycloak_user_id = $1
        `, [kcSub]);

        if (bySub.rows.length > 0) {
            user = bySub.rows[0];
        } else {
            // 2) Legacy link by email, then backfill keycloak_user_id
            const byEmail = await db.query(`
                SELECT u.id, u.email, u.name, u.is_active, u.keycloak_user_id, r.name as role
                FROM users u
                JOIN roles r ON u.role_id = r.id
                WHERE u.email = $1
            `, [desiredEmail]);

            if (byEmail.rows.length > 0) {
                user = byEmail.rows[0];
                try {
                    await db.query(
                        'UPDATE users SET keycloak_user_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND keycloak_user_id IS NULL',
                        [kcSub, user.id]
                    );
                } catch (e) {
                    logger.warn('Backfilling keycloak_user_id failed:', e.message || e);
                }
            } else {
                // 3) Create new user: first-ever admin if none exists, else observer
                const adminCountRes = await db.query(`
                    SELECT COUNT(*)::int AS count
                    FROM users u
                    JOIN roles r ON u.role_id = r.id
                    WHERE r.name = 'admin'
                `);
                const defaultRoleName = adminCountRes.rows[0].count === 0 ? 'admin' : 'observer';
                const roleQuery = 'SELECT id FROM roles WHERE name = $1';
                const roleResult = await db.query(roleQuery, [defaultRoleName]);
                if (roleResult.rows.length === 0) {
                    throw new Error('Default role not found');
                }

                const insertResult = await db.query(
                    `INSERT INTO users (email, name, role_id, is_active, keycloak_user_id)
                     VALUES ($1, $2, $3, true, $4)
                     RETURNING id`,
                    [desiredEmail, desiredName, roleResult.rows[0].id, kcSub]
                );

                user = {
                    id: insertResult.rows[0].id,
                    email: desiredEmail,
                    name: desiredName,
                    role: defaultRoleName,
                    is_active: true
                };

                await createAuditLog(user.id, 'user_created_sso', 'user', user.id, {
                    email: user.email,
                    ip: req.ip,
                    user_agent: req.get('User-Agent')
                });
            }
        }

        // Sync mutable fields from Keycloak
        try {
            if (user && (desiredName !== user.name || desiredEmail !== user.email)) {
                await db.query(
                    'UPDATE users SET name = $1, email = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
                    [desiredName, desiredEmail, user.id]
                );
                user.name = desiredName;
                user.email = desiredEmail;
            }
        } catch (e) {
            logger.warn('SSO sync (name/email) failed:', e.message || e);
        }

        if (user && !user.is_active) {
            await createAuditLog(user.id, 'login_failed', 'user', user.id, {
                reason: 'account_inactive',
                method: 'sso',
                ip: req.ip,
                user_agent: req.get('User-Agent')
            });
            return res.redirect(`${process.env.CORS_ORIGIN || 'http://localhost:3001'}/login?error=account_inactive`);
        }

        // Generate internal JWT token
        const token = jwt.sign(
            { userId: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '30m' }
        );

        // Update last login
        await db.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

        // Create session record
        const sessionId = uuidv4();
        await db.query(`
            INSERT INTO sessions (id, user_id, token, expires_at, ip_address, user_agent)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            sessionId,
            user.id,
            token,
            new Date(Date.now() + 30 * 60 * 1000),
            req.ip,
            req.get('User-Agent')
        ]);

        await createAuditLog(user.id, 'login_success', 'user', user.id, {
            method: 'sso',
            ip: req.ip,
            user_agent: req.get('User-Agent')
        });

        const appUrl = process.env.CORS_ORIGIN || 'http://localhost:3001';
        const cookieOptions = getAuthCookieOptions();
        res.cookie('auth_token', token, cookieOptions);

        // Redirect back to frontend - include lightweight session token for SPA authorization header fallback
        const redirectUrl = new URL(`${appUrl}/login`);
        redirectUrl.searchParams.set('sso_success', 'true');
        redirectUrl.searchParams.set('session_token', token);
        redirectUrl.searchParams.set('expires_in', String(cookieOptions.maxAge || (30 * 60 * 1000)));

        return res.redirect(302, redirectUrl.toString());
    } catch (error) {
        logger.error('SSO redirect error:', error?.response?.data || error.message || error);
        const appUrl = process.env.CORS_ORIGIN || 'http://localhost:3001';
        return res.redirect(`${appUrl}/login?error=sso_failed`);
    }
});

// Logout
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        const token = req.authToken;
        const redis = getRedis();
        const db = getDB();

        if (token) {
            // Add token to blacklist
            await redis.setEx(`blacklist:${token}`, 1800, 'revoked'); // 30 minutes

            // Delete session from database
            await db.query('DELETE FROM sessions WHERE token = $1', [token]);
        }

        await createAuditLog(req.user.id, 'logout', 'user', req.user.id, {
            ip: req.ip,
            user_agent: req.get('User-Agent')
        });

        // Clear the auth cookie
        res.clearCookie('auth_token', getClearAuthCookieOptions());

        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        logger.error('Logout error:', error);
        res.status(500).json({ error: 'Logout failed' });
    }
});

// Refresh token
router.post('/refresh', authenticateToken, async (req, res) => {
    try {
        const user = req.user;
        
        // Generate new token
        const newToken = jwt.sign(
            { userId: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '30m' }
        );

        // Update session
        const oldToken = req.authToken;
        const db = getDB();
        if (oldToken) {
            await db.query(`
                UPDATE sessions 
                SET token = $1, expires_at = $2 
                WHERE token = $3
            `, [
                newToken,
                new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
                oldToken
            ]);

            // Blacklist old token
            const redis = getRedis();
            await redis.setEx(`blacklist:${oldToken}`, 1800, 'revoked');
        } else {
            logger.warn('Token refresh requested without prior auth token context');
        }

        // Set new httpOnly cookie
        const cookieOptions = getAuthCookieOptions();
        res.cookie('auth_token', newToken, cookieOptions);

        res.json({
            token: newToken,
            expires_in: cookieOptions.maxAge,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role
            }
        });
    } catch (error) {
        logger.error('Token refresh error:', error);
        res.status(500).json({ error: 'Token refresh failed' });
    }
});

// Get current user info
router.get('/me', authenticateToken, (req, res) => {
    res.json({
        user: {
            id: req.user.id,
            email: req.user.email,
            name: req.user.name,
            role: req.user.role
        }
    });
});

module.exports = router;
