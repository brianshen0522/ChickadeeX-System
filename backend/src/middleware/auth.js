const jwt = require('jsonwebtoken');
const { getDB } = require('../database/connection');
const { getRedis } = require('../database/redis');
const { logger } = require('../utils/logger');

// Check for token in httpOnly cookie first, then fallback to Authorization header
const extractToken = (req) => {
    if (req.cookies?.auth_token) {
        return req.cookies.auth_token;
    }
    const authHeader = req.headers['authorization'];
    return authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
};

// Access tokens live 30 minutes, so the marker only has to outlast them
const USER_REVOCATION_TTL_SECONDS = 1800;

// Ends every token issued to a user before now, e.g. after a credential change
const revokeUserTokens = async (userId) => {
    await getRedis().setEx(
        `revoked_before:${userId}`,
        USER_REVOCATION_TTL_SECONDS,
        String(Math.floor(Date.now() / 1000))
    );
};

const authenticateToken = async (req, res, next) => {
    try {
        const token = extractToken(req);

        if (!token) {
            return res.status(401).json({ error: 'Access token required' });
        }

        // Check if token is in Redis blacklist
        const redis = getRedis();
        const isBlacklisted = await redis.get(`blacklist:${token}`);
        if (isBlacklisted) {
            return res.status(401).json({ error: 'Token has been revoked' });
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

        const revokedBefore = await redis.get(`revoked_before:${decoded.userId}`);
        if (revokedBefore && decoded.iat < Number(revokedBefore)) {
            return res.status(401).json({ error: 'Token has been revoked' });
        }

        // Get user from database
        const db = getDB();
        const userQuery = `
            SELECT u.id, u.email, u.name, u.is_active, r.name as role
            FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE u.id = $1 AND u.is_active = true
        `;
        
        const result = await db.query(userQuery, [decoded.userId]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'User not found or inactive' });
        }

        req.user = result.rows[0];
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token' });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        
        logger.error('Authentication error:', error);
        return res.status(500).json({ error: 'Authentication failed' });
    }
};

const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        next();
    };
};

const requireAnyRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!allowedRoles.some(role => role === req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        next();
    };
};

// Middleware to check if user can access specific report
const checkReportAccess = async (req, res, next) => {
    try {
        const { reportId } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;

        const db = getDB();
        
        // Admin and doctor can access all reports
        if (['admin', 'doctor'].includes(userRole)) {
            return next();
        }

        // Check if report exists and is finalized for other roles
        const reportQuery = `
            SELECT id, finalized_at, doctor_id
            FROM reports 
            WHERE id = $1
        `;
        
        const reportResult = await db.query(reportQuery, [reportId]);
        
        if (reportResult.rows.length === 0) {
            return res.status(404).json({ error: 'Report not found' });
        }

        const report = reportResult.rows[0];

        // Researcher and observer can only access finalized reports
        if (['researcher', 'observer'].includes(userRole)) {
            if (!report.finalized_at) {
                return res.status(403).json({ error: 'Cannot access draft reports' });
            }
        }

        next();
    } catch (error) {
        logger.error('Report access check error:', error);
        return res.status(500).json({ error: 'Access check failed' });
    }
};

module.exports = {
    extractToken,
    revokeUserTokens,
    authenticateToken,
    requireRole,
    requireAnyRole,
    checkReportAccess
};