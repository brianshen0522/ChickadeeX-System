const redis = require('redis');
const { logger } = require('../utils/logger');

let client;

const connectRedis = async () => {
    try {
        client = redis.createClient({
            url: process.env.REDIS_URL,
            retry_strategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            }
        });

        client.on('error', (err) => {
            logger.error('Redis Client Error:', err);
        });

        client.on('connect', () => {
            logger.info('Redis connected successfully');
        });

        client.on('ready', () => {
            logger.info('Redis ready for commands');
        });

        client.on('end', () => {
            logger.info('Redis connection ended');
        });

        await client.connect();
        return client;
    } catch (error) {
        logger.error('Redis connection error:', error);
        throw error;
    }
};

const getRedis = () => {
    if (!client) {
        throw new Error('Redis not connected. Call connectRedis first.');
    }
    return client;
};

const closeRedis = async () => {
    if (client) {
        await client.quit();
        logger.info('Redis connection closed');
    }
};

module.exports = {
    connectRedis,
    getRedis,
    closeRedis
};