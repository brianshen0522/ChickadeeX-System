const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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

// Hardcoded user accounts - easy to edit
const HARDCODED_USERS = {
    'admin': {
        password: 'admin123',
        name: 'System Administrator',
        role: 'admin',
        email: 'admin@chickadeex.com'
    },
    'test': {
        password: 'test123',
        name: 'Test User',
        role: 'observer',
        email: 'test@chickadeex.com'
    }
};

// Local login
router.post('/login', validateRequest(schemas.login), async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const loginInput = username || email; // Support both username and email fields
        const db = getDB();

        // Check hardcoded users first (by username)
        const hardcodedUser = HARDCODED_USERS[loginInput];
        if (hardcodedUser && hardcodedUser.password === password) {
            // Create or get user from database
            const roleQuery = 'SELECT id FROM roles WHERE name = $1';
            const roleResult = await db.query(roleQuery, [hardcodedUser.role]);

            if (roleResult.rows.length === 0) {
                return res.status(500).json({ error: 'Role not found' });
            }

            // Check if user exists in database (by email)
            let userRecord = await db.query(`
                SELECT u.id, u.email, u.name, u.is_active, r.name as role
                FROM users u
                JOIN roles r ON u.role_id = r.id
                WHERE u.email = $1
            `, [hardcodedUser.email]);

            let user;
            if (userRecord.rows.length === 0) {
                // Create new user
                const insertResult = await db.query(`
                    INSERT INTO users (email, name, role_id, is_active, local_password)
                    VALUES ($1, $2, $3, true, $4)
                    RETURNING id
                `, [hardcodedUser.email, hardcodedUser.name, roleResult.rows[0].id, await bcrypt.hash(hardcodedUser.password, 10)]);

                user = {
                    id: insertResult.rows[0].id,
                    email: hardcodedUser.email,
                    name: hardcodedUser.name,
                    role: hardcodedUser.role,
                    is_active: true
                };
            } else {
                user = userRecord.rows[0];
            }

            if (!user.is_active) {
                await createAuditLog(user.id, 'login_failed', 'user', user.id, {
                    reason: 'account_inactive',
                    ip: req.ip,
                    user_agent: req.get('User-Agent')
                });
                return res.status(401).json({ error: 'Account is inactive' });
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
                method: 'hardcoded',
                ip: req.ip,
                user_agent: req.get('User-Agent')
            });

            // Set httpOnly cookie for security
            const cookieOptions = getAuthCookieOptions();
            res.cookie('auth_token', token, cookieOptions);

            return res.json({
                token,
                expires_in: cookieOptions.maxAge,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role
                }
            });
        }

        // Fallback to database users for existing users with local passwords
        const userQuery = `
            SELECT u.id, u.email, u.name, u.local_password, u.is_active, r.name as role
            FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE u.email = $1
        `;

        const result = await db.query(userQuery, [loginInput]);

        if (result.rows.length === 0) {
            await createAuditLog(null, 'login_failed', 'user', null, {
                loginInput,
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
            return res.status(401).json({ error: 'Invalid credentials' });
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
