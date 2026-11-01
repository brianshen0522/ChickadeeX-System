const crypto = require('crypto');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { getRedis } = require('../database/redis');

const createSessionConfig = () => {
    const redisClient = getRedis();
    return session({
        store: new RedisStore({ 
            client: redisClient,
            prefix: 'medical-reports:sess:',
        }),
        secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
        resave: false,
        saveUninitialized: false,
        name: 'medical-reports-session',
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            maxAge: parseInt(process.env.SESSION_TIMEOUT) || 1800000, // 30 minutes
            sameSite: 'lax'
        },
        rolling: true // Reset expiration on activity
    });
};

module.exports = createSessionConfig;