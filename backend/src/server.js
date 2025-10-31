const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const { logger } = require('./utils/logger');
const { connectDB } = require('./database/connection');
const { connectRedis } = require('./database/redis');
const errorHandler = require('./middleware/errorHandler');
const createSessionConfig = require('./middleware/sessionConfig');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const reportRoutes = require('./routes/reports');
const adminRoutes = require('./routes/admin');
const llmRoutes = require('./routes/llm');
const auditRoutes = require('./routes/audit');
const dicomRoutes = require('./routes/dicom');
const uploadRoutes = require('./routes/uploads');

const app = express();
const PORT = process.env.PORT || 3000;



// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        }
    }
}));

app.use(compression());
// Rate limiting disabled by request: allow unlimited requests per IP

// CORS configuration
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cookie']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Simple cookie parsing without external dependency
app.use((req, res, next) => {
    const cookieHeader = req.headers.cookie;
    req.cookies = {};
    if (cookieHeader) {
        cookieHeader.split(';').forEach(cookie => {
            const [name, value] = cookie.trim().split('=');
            if (name && value) {
                req.cookies[name] = decodeURIComponent(value);
            }
        });
    }
    next();
});

// Session configuration will be added after Redis connection

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// API routes
// Auth routes (no per-IP auth-specific rate limit to avoid blocking logins)
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/llm', llmRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/dicom', dicomRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/demo', uploadRoutes);

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ 
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`
    });
});

// Error handling middleware
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
});

// Start server
async function startServer() {
    try {
        // Connect to database
        await connectDB();
        logger.info('Database connected successfully');
        
        // Connect to Redis
        await connectRedis();
        logger.info('Redis connected successfully');
        
        // Configure session after Redis is connected
        app.use(createSessionConfig());
        
        // Start HTTP server
        app.listen(PORT, '0.0.0.0', () => {
            logger.info(`Server running on port ${PORT}`);
            logger.info(`Environment: ${process.env.NODE_ENV}`);
            logger.info(`CORS Origin: ${process.env.CORS_ORIGIN}`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

module.exports = app;
