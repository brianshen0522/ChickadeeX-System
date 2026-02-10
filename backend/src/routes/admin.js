const express = require('express');

const { authenticateToken, requireRole } = require('../middleware/auth');
const { validateRequest, validateParams, schemas } = require('../middleware/validation');
const adminService = require('../services/adminService');

const router = express.Router();

router.use(authenticateToken);
router.use(requireRole(['admin']));

router.get('/users', async (req, res, next) => {
    try {
        const users = await adminService.listUsers();
        res.json(users);
    } catch (error) {
        next(error);
    }
});

router.get('/users/:userId', async (req, res, next) => {
    try {
        const user = await adminService.getUser(req);
        res.json(user);
    } catch (error) {
        next(error);
    }
});

router.put('/users/:userId',
    validateParams({ userId: schemas.uuid }),
    validateRequest(schemas.updateUser),
    async (req, res, next) => {
        try {
            const user = await adminService.updateUser(req);
            res.json(user);
        } catch (error) {
            next(error);
        }
    }
);

router.put('/users/:userId/role',
    validateParams({ userId: schemas.uuid }),
    validateRequest(schemas.setUserRole),
    async (req, res, next) => {
        try {
            const result = await adminService.updateUserRole(req);
            res.json({ message: 'Role updated', user: result });
        } catch (error) {
            next(error);
        }
    }
);

router.delete('/users/:userId/password',
    validateParams({ userId: schemas.uuid }),
    async (req, res, next) => {
        try {
            const result = await adminService.clearUserPassword(req);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

router.delete('/users/:userId',
    validateParams({ userId: schemas.uuid }),
    async (req, res, next) => {
        try {
            const result = await adminService.deleteUser(req);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

router.get('/llm-configs', async (req, res, next) => {
    try {
        const configs = await adminService.listLlmConfigs();
        res.json(configs);
    } catch (error) {
        next(error);
    }
});

router.post('/llm-configs',
    validateRequest(schemas.llmConfig),
    async (req, res, next) => {
        try {
            const config = await adminService.createLlmConfig(req);
            res.status(201).json(config);
        } catch (error) {
            next(error);
        }
    }
);

router.put('/llm-configs/:configId',
    validateParams({ configId: schemas.uuid }),
    async (req, res, next) => {
        try {
            const config = await adminService.updateLlmConfig(req);
            res.json(config);
        } catch (error) {
            next(error);
        }
    }
);

router.post('/llm-models', async (req, res, next) => {
    try {
        const data = await adminService.listLlmModels(req);
        res.json(data);
    } catch (error) {
        next(error);
    }
});

router.delete('/llm-configs/:configId',
    validateParams({ configId: schemas.uuid }),
    async (req, res, next) => {
        try {
            const result = await adminService.deleteLlmConfig(req);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
);

router.get('/system-settings', async (req, res, next) => {
    try {
        const settings = await adminService.getSystemSettings();
        res.json(settings);
    } catch (error) {
        next(error);
    }
});

router.put('/system-settings',
    validateRequest(schemas.updateSystemSettings),
    async (req, res, next) => {
        try {
            const settings = await adminService.updateSystemSettings(req);
            res.json(settings);
        } catch (error) {
            next(error);
        }
    }
);

router.get('/pacs-config', async (req, res, next) => {
    try {
        const config = await adminService.getPacsConfig();
        res.json(config);
    } catch (error) {
        next(error);
    }
});

router.post('/pacs-config',
    validateRequest(schemas.pacsConfig),
    async (req, res, next) => {
        try {
            const config = await adminService.updatePacsConfig(req);
            res.json(config);
        } catch (error) {
            next(error);
        }
    }
);

router.get('/statistics', async (req, res, next) => {
    try {
        const stats = await adminService.getStatistics(req);
        res.json(stats);
    } catch (error) {
        next(error);
    }
});

router.post('/llm-configs/:configId/test',
    validateParams({ configId: schemas.uuid }),
    async (req, res) => {
        try {
            const result = await adminService.testLlmConfig(req);
            res.json(result);
        } catch (error) {
            const message = adminService.extractLLMTestError(error);
            res.status(200).json({ healthy: false, error: message });
        }
    }
);

module.exports = router;
