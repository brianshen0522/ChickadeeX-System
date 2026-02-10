const { logger } = require('../utils/logger');
const AppError = require('../utils/AppError');

const errorHandler = (error, req, res, next) => {
    logger.error('Error caught by error handler:', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });

    // Default error
    let status = 500;
    let message = 'Internal Server Error';
    let code = 'INTERNAL_ERROR';

    if (error instanceof AppError) {
        status = error.statusCode || 500;
        message = error.message || message;
        code = error.code || code;
    } else if (error.name === 'ValidationError') {
        status = 400;
        message = 'Validation Error';
        code = 'VALIDATION_ERROR';
    } else if (error.name === 'UnauthorizedError') {
        status = 401;
        message = 'Unauthorized';
        code = 'UNAUTHORIZED';
    } else if (error.name === 'ForbiddenError') {
        status = 403;
        message = 'Forbidden';
        code = 'FORBIDDEN';
    } else if (error.name === 'NotFoundError') {
        status = 404;
        message = 'Not Found';
        code = 'NOT_FOUND';
    } else if (error.code === '23505') { // PostgreSQL unique violation
        status = 409;
        message = 'Resource already exists';
        code = 'CONFLICT';
    } else if (error.code === '23503') { // PostgreSQL foreign key violation
        status = 400;
        message = 'Referenced resource does not exist';
        code = 'INVALID_REFERENCE';
    } else if (error.code === '23502') { // PostgreSQL not null violation
        status = 400;
        message = 'Required field missing';
        code = 'MISSING_FIELD';
    }

    // Don't expose internal error details in production
    const response = {
        error: message,
        code,
        ...(process.env.NODE_ENV === 'development' && { 
            details: error.message,
            stack: error.stack 
        })
    };

    res.status(status).json(response);
};

module.exports = errorHandler;
