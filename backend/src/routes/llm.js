const express = require('express');
const { authenticateToken, requireAnyRole } = require('../middleware/auth');
const { generateAIReport } = require('../services/llm');
const router = express.Router();

router.use(authenticateToken);
router.use(requireAnyRole(['doctor']));

// Test LLM connection
router.post('/test', async (req, res) => {
    try {
        const result = await generateAIReport({
            studyDescription: 'Test study',
            modality: 'CT',
            clinicalContext: 'Test case'
        });
        
        res.json({ 
            success: true, 
            message: 'LLM connection successful',
            model_used: result.model_used
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'LLM connection failed' 
        });
    }
});

module.exports = router;