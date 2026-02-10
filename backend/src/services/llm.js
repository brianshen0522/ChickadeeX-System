const fs = require('fs');
const axios = require('axios');
const { getDB } = require('../database/connection');
const { logger } = require('../utils/logger');
const { validateExternalUrl } = require('../utils/urlValidator');
const { decryptSecret } = require('../utils/crypto');

/**
 * Main function to generate AI report
 */
const imageCache = new Map();

const fsp = fs.promises;

const LLM_TIMEOUT_MS = 999999999;

const fetchImageAsBase64 = async (source) => {
    const descriptor = typeof source === 'string' ? { url: source } : (source || {});
    const { url, localPath, base64 } = descriptor;

    if (base64) {
        return base64;
    }
    const cacheKey = localPath || url;

    if (!cacheKey) {
        throw new Error('No image source provided');
    }

    if (imageCache.has(cacheKey)) {
        return imageCache.get(cacheKey);
    }

    if (localPath) {
        try {
            const fileBuffer = await fsp.readFile(localPath);
            const base64FromFile = fileBuffer.toString('base64');
            imageCache.set(cacheKey, base64FromFile);
            setTimeout(() => imageCache.delete(cacheKey), 5 * 60 * 1000);
            return base64FromFile;
        } catch (error) {
            logger.warn('Failed to read local image for LLM attachment', { localPath, error: error.message });
        }
    }

    if (url) {
        try {
            await validateExternalUrl(url);
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: LLM_TIMEOUT_MS,
                headers: {
                    'Accept': 'image/png,image/jpeg,image/webp,image/*'
                }
            });
            const base64 = Buffer.from(response.data).toString('base64');
            imageCache.set(cacheKey, base64);
            setTimeout(() => imageCache.delete(cacheKey), 5 * 60 * 1000);
            return base64;
        } catch (error) {
            logger.warn('Failed to fetch image for LLM attachment', { url, error: error.message });
        }
    }

    throw new Error('Unable to attach preview image for generation');
};

const generateAIReport = async (params) => {
    const { studyDescription, modality, clinicalContext, previousContent, dicom } = params;
    
    try {
        const db = getDB();
        
        // Get enabled LLM configs ordered by priority (1 = highest priority)
        const query = `
            SELECT id, name, model_name, api_url, api_key, prompt, priority, 
                   max_tokens, temperature, top_p
            FROM llm_configs 
            WHERE enabled = true
            ORDER BY priority ASC
        `;
        
        const result = await db.query(query);
        
        if (result.rows.length === 0) {
            throw new Error('No enabled LLM configurations found');
        }
        
        // Try each LLM in priority order
        for (const config of result.rows) {
            try {
                const decryptedKey = decryptSecret(config.api_key);
                const configWithKey = { ...config, api_key: decryptedKey };
                logger.info(`Trying LLM: ${config.name} (priority ${config.priority})`);
                
                const response = await callLLM(configWithKey, {
                    studyDescription,
                    modality,
                    clinicalContext,
                    previousContent,
                    dicom
                });
                
                const isSuccess = typeof response.isSuccess === 'boolean' ? response.isSuccess : true;
                const message = typeof response.msg === 'string' ? response.msg.trim() : '';
                
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
                    },
                    isSuccess,
                    msg: message
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
        studyInstanceUID: dicom?.studyInstanceUID || '',
        imagePreviewUrl: dicom?.imageUrl || (dicom?.imageBase64 ? 'inline-preview' : ''),
        imageMimeType: dicom?.imageMimeType || 'image/jpeg'
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
- Image Preview URL: ${variables.imagePreviewUrl}
- Study Instance UID: ${variables.studyInstanceUID}

Generate a medical report with findings and impression in the required JSON format.`;

    // Determine API type and call
    const hasImage = Boolean(dicom && (dicom.imageUrl || dicom.imagePath || dicom.imageBase64));
    if (!hasImage) {
        throw new Error('Image preview required for AI generation');
    }

    const apiUrl = config.api_url.toLowerCase();
    const imageDescriptor = {
        url: dicom?.imageUrl || '',
        mimeType: dicom?.imageMimeType || 'image/jpeg',
        localPath: dicom?.imagePath || '',
        base64: dicom?.imageBase64 || ''
    };
    
    if (apiUrl.includes('generativelanguage.googleapis.com')) {
        return await callGeminiAPI(config, systemPrompt, userPrompt, imageDescriptor);
    } else if (apiUrl.includes('openai.com')) {
        return await callOpenAIAPI(config, systemPrompt, userPrompt, imageDescriptor);
    } else if (apiUrl.includes('openrouter.ai') || apiUrl.includes('anthropic.com')) {
        return await callClaudeAPI(config, systemPrompt, userPrompt, imageDescriptor);
    } else if (/:(11434|11435)\b/.test(apiUrl) || apiUrl.includes('/api/chat') || apiUrl.includes('/api/generate')) {
        return await callOllamaAPI(config, systemPrompt, userPrompt, imageDescriptor);
    } else {
        return await callGenericAPI(config, systemPrompt, userPrompt, imageDescriptor);
    }
};

/**
 * Call Google Gemini API
 */
const callGeminiAPI = async (config, systemPrompt, userPrompt, imageDescriptor = {}) => {
    try {
        const { url: imageUrl, mimeType = 'image/jpeg', localPath, base64 } = imageDescriptor;
        // Ensure correct URL format for Gemini
        let apiUrl = String(config.api_url || '').trim();
        if (!apiUrl.includes(':generateContent')) {
            // Fix common URL format issues
            if (apiUrl.includes('gemini-2.0-flash')) {
                apiUrl = apiUrl.replace('gemini-2.0-flash', 'gemini-1.5-flash');
            }
            if (!apiUrl.endsWith(':generateContent')) {
                apiUrl = apiUrl.replace(/\/+$/, '') + ':generateContent';
            }
        }
        
        const parts = [{ text: `${systemPrompt}\n\n${userPrompt}` }];

        if (imageUrl || localPath || base64) {
            const base64Image = await fetchImageAsBase64({ url: imageUrl, localPath, base64 });
            if (!base64Image) {
                throw new Error('Unable to prepare image preview for Gemini');
            }
            parts.push({
                inlineData: {
                    mimeType,
                    data: base64Image
                }
            });
        }

        const payload = {
            contents: [{
                role: 'user',
                parts
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
            timeout: LLM_TIMEOUT_MS
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
const callOpenAIAPI = async (config, systemPrompt, userPrompt, imageDescriptor = {}) => {
    try {
        const { url: imageUrl, mimeType = 'image/jpeg', localPath, base64 } = imageDescriptor;
        const supportsVision =
            typeof config.model_name === 'string' &&
            /(gpt-4o|gpt-4-turbo|gpt-4-vision|gpt-4.1|gpt-4o-mini|gpt-4\.1|gpt-4\.0|o1|o3)/i.test(config.model_name);

        if (!supportsVision) {
            throw new Error('Selected OpenAI model does not support image inputs');
        }

        if (!imageUrl && !localPath && !base64) {
            throw new Error('Image preview required for OpenAI vision models');
        }

        const base64Image = await fetchImageAsBase64({ url: imageUrl, localPath, base64 });
        const dataUrl = `data:${mimeType};base64,${base64Image}`;

        const userContent = [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: { url: dataUrl } }
        ];

        const payload = {
            model: config.model_name,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent }
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
            timeout: LLM_TIMEOUT_MS
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
const callClaudeAPI = async (config, systemPrompt, userPrompt, imageDescriptor = {}) => {
    try {
        const { url: imageUrl, mimeType = 'image/jpeg', localPath, base64 } = imageDescriptor;

        if (!imageUrl && !localPath && !base64) {
            throw new Error('Image preview required for Claude vision models');
        }

        const isAnthropic = /anthropic\.com/.test(config.api_url);
        const base64Image = await fetchImageAsBase64({ url: imageUrl, localPath, base64 });

        if (isAnthropic) {
            const payload = {
                model: config.model_name,
                system: systemPrompt,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: userPrompt },
                            {
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: mimeType,
                                    data: base64Image
                                }
                            }
                        ]
                    }
                ]
            };

            if (config.temperature != null) payload.temperature = parseFloat(config.temperature);
            if (config.max_tokens != null) payload.max_output_tokens = parseInt(config.max_tokens);
            if (config.top_p != null) payload.top_p = parseFloat(config.top_p);

            const response = await axios.post(config.api_url, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': config.api_key,
                    'anthropic-version': '2023-06-01'
                },
                timeout: LLM_TIMEOUT_MS
            });

            const content = Array.isArray(response.data?.content)
                ? response.data.content.map((part) => part?.text || '').join('\n').trim()
                : '';

            return parseResponse(content);
        }

        const dataUrl = `data:${mimeType};base64,${base64Image}`;
        const payload = {
            model: config.model_name,
            messages: [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: userPrompt },
                        { type: 'image_url', image_url: { url: dataUrl } }
                    ]
                }
            ]
        };

        if (config.temperature != null) payload.temperature = parseFloat(config.temperature);
        if (config.max_tokens != null) payload.max_tokens = parseInt(config.max_tokens);
        if (config.top_p != null) payload.top_p = parseFloat(config.top_p);

        const response = await axios.post(config.api_url, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.api_key}`
            },
            timeout: LLM_TIMEOUT_MS
        });

        const content = response.data.choices?.[0]?.message?.content || '';
        return parseResponse(content);

    } catch (error) {
        throw new Error(`Claude API call failed: ${error.message}`);
    }
};

/**
 * Call Ollama API (local LLM)
 */
const callOllamaAPI = async (config, systemPrompt, userPrompt, imageDescriptor = {}) => {
    try {
        const { url: imageUrl, mimeType = 'image/jpeg', localPath, base64 } = imageDescriptor;

        // Determine if using /api/chat, /api/generate, or OpenAI-compatible endpoint
        let apiUrl = String(config.api_url || '').trim();
        const isNativeGenerate = apiUrl.includes('/api/generate');
        const isNativeChat = apiUrl.includes('/api/chat');

        // If URL is just a base like http://host:11434, default to /api/generate
        if (!isNativeGenerate && !isNativeChat && !apiUrl.includes('/v1/')) {
            apiUrl = apiUrl.replace(/\/+$/, '') + '/api/generate';
        }

        // Prepare image base64 (strip data: prefix if present)
        let images = [];
        if (imageUrl || localPath || base64) {
            const base64Image = await fetchImageAsBase64({ url: imageUrl, localPath, base64 });
            images = [base64Image];
        }

        // OpenAI-compatible /v1/chat/completions path
        if (apiUrl.includes('/v1/')) {
            let userContent = userPrompt;
            if (images.length > 0) {
                const dataUrl = `data:${mimeType};base64,${images[0]}`;
                userContent = [
                    { type: 'text', text: userPrompt },
                    { type: 'image_url', image_url: { url: dataUrl } }
                ];
            }

            if (apiUrl.endsWith('/v1') || apiUrl.endsWith('/v1/')) {
                apiUrl = `${apiUrl.replace(/\/+$/, '')}/chat/completions`;
            }
            const isChatCompletions = apiUrl.includes('/chat/completions');
            const payload = isChatCompletions
                ? {
                    model: config.model_name,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userContent }
                    ],
                    stream: false
                }
                : {
                    model: config.model_name,
                    prompt: `${systemPrompt}\n\n${userPrompt}`,
                    stream: false
                };
            if (config.temperature != null) payload.temperature = parseFloat(config.temperature);
            if (config.max_tokens != null) payload.max_tokens = parseInt(config.max_tokens);
            if (config.top_p != null) payload.top_p = parseFloat(config.top_p);

            const response = await axios.post(apiUrl, payload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: LLM_TIMEOUT_MS
            });
            const content = isChatCompletions
                ? response.data.choices?.[0]?.message?.content || ''
                : response.data.choices?.[0]?.text || '';
            return parseResponse(content);
        }

        if (apiUrl.includes('/api/chat')) {
            const payload = {
                model: config.model_name,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt, images: images.length > 0 ? images : undefined }
                ],
                stream: false,
                options: {}
            };
            if (config.temperature != null) payload.options.temperature = parseFloat(config.temperature);
            if (config.max_tokens != null) payload.options.num_predict = parseInt(config.max_tokens);
            if (config.top_p != null) payload.options.top_p = parseFloat(config.top_p);

            const response = await axios.post(apiUrl, payload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: LLM_TIMEOUT_MS
            });

            const content = response.data.message?.content || '';
            return parseResponse(content);
        }

        // Native Ollama /api/generate endpoint
        const payload = {
            model: config.model_name,
            prompt: userPrompt,
            system: systemPrompt,
            images: images.length > 0 ? images : undefined,
            stream: false,
            options: {}
        };
        if (config.temperature != null) payload.options.temperature = parseFloat(config.temperature);
        if (config.max_tokens != null) payload.options.num_predict = parseInt(config.max_tokens);
        if (config.top_p != null) payload.options.top_p = parseFloat(config.top_p);

        const response = await axios.post(apiUrl, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: LLM_TIMEOUT_MS
        });

        const content = response.data.response || '';
        return parseResponse(content);

    } catch (error) {
        throw new Error(`Ollama API call failed: ${error.message}`);
    }
};

/**
 * Call generic OpenAI-compatible API
 */
const callGenericAPI = async (config, systemPrompt, userPrompt, imageDescriptor = {}) => {
    try {
        const { url: imageUrl, mimeType = 'image/jpeg', localPath, base64 } = imageDescriptor;
        let userContent = userPrompt;
        if (imageUrl || localPath || base64) {
            const base64Image = await fetchImageAsBase64({ url: imageUrl, localPath, base64 });
            const dataUrl = `data:${mimeType};base64,${base64Image}`;
            userContent = [
                { type: 'text', text: userPrompt },
                { type: 'image_url', image_url: { url: dataUrl } }
            ];
        }

        let apiUrl = String(config.api_url || '').trim();
        if (apiUrl.endsWith('/v1') || apiUrl.endsWith('/v1/')) {
            apiUrl = `${apiUrl.replace(/\/+$/, '')}/chat/completions`;
        }
        const isChatCompletions = apiUrl.includes('/chat/completions');
        const isTextCompletions = apiUrl.includes('/completions') && !isChatCompletions;

        if (isTextCompletions && Array.isArray(userContent)) {
            logger.warn('Generic completions endpoint does not support image inputs. Sending text-only prompt.', {
                model: config.model_name,
                api_url: apiUrl
            });
            userContent = userPrompt;
        }

        const payload = isTextCompletions
            ? {
                model: config.model_name,
                prompt: `${systemPrompt}\n\n${userPrompt}`
            }
            : {
                model: config.model_name,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userContent }
                ]
            };
        
        // Add optional parameters
        if (config.temperature != null) payload.temperature = parseFloat(config.temperature);
        if (config.max_tokens != null) payload.max_tokens = parseInt(config.max_tokens);
        if (config.top_p != null) payload.top_p = parseFloat(config.top_p);

        const response = await axios.post(apiUrl, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.api_key}`
            },
            timeout: LLM_TIMEOUT_MS
        });

        const content = isTextCompletions
            ? response.data.choices?.[0]?.text || ''
            : response.data.choices?.[0]?.message?.content || '';
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
            if (parsed && typeof parsed === 'object') {
                const findings = parsed.findings
                    ? (Array.isArray(parsed.findings) ? parsed.findings : [parsed.findings])
                    : ['- Generated content available'];
                const impression = parsed.impression
                    ? (Array.isArray(parsed.impression) ? parsed.impression : [parsed.impression])
                    : ['- Please review generated content'];
                const isSuccess = typeof parsed.isSuccess === 'boolean' ? parsed.isSuccess : true;
                const msg = typeof parsed.msg === 'string' ? parsed.msg.trim() : '';
                return { findings, impression, isSuccess, msg };
            }
        }
        
        // Fallback: parse by sections
        const findingsMatch = content.match(/FINDINGS?:?\s*([\s\S]*?)(?=IMPRESSION|$)/i);
        const impressionMatch = content.match(/IMPRESSION:?\s*([\s\S]*?)$/i);
        
        const findings = findingsMatch
            ? findingsMatch[1].trim().split('\n').filter(Boolean)
            : ['- Generated content available'];
        const impression = impressionMatch
            ? impressionMatch[1].trim().split('\n').filter(Boolean)
            : ['- Please review generated content'];
        
        return {
            findings,
            impression,
            isSuccess: true,
            msg: ''
        };
        
    } catch (error) {
        logger.error('Failed to parse LLM response:', error);
        return {
            findings: ['- Unable to parse response'],
            impression: ['- Please try again'],
            isSuccess: false,
            msg: 'generation failed'
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
    if (/:(11434|11435)\b/.test(urlLower) || urlLower.includes('/api/chat') || urlLower.includes('/api/generate')) return 'Ollama';
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
    generateAIReport,
    callLLM
};
