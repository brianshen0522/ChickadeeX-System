const Joi = require('joi');

const toJoiSchema = (schema) => {
    // Accept either a Joi schema (with validate) or a plain object definition
    if (schema && typeof schema.validate === 'function') return schema;
    return Joi.object(schema || {});
};

const validateRequest = (schema) => {
    return (req, res, next) => {
        const joiSchema = toJoiSchema(schema);
        const { error } = joiSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                error: 'Validation Error',
                details: error.details.map(detail => detail.message)
            });
        }
        next();
    };
};

const validateParams = (schema) => {
    return (req, res, next) => {
        const joiSchema = toJoiSchema(schema);
        const { error } = joiSchema.validate(req.params);
        if (error) {
            return res.status(400).json({
                error: 'Validation Error',
                details: error.details.map(detail => detail.message)
            });
        }
        next();
    };
};

const validateQuery = (schema) => {
    return (req, res, next) => {
        const joiSchema = toJoiSchema(schema);
        const { error } = joiSchema.validate(req.query);
        if (error) {
            return res.status(400).json({
                error: 'Validation Error',
                details: error.details.map(detail => detail.message)
            });
        }
        next();
    };
};

// Common validation schemas
const schemas = {
    uuid: Joi.string().uuid().required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    
    login: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().required()
    }),
    
    createUser: Joi.object({
        email: Joi.string().email().required(),
        name: Joi.string().min(1).max(255).required(),
        role: Joi.string().valid('admin', 'doctor', 'researcher', 'observer').required(),
        password: Joi.string().min(8).optional()
    }),
    
    updateUser: Joi.object({
        name: Joi.string().min(1).max(255).optional(),
        is_active: Joi.boolean().optional(),
        password: Joi.string().min(8).optional()
    }),

    setUserRole: Joi.object({
        role: Joi.string().valid('admin', 'doctor', 'researcher', 'observer').required()
    }),
    
    updateProfile: Joi.object({
        name: Joi.string().min(1).max(255).required()
    }),
    
    updatePassword: Joi.object({
        // If a local password exists, the route will enforce requiring this.
        // If no local password exists, only new_password is required.
        current_password: Joi.string().allow('', null),
        new_password: Joi.string().min(8).required()
    }),
    
    createReport: Joi.object({
        study_instance_uid: Joi.string().required(),
        patient_id: Joi.string().required(),
        patient_name: Joi.string().optional(),
        patient_dob: Joi.date().optional(),
        study_date: Joi.date().optional(),
        study_description: Joi.string().optional(),
        modality: Joi.string().max(10).optional()
    }),
    
    createReportVersion: Joi.object({
        findings: Joi.string().required(),
        impression: Joi.string().required(),
        template_used: Joi.string().allow('', null).optional()
    }),
    
    updateReportVersion: Joi.object({
        findings: Joi.string().optional(),
        impression: Joi.string().optional()
    }).custom((value, helpers) => {
        if (!value.findings && !value.impression) {
            return helpers.error('any.required');
        }
        return value;
    }, 'at least one field'),
    
    updateReportDescription: Joi.object({
        study_description: Joi.string().allow('', null).optional()
    }),
    
    llmConfig: Joi.object({
        name: Joi.string().min(1).max(255).optional(),
        model_name: Joi.string().required(),
        api_url: Joi.string().uri().required(),
        api_key: Joi.string().required(), // supports "header:Key=Value" or "headers:{...}"
        prompt: Joi.string().allow('', null).optional(),
        priority: Joi.number().integer().min(1).optional(),
        enabled: Joi.boolean().optional(),
        max_tokens: Joi.number().integer().min(256).max(4096).optional(),
        temperature: Joi.number().min(0).max(1).optional(),
        top_p: Joi.number().min(0.1).max(1).optional()
    }),
    
    pacsConfig: Joi.object({
        pacs_url: Joi.string().uri().required(),
        auth_type: Joi.string().valid('none', 'basic', 'token').required(),
        credentials: Joi.object().optional(),
        connection_timeout: Joi.number().integer().min(1).max(300).optional(),
        query_timeout: Joi.number().integer().min(1).max(600).optional()
    }),
    
    ragConfig: Joi.object({
        rag_url: Joi.string().uri().required(),
        enabled: Joi.boolean().optional(),
        api_key: Joi.string().optional(),
        timeout: Joi.number().integer().min(1).max(300).optional(),
        confidence_threshold: Joi.number().min(0).max(1).optional()
    }),
    
    systemSettings: Joi.object({
        system_name: Joi.string().min(1).max(255).optional(),
        max_concurrent_tasks: Joi.number().integer().min(1).max(1000).optional(),
        backup_frequency: Joi.string().min(1).max(255).optional()
    }),
    
    reportSearch: Joi.object({
        patient_id: Joi.string().optional(),
        patient_name: Joi.string().optional(),
        study_instance_uid: Joi.string().optional(),
        study_date_from: Joi.date().optional(),
        study_date_to: Joi.date().optional(),
        report_date_from: Joi.date().optional(),
        report_date_to: Joi.date().optional(),
        modality: Joi.string().optional(),
        doctor_id: Joi.string().uuid().optional(),
        finalized_only: Joi.boolean().optional(),
        draft_only: Joi.boolean().optional(),
        limit: Joi.number().integer().min(1).max(100).optional(),
        offset: Joi.number().integer().min(0).optional()
    })
};

module.exports = {
    validateRequest,
    validateParams,
    validateQuery,
    schemas
};
