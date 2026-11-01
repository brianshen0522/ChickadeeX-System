const request = require('supertest');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { buildApp, tokenFor, queryAs } = require('./helpers');

jest.mock('axios');
jest.mock('../src/utils/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));
jest.mock('../src/utils/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('../src/database/connection', () => ({ getDB: jest.fn() }));
jest.mock('../src/database/redis', () => ({ getRedis: jest.fn() }));

const { getDB } = require('../src/database/connection');
const { getRedis } = require('../src/database/redis');
const authRoutes = require('../src/routes/auth');

process.env.KEYCLOAK_CLIENT_ID = 'app-client';

const app = buildApp('/api/auth', authRoutes);
app.use(require('express').urlencoded({ extended: true }));
const kcToken = (azp) => jwt.sign({ azp }, 'keycloak-signs-this');
const user = { id: 'user-1', email: 'a@example.test', name: 'A', role: 'doctor' };

const ssoQuery = (existing) => jest.fn(async (sql) => {
    if (/WHERE u\.keycloak_user_id = \$1/.test(sql)) return { rows: [] };
    if (/WHERE u\.email = \$1/.test(sql)) return { rows: [existing] };
    return { rows: [] };
});

describe('token revocation', () => {
    let redis;
    let query;

    beforeEach(() => {
        redis = { get: jest.fn().mockResolvedValue(null), setEx: jest.fn().mockResolvedValue('OK') };
        query = jest.fn(queryAs(user));
        getRedis.mockReturnValue(redis);
        getDB.mockReturnValue({ query });
    });

    test('logout revokes a token supplied by cookie', async () => {
        const token = tokenFor(user.id);
        await request(app).post('/api/auth/logout').set('Cookie', `auth_token=${token}`).expect(200);

        expect(redis.setEx).toHaveBeenCalledWith(`blacklist:${token}`, 1800, 'revoked');
        expect(query).toHaveBeenCalledWith('DELETE FROM sessions WHERE token = $1', [token]);
    });

    test('a token older than the user revocation marker is rejected', async () => {
        const iat = Math.floor(Date.now() / 1000) - 60;
        const token = jwt.sign({ userId: user.id, iat }, process.env.JWT_SECRET, { expiresIn: '5m' });
        redis.get.mockImplementation(async (key) => (key === `revoked_before:${user.id}` ? String(iat + 1) : null));

        await request(app).get('/api/auth/me').set('Cookie', `auth_token=${token}`).expect(401);
    });

    test('a token issued after the marker still works', async () => {
        const iat = Math.floor(Date.now() / 1000);
        const token = jwt.sign({ userId: user.id, iat }, process.env.JWT_SECRET, { expiresIn: '5m' });
        redis.get.mockImplementation(async (key) => (key === `revoked_before:${user.id}` ? String(iat) : null));

        await request(app).get('/api/auth/me').set('Cookie', `auth_token=${token}`).expect(200);
    });

    test('refresh revokes the previous cookie token', async () => {
        const token = tokenFor(user.id);
        await request(app).post('/api/auth/refresh').set('Cookie', `auth_token=${token}`).expect(200);

        expect(redis.setEx).toHaveBeenCalledWith(`blacklist:${token}`, 1800, 'revoked');
    });
});

describe('SSO account linking', () => {
    const linkedAdmin = {
        id: 'admin-1', email: 'admin@example.test', name: 'Admin', role: 'admin',
        is_active: true, keycloak_user_id: 'subject-a'
    };

    beforeEach(() => {
        axios.get.mockResolvedValue({
            data: { sub: 'subject-b', email: linkedAdmin.email, name: 'Other' }
        });
    });

    test('a different subject cannot take over a linked account by email', async () => {
        const query = ssoQuery(linkedAdmin);
        getDB.mockReturnValue({ query });

        const res = await request(app).post('/api/auth/sso/callback').send({ access_token: kcToken('app-client') });

        expect(res.status).toBe(401);
        expect(res.headers['set-cookie']).toBeUndefined();
    });

    test('a legacy account without a subject is still linked by email', async () => {
        const query = ssoQuery({ ...linkedAdmin, name: 'Other', keycloak_user_id: null });
        getDB.mockReturnValue({ query });

        const res = await request(app).post('/api/auth/sso/callback').send({ access_token: kcToken('app-client') });

        expect(res.status).toBe(200);
        expect(res.body.user.id).toBe(linkedAdmin.id);
    });
});

describe('login request checks', () => {
    beforeEach(() => {
        axios.get.mockResolvedValue({ data: { sub: 'subject-b', email: user.email, name: user.name } });
        getDB.mockReturnValue({ query: ssoQuery({ ...user, is_active: true, keycloak_user_id: 'subject-b' }) });
    });

    test.each([
        ['/api/auth/login', 'email=a%40example.com&password=x'],
        ['/api/auth/sso/callback', `access_token=${kcToken('app-client')}`]
    ])('%s refuses a form post', async (path, body) => {
        const res = await request(app).post(path).type('form').send(body);

        expect(res.status).toBe(415);
        expect(res.headers['set-cookie']).toBeUndefined();
    });

    test('a token issued to another client cannot log in', async () => {
        const res = await request(app)
            .post('/api/auth/sso/callback')
            .send({ access_token: kcToken('other-client') });

        expect(res.status).toBe(401);
        expect(res.headers['set-cookie']).toBeUndefined();
    });

    test('a token issued to this client can log in', async () => {
        await request(app)
            .post('/api/auth/sso/callback')
            .send({ access_token: kcToken('app-client') })
            .expect(200);
    });
});

describe('SSO state', () => {
    beforeEach(() => {
        axios.post.mockReset();
        getDB.mockReturnValue({ query: ssoQuery({ ...user, is_active: true, keycloak_user_id: 'subject-b' }) });
    });

    test('issues a random state in an httpOnly cookie', async () => {
        const res = await request(app).get('/api/auth/sso/state').expect(200);

        expect(res.body.state).toMatch(/^[0-9a-f]{64}$/);
        const cookie = res.headers['set-cookie'][0];
        expect(cookie).toContain(`sso_state=${res.body.state}`);
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('SameSite=Lax');
    });

    test.each([
        ['no cookie', undefined, 'abc'],
        ['no state parameter', 'abc', ''],
        ['a mismatch', 'abc', 'abd']
    ])('rejects a redirect with %s without exchanging the code', async (_, cookie, state) => {
        let call = request(app).get(`/api/auth/sso/redirect?code=x&state=${state}`);
        if (cookie) call = call.set('Cookie', `sso_state=${cookie}`);
        const res = await call;

        expect(res.status).toBe(302);
        expect(res.headers.location).toContain('error=invalid_state');
        expect(axios.post).not.toHaveBeenCalled();
    });

    test('completes the code exchange when the state matches', async () => {
        axios.post.mockResolvedValue({ data: { access_token: 'kc' } });
        axios.get.mockResolvedValue({ data: { sub: 'subject-b', email: user.email, name: user.name } });

        const res = await request(app)
            .get('/api/auth/sso/redirect?code=x&state=abc')
            .set('Cookie', 'sso_state=abc');

        expect(res.status).toBe(302);
        expect(res.headers.location).toContain('sso_success=true');
        expect(axios.post).toHaveBeenCalledTimes(1);
    });
});
