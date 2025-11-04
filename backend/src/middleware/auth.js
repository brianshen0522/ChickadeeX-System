const jwt = require('jsonwebtoken');
const { getDB } = require('../database/connection');
const { getRedis } = require('../database/redis');
const { logger } = require('../utils/logger');

const authenticateToken = async (req, res, next) => {
    try {
        // Check for token in httpOnly cookie first, then fallback to Authorization header
        let token = req.cookies?.auth_token;
        
        if (!token) {
            const authHeader = req.headers['authorization'];
            token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
        }

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
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.authToken = token;

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
        
        // Admin can access all reports
        if (userRole === 'admin') {
            return next();
        }

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

        if (userRole === 'doctor') {
            if (report.doctor_id !== userId) {
                return res.status(403).json({ error: 'Not authorized to access this report' });
            }
            return next();
        }

        if (userRole === 'researcher') {
            if (!report.finalized_at) {
                return res.status(403).json({ error: 'Cannot access draft reports' });
            }
            return next();
        }

        if (userRole === 'observer') {
            if (report.doctor_id !== userId) {
                return res.status(403).json({ error: 'Not authorized to access this report' });
            }
            return next();
        }

        return res.status(403).json({ error: 'Not authorized to access this report' });
    } catch (error) {
        logger.error('Report access check error:', error);
        return res.status(500).json({ error: 'Access check failed' });
    }
};

module.exports = {
    authenticateToken,
    requireRole,
    requireAnyRole,
    checkReportAccess
};
