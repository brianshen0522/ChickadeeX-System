const { logger } = require('../utils/logger');

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

    // Specific error types
    if (error.name === 'ValidationError') {
        status = 400;
        message = 'Validation Error';
    } else if (error.name === 'UnauthorizedError') {
        status = 401;
        message = 'Unauthorized';
    } else if (error.name === 'ForbiddenError') {
        status = 403;
        message = 'Forbidden';
    } else if (error.name === 'NotFoundError') {
        status = 404;
        message = 'Not Found';
    } else if (error.code === '23505') { // PostgreSQL unique violation
        status = 409;
        message = 'Resource already exists';
    } else if (error.code === '23503') { // PostgreSQL foreign key violation
        status = 400;
        message = 'Referenced resource does not exist';
    } else if (error.code === '23502') { // PostgreSQL not null violation
        status = 400;
        message = 'Required field missing';
    }

    // Don't expose internal error details in production
    const response = {
        error: message,
        ...(process.env.NODE_ENV === 'development' && { 
            details: error.message,
            stack: error.stack 
        })
    };

    res.status(status).json(response);
};

module.exports = errorHandler;