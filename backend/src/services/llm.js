const axios = require('axios');
const { getDB } = require('../database/connection');
const { logger } = require('../utils/logger');

/**
 * Main function to generate AI report
 */
const generateAIReport = async (params) => {
    const { studyDescription, modality, clinicalContext, previousContent, dicom } = params;
    
    try {
        const db = getDB();
        
        // Get enabled LLM configs ordered by priority (1 = highest priority)
        const query = `
            SELECT id, name, model_name, api_url, api_key, prompt, priority, 
                   max_tokens, temperature, top_p
            FROM llm_configs 
            WHERE enabled = true AND api_key IS NOT NULL
            ORDER BY priority ASC
        `;
        
        const result = await db.query(query);
        
        if (result.rows.length === 0) {
            throw new Error('No enabled LLM configurations found');
        }
        
        // Try each LLM in priority order
        for (const config of result.rows) {
            try {
                logger.info(`Trying LLM: ${config.name} (priority ${config.priority})`);
                
                const response = await callLLM(config, {
                    studyDescription,
                    modality,
                    clinicalContext,
                    previousContent,
                    dicom
                });
                
                return {
                    findings: response.findings,
                    impression: response.impression,
                    model_used: config.model_name,
                    model_config: {
                        name: config.name,
                        provider: getProviderName(config.api_url),
                        temperature: config.temperature,
                        max_tokens: config.max_tokens,
                        top_p: config.top_p,
                        priority: config.priority
                    }
                };
                
            } catch (error) {
                logger.warn(`LLM ${config.name} failed: ${error.message}`);
                // Continue to next LLM
            }
        }
        
        throw new Error('All LLM configurations failed');
        
    } catch (error) {
        logger.error('AI report generation failed:', error);
        throw error;
    }
};

/**
 * Call specific LLM with configuration
 */
const callLLM = async (config, params) => {
    const { studyDescription, modality, clinicalContext, previousContent, dicom } = params;
    
    // Build prompt with variables
    const variables = {
        studyDescription: studyDescription || 'Not provided',
        modality: modality || 'Unknown',
        clinicalContext: clinicalContext || 'Not provided',
        previousContent: previousContent || '',
        dicomStudyUrl: dicom?.studyUrl || '',
        dicomDownloadUrl: dicom?.downloadUrl || '',
        studyInstanceUID: dicom?.studyInstanceUID || ''
    };
    
    // Use config prompt or default
    let systemPrompt = config.prompt || getDefaultPrompt();
    
    // Replace variables in prompt
    Object.entries(variables).forEach(([key, value]) => {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        systemPrompt = systemPrompt.replace(regex, value);
    });
    
    // Build user prompt with study details
    const userPrompt = `
Study Information:
- Modality: ${variables.modality}
- Study Description: ${variables.studyDescription}
- Clinical Context: ${variables.clinicalContext}
- Previous Content: ${variables.previousContent}
- DICOM Study URL: ${variables.dicomStudyUrl}
- DICOM Download URL: ${variables.dicomDownloadUrl}
- Study Instance UID: ${variables.studyInstanceUID}

Generate a medical report with findings and impression in the required JSON format.`;

    // Determine API type and call
    const apiUrl = config.api_url.toLowerCase();
    
    if (apiUrl.includes('generativelanguage.googleapis.com')) {
        return await callGeminiAPI(config, systemPrompt, userPrompt);
    } else if (apiUrl.includes('openai.com')) {
        return await callOpenAIAPI(config, systemPrompt, userPrompt);
    } else if (apiUrl.includes('openrouter.ai') || apiUrl.includes('anthropic.com')) {
        return await callClaudeAPI(config, systemPrompt, userPrompt);
    } else {
        return await callGenericAPI(config, systemPrompt, userPrompt);
    }
};

/**
 * Call Google Gemini API
 */
const callGeminiAPI = async (config, systemPrompt, userPrompt) => {
    try {
        // Ensure correct URL format for Gemini
        let apiUrl = config.api_url;
        if (!apiUrl.includes(':generateContent')) {
            // Fix common URL format issues
            if (apiUrl.includes('gemini-2.0-flash')) {
                apiUrl = apiUrl.replace('gemini-2.0-flash', 'gemini-1.5-flash');
            }
            if (!apiUrl.endsWith(':generateContent')) {
                apiUrl = apiUrl.replace(/\/+$/, '') + ':generateContent';
            }
        }
        
        const payload = {
            contents: [{
                role: 'user',
                parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
            }]
        };
        
        // Add generation config if parameters exist
        if (config.temperature != null || config.max_tokens != null || config.top_p != null) {
            payload.generationConfig = {};
            if (config.temperature != null) payload.generationConfig.temperature = parseFloat(config.temperature);
            if (config.top_p != null) payload.generationConfig.topP = parseFloat(config.top_p);
            if (config.max_tokens != null) payload.generationConfig.maxOutputTokens = parseInt(config.max_tokens);
        }
        
        const response = await axios.post(apiUrl, payload, {
            headers: {
                'Content-Type': 'application/json',
                'X-goog-api-key': config.api_key
            },
            timeout: 30000
        });
        
        if (response.status !== 200) {
            throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
        }
        
        // Extract text from Gemini response
        const candidate = response.data.candidates?.[0];
        const content = candidate?.content?.parts?.[0]?.text || '';
        
        return parseResponse(content);
        
    } catch (error) {
        if (error.response?.status === 405) {
            throw new Error('Invalid Gemini API URL. Please check the model name and endpoint format.');
        }
        throw new Error(`Gemini API call failed: ${error.message}`);
    }
};

/**
 * Call OpenAI API
 */
const callOpenAIAPI = async (config, systemPrompt, userPrompt) => {
    try {
        const payload = {
            model: config.model_name,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ]
        };
        
        // Add optional parameters
        if (config.temperature != null) payload.temperature = parseFloat(config.temperature);
        if (config.max_tokens != null) payload.max_tokens = parseInt(config.max_tokens);
        if (config.top_p != null) payload.top_p = parseFloat(config.top_p);
        
        const response = await axios.post(config.api_url, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.api_key}`
            },
            timeout: 30000
        });
        
        const content = response.data.choices?.[0]?.message?.content || '';
        return parseResponse(content);
        
    } catch (error) {
        throw new Error(`OpenAI API call failed: ${error.message}`);
    }
};

/**
 * Call Claude/Anthropic API (via OpenRouter)
 */
const callClaudeAPI = async (config, systemPrompt, userPrompt) => {
    try {
        const payload = {
            model: config.model_name,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ]
        };
        
        // Add optional parameters
        if (config.temperature != null) payload.temperature = parseFloat(config.temperature);
        if (config.max_tokens != null) payload.max_tokens = parseInt(config.max_tokens);
        if (config.top_p != null) payload.top_p = parseFloat(config.top_p);
        
        const response = await axios.post(config.api_url, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.api_key}`
            },
            timeout: 30000
        });
        
        const content = response.data.choices?.[0]?.message?.content || '';
        return parseResponse(content);
        
    } catch (error) {
        throw new Error(`Claude API call failed: ${error.message}`);
    }
};

/**
 * Call generic OpenAI-compatible API
 */
const callGenericAPI = async (config, systemPrompt, userPrompt) => {
    try {
        const payload = {
            model: config.model_name,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ]
        };
        
        // Add optional parameters
        if (config.temperature != null) payload.temperature = parseFloat(config.temperature);
        if (config.max_tokens != null) payload.max_tokens = parseInt(config.max_tokens);
        if (config.top_p != null) payload.top_p = parseFloat(config.top_p);
        
        const response = await axios.post(config.api_url, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.api_key}`
            },
            timeout: 30000
        });
        
        const content = response.data.choices?.[0]?.message?.content || '';
        return parseResponse(content);
        
    } catch (error) {
        throw new Error(`Generic API call failed: ${error.message}`);
    }
};

/**
 * Parse LLM response into findings and impression
 */
const parseResponse = (content) => {
    try {
        // First try to parse as JSON
        const cleanContent = content.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '');
        
        // Look for JSON object
        const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.findings && parsed.impression) {
                return {
                    findings: Array.isArray(parsed.findings) ? parsed.findings : [parsed.findings],
                    impression: Array.isArray(parsed.impression) ? parsed.impression : [parsed.impression]
                };
            }
        }
        
        // Fallback: parse by sections
        const findingsMatch = content.match(/FINDINGS?:?\s*([\s\S]*?)(?=IMPRESSION|$)/i);
        const impressionMatch = content.match(/IMPRESSION:?\s*([\s\S]*?)$/i);
        
        const findings = findingsMatch ? findingsMatch[1].trim().split('\n').filter(Boolean) : ['- Generated content available'];
        const impression = impressionMatch ? impressionMatch[1].trim().split('\n').filter(Boolean) : ['- Please review generated content'];
        
        return { findings, impression };
        
    } catch (error) {
        logger.error('Failed to parse LLM response:', error);
        return {
            findings: ['- Unable to parse response'],
            impression: ['- Please try again']
        };
    }
};

/**
 * Get provider name from URL
 */
const getProviderName = (url) => {
    const urlLower = url.toLowerCase();
    if (urlLower.includes('openai.com')) return 'OpenAI';
    if (urlLower.includes('generativelanguage.googleapis.com')) return 'Google Gemini';
    if (urlLower.includes('openrouter.ai')) return 'OpenRouter';
    if (urlLower.includes('anthropic.com')) return 'Anthropic';
    return 'Custom API';
};

/**
 * Default prompt template
 */
const getDefaultPrompt = () => {
    return `You are a medical imaging specialist. Generate a structured medical report with findings and impression.

RESPOND WITH VALID JSON ONLY in this exact format:
{
  "findings": [
    "- First finding observation",
    "- Second finding observation"
  ],
  "impression": [
    "- First clinical conclusion",
    "- Second clinical conclusion"
  ]
}

Rules:
1. Use JSON format only
2. Each finding/impression starts with "- "
3. Provide 2-5 findings and 2-4 impressions
4. Be medically accurate and professional
5. Consider the study type: {{modality}} {{studyDescription}}`;
};

module.exports = {
    generateAIReport
};