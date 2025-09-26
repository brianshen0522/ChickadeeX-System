const { getDB } = require('../database/connection');
const { logger } = require('./logger');

const createAuditLog = async (userId, action, targetType = null, targetId = null, details = {}) => {
    try {
        const db = getDB();
        
        const query = `
            INSERT INTO audit_logs (user_id, action, target_type, target_id, details, ip_address, user_agent)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;
        
        await db.query(query, [
            userId,
            action,
            targetType,
            targetId,
            JSON.stringify(details),
            details.ip || null,
            details.user_agent || null
        ]);
        
        logger.info('Audit log created', {
            userId,
            action,
            targetType,
            targetId,
            details
        });
    } catch (error) {
        logger.error('Failed to create audit log:', error);
        // Don't throw error to avoid breaking the main operation
    }
};

const getAuditLogs = async (filters = {}) => {
    try {
        const db = getDB();
        
        let query = `
            SELECT 
                a.id,
                a.user_id,
                u.name as user_name,
                u.email as user_email,
                a.action,
                a.target_type,
                a.target_id,
                a.details,
                a.ip_address,
                a.user_agent,
                a.timestamp
            FROM audit_logs a
            LEFT JOIN users u ON a.user_id = u.id
        `;
        
        const conditions = [];
        const values = [];
        let paramCount = 0;

        if (filters.userId) {
            paramCount++;
            conditions.push(`a.user_id = $${paramCount}`);
            values.push(filters.userId);
        }

        if (filters.action) {
            paramCount++;
            conditions.push(`a.action = $${paramCount}`);
            values.push(filters.action);
        }

        if (filters.targetType) {
            paramCount++;
            conditions.push(`a.target_type = $${paramCount}`);
            values.push(filters.targetType);
        }

        if (filters.targetId) {
            paramCount++;
            conditions.push(`a.target_id = $${paramCount}`);
            values.push(filters.targetId);
        }

        if (filters.dateFrom) {
            paramCount++;
            conditions.push(`a.timestamp >= $${paramCount}`);
            values.push(filters.dateFrom);
        }

        if (filters.dateTo) {
            paramCount++;
            conditions.push(`a.timestamp <= $${paramCount}`);
            values.push(filters.dateTo);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY a.timestamp DESC';

        if (filters.limit) {
            paramCount++;
            query += ` LIMIT $${paramCount}`;
            values.push(filters.limit);
        }

        if (filters.offset) {
            paramCount++;
            query += ` OFFSET $${paramCount}`;
            values.push(filters.offset);
        }

        const result = await db.query(query, values);
        return result.rows;
    } catch (error) {
        logger.error('Failed to get audit logs:', error);
        throw error;
    }
};

const getAuditLogStats = async (dateFrom, dateTo) => {
    try {
        const db = getDB();
        
        const query = `
            SELECT 
                action,
                COUNT(*) as count,
                COUNT(DISTINCT user_id) as unique_users
            FROM audit_logs
            WHERE timestamp BETWEEN $1 AND $2
            GROUP BY action
            ORDER BY count DESC
        `;
        
        const result = await db.query(query, [dateFrom, dateTo]);
        return result.rows;
    } catch (error) {
        logger.error('Failed to get audit log stats:', error);
        throw error;
    }
};

module.exports = {
    createAuditLog,
    getAuditLogs,
    getAuditLogStats
};