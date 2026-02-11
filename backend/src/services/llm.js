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

const generateAIReport = async (params, onStageEvent = null) => {
    const { studyDescription, modality, clinicalContext, previousContent, dicom } = params;

    try {
        const db = getDB();

        // Unified priority query: UNION ALL from llm_configs and llm_pipelines
        const query = `
            SELECT id, name, model_name, api_url, api_key, prompt, priority,
                   max_tokens, temperature, top_p,
                   'single' AS config_type,
                   NULL AS stage1_model_name, NULL AS stage1_api_url, NULL AS stage1_api_key, NULL AS stage1_prompt,
                   NULL AS stage1_max_tokens, NULL AS stage1_temperature, NULL AS stage1_top_p, NULL::boolean AS stage1_include_image,
                   NULL AS stage2_model_name, NULL AS stage2_api_url, NULL AS stage2_api_key, NULL AS stage2_prompt,
                   NULL AS stage2_max_tokens, NULL AS stage2_temperature, NULL AS stage2_top_p, NULL::boolean AS stage2_include_image
            FROM llm_configs
            WHERE enabled = true
            UNION ALL
            SELECT id, name, NULL AS model_name, NULL AS api_url, NULL AS api_key, NULL AS prompt, priority,
                   NULL AS max_tokens, NULL AS temperature, NULL AS top_p,
                   'pipeline' AS config_type,
                   stage1_model_name, stage1_api_url, stage1_api_key, stage1_prompt,
                   stage1_max_tokens, stage1_temperature, stage1_top_p, stage1_include_image,
                   stage2_model_name, stage2_api_url, stage2_api_key, stage2_prompt,
                   stage2_max_tokens, stage2_temperature, stage2_top_p, stage2_include_image
            FROM llm_pipelines
            WHERE enabled = true
            ORDER BY priority ASC
        `;

        const result = await db.query(query);

        if (result.rows.length === 0) {
            throw new Error('No enabled LLM configurations found');
        }

        // Try each config/pipeline in priority order
        for (const row of result.rows) {
            try {
                if (row.config_type === 'pipeline') {
                    logger.info(`Trying pipeline: ${row.name} (priority ${row.priority})`);
                    return await executePipeline(row, params, onStageEvent);
                }

                // Single config
                const decryptedKey = decryptSecret(row.api_key);
                const configWithKey = { ...row, api_key: decryptedKey };
                logger.info(`Trying LLM: ${row.name} (priority ${row.priority})`);

                if (onStageEvent) onStageEvent({ stage: 1, status: 'running', total: 1, model: row.model_name });

                const response = await callLLM(configWithKey, {
                    studyDescription,
                    modality,
                    clinicalContext,
                    previousContent,
                    dicom
                });

                if (onStageEvent) onStageEvent({ stage: 1, status: 'complete', total: 1, model: row.model_name });

                const isSuccess = typeof response.isSuccess === 'boolean' ? response.isSuccess : true;
                const message = typeof response.msg === 'string' ? response.msg.trim() : '';

                return {
                    findings: response.findings,
                    impression: response.impression,
                    model_used: row.model_name,
                    model_config: {
                        name: row.name,
                        provider: getProviderName(row.api_url),
                        temperature: row.temperature,
                        max_tokens: row.max_tokens,
                        top_p: row.top_p,
                        priority: row.priority
                    },
                    isSuccess,
                    msg: message
                };

            } catch (error) {
                logger.warn(`LLM ${row.name} failed: ${error.message}`);
                // Continue to next config/pipeline
            }
        }

        throw new Error('All LLM configurations failed');

    } catch (error) {
        logger.error('AI report generation failed:', error);
        throw error;
    }
};

/**
 * Execute a two-stage pipeline
 */
const executePipeline = async (pipeline, params, onStageEvent = null) => {
    const { studyDescription, modality, clinicalContext, previousContent, dicom } = params;

    // --- Stage 1 ---
    const stage1Config = {
        model_name: pipeline.stage1_model_name,
        api_url: pipeline.stage1_api_url,
        api_key: decryptSecret(pipeline.stage1_api_key),
        prompt: pipeline.stage1_prompt,
        max_tokens: pipeline.stage1_max_tokens,
        temperature: pipeline.stage1_temperature,
        top_p: pipeline.stage1_top_p
    };

    if (onStageEvent) onStageEvent({ stage: 1, status: 'running', total: 2, model: stage1Config.model_name });

    const stage1Params = {
        studyDescription,
        modality,
        clinicalContext,
        previousContent,
        dicom: pipeline.stage1_include_image ? dicom : undefined
    };

    const stage1Response = await callLLM(stage1Config, stage1Params, { skipImageCheck: !pipeline.stage1_include_image });

    if (onStageEvent) onStageEvent({ stage: 1, status: 'complete', total: 2, model: stage1Config.model_name });

    // Build stage 1 output text for injection into stage 2
    const stage1Findings = Array.isArray(stage1Response.findings) ? stage1Response.findings.join('\n') : (stage1Response.findings || '');
    const stage1Impression = Array.isArray(stage1Response.impression) ? stage1Response.impression.join('\n') : (stage1Response.impression || '');
    const stage1Output = `FINDINGS:\n${stage1Findings}\n\nIMPRESSION:\n${stage1Impression}`;

    // --- Stage 2 ---
    const stage2Config = {
        model_name: pipeline.stage2_model_name,
        api_url: pipeline.stage2_api_url,
        api_key: decryptSecret(pipeline.stage2_api_key),
        prompt: pipeline.stage2_prompt,
        max_tokens: pipeline.stage2_max_tokens,
        temperature: pipeline.stage2_temperature,
        top_p: pipeline.stage2_top_p
    };

    if (onStageEvent) onStageEvent({ stage: 2, status: 'running', total: 2, model: stage2Config.model_name });

    const stage2Params = {
        studyDescription,
        modality,
        clinicalContext,
        previousContent: stage1Output,
        dicom: pipeline.stage2_include_image ? dicom : undefined,
        stage1Output
    };

    const stage2Response = await callLLM(stage2Config, stage2Params, { skipImageCheck: !pipeline.stage2_include_image });

    if (onStageEvent) onStageEvent({ stage: 2, status: 'complete', total: 2, model: stage2Config.model_name });

    const isSuccess = typeof stage2Response.isSuccess === 'boolean' ? stage2Response.isSuccess : true;
    const message = typeof stage2Response.msg === 'string' ? stage2Response.msg.trim() : '';

    return {
        findings: stage2Response.findings,
        impression: stage2Response.impression,
        model_used: `${stage1Config.model_name} -> ${stage2Config.model_name}`,
        model_config: {
            name: pipeline.name,
            provider: `${getProviderName(stage1Config.api_url)} -> ${getProviderName(stage2Config.api_url)}`,
            priority: pipeline.priority
        },
        isSuccess,
        msg: message
    };
};

/**
 * Call specific LLM with configuration
 */
const callLLM = async (config, params, options = {}) => {
    const { studyDescription, modality, clinicalContext, previousContent, dicom, stage1Output } = params;
    const { skipImageCheck = false } = options;

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
        imageMimeType: dicom?.imageMimeType || 'image/jpeg',
        stage1Output: stage1Output || ''
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
    if (!hasImage && !skipImageCheck) {
        throw new Error('Image preview required for AI generation');
    }

    const apiUrl = config.api_url.toLowerCase();
    const imageDescriptor = hasImage ? {
        url: dicom?.imageUrl || '',
        mimeType: dicom?.imageMimeType || 'image/jpeg',
        localPath: dicom?.imagePath || '',
        base64: dicom?.imageBase64 || ''
    } : {};
    
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
    callLLM,
    getProviderName
};
