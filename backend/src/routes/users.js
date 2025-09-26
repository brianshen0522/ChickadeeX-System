const express = require('express');
const bcrypt = require('bcryptjs');
const { getDB } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');
const { validateRequest, schemas } = require('../middleware/validation');
const { createAuditLog } = require('../utils/audit');
const router = express.Router();

router.use(authenticateToken);

// Get current user profile
router.get('/profile', async (req, res) => {
    try {
        const db = getDB();
        const query = `
            SELECT u.id, u.email, u.name, u.last_login, u.created_at,
                   r.name as role,
                   (u.local_password IS NOT NULL) AS has_local_password
            FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE u.id = $1
        `;
        
        const result = await db.query(query, [req.user.id]);
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve profile' });
    }
});

// Update current user profile (name)
router.put('/profile', validateRequest(schemas.updateProfile), async (req, res) => {
    // Profile fields are not editable; only password can be changed via /users/password
    return res.status(403).json({ error: 'Profile fields are read-only' });
});

// Set or change local password
router.put('/password', validateRequest(schemas.updatePassword), async (req, res) => {
    try {
        const db = getDB();
        const { current_password, new_password } = req.body;

        // Load current user with password
        const userResult = await db.query('SELECT id, local_password FROM users WHERE id = $1', [req.user.id]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const user = userResult.rows[0];

        if (user.local_password) {
            // Require correct current password for changes
            const ok = await bcrypt.compare(current_password || '', user.local_password);
            if (!ok) {
                return res.status(400).json({ error: 'Current password is incorrect', code: 'CURRENT_PASSWORD_INVALID' });
            }
        }

        const hashed = await bcrypt.hash(new_password, 10);
        await db.query('UPDATE users SET local_password = $1 WHERE id = $2', [hashed, req.user.id]);

        await createAuditLog(req.user.id, 'password_updated', 'user', req.user.id, { method: user.local_password ? 'change' : 'set' });

        res.json({ message: 'Password updated successfully', method: user.local_password ? 'change' : 'set' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update password' });
    }
});

module.exports = router;
