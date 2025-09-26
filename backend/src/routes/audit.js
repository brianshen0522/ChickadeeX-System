const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getAuditLogs, getAuditLogStats } = require('../utils/audit');
const router = express.Router();

router.use(authenticateToken);
router.use(requireRole(['admin']));

// Get audit logs
router.get('/', async (req, res) => {
    try {
        const filters = {
            userId: req.query.user_id,
            action: req.query.action,
            targetType: req.query.target_type,
            targetId: req.query.target_id,
            dateFrom: req.query.date_from,
            dateTo: req.query.date_to,
            limit: parseInt(req.query.limit) || 50,
            offset: parseInt(req.query.offset) || 0
        };
        
        const logs = await getAuditLogs(filters);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve audit logs' });
    }
});

// Get audit statistics
router.get('/stats', async (req, res) => {
    try {
        const dateFrom = req.query.date_from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const dateTo = req.query.date_to || new Date();
        
        const stats = await getAuditLogStats(dateFrom, dateTo);
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve audit statistics' });
    }
});

module.exports = router;