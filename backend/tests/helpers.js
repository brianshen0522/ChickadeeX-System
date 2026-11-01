const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-only-secret';

// The same minimal cookie handling that server.js applies
const parseCookies = (req, res, next) => {
    req.cookies = {};
    (req.headers.cookie || '').split(';').forEach((cookie) => {
        const [name, value] = cookie.trim().split('=');
        if (name && value) req.cookies[name] = decodeURIComponent(value);
    });
    next();
};

const buildApp = (mountPath, router) => {
    const app = express();
    app.use(express.json());
    app.use(parseCookies);
    app.use(mountPath, router);
    return app;
};

const tokenFor = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '5m' });

// Answers the lookup made by authenticateToken, then defers to the test's handler
const queryAs = (user, handler = () => ({ rows: [] })) => async (sql, params) => {
    if (/WHERE u\.id = \$1 AND u\.is_active = true/.test(sql)) {
        return { rows: [{ is_active: true, ...user }] };
    }
    return handler(sql, params);
};

module.exports = { buildApp, tokenFor, queryAs };
