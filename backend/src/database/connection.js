const { Pool } = require('pg');
const { logger } = require('../utils/logger');

let pool;

const connectDB = async () => {
    try {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: false,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
            statement_timeout: 30000,
        });

        pool.on('error', (err) => {
            logger.error('Unexpected database client error:', err);
        });

        // Test the connection
        const client = await pool.connect();
        await client.query('SELECT NOW()');
        client.release();
        
        logger.info('PostgreSQL connected successfully');
        return pool;
    } catch (error) {
        logger.error('Database connection error:', error);
        throw error;
    }
};

const getDB = () => {
    if (!pool) {
        throw new Error('Database not connected. Call connectDB first.');
    }
    return pool;
};

const closeDB = async () => {
    if (pool) {
        await pool.end();
        logger.info('Database connection closed');
    }
};

module.exports = {
    connectDB,
    getDB,
    closeDB
};
