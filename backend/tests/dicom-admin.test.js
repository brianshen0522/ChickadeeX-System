const request = require('supertest');
const axios = require('axios');
const { buildApp, tokenFor, queryAs } = require('./helpers');

jest.mock('axios');
jest.mock('../src/utils/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));
jest.mock('../src/utils/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('../src/services/llm', () => ({ callLLM: jest.fn() }));
jest.mock('../src/database/connection', () => ({ getDB: jest.fn() }));
jest.mock('../src/database/redis', () => ({
    getRedis: () => ({ get: jest.fn().mockResolvedValue(null) })
}));

const { getDB } = require('../src/database/connection');
const dicomRoutes = require('../src/routes/dicom');
const adminRoutes = require('../src/routes/admin');

const doctor = { id: 'doctor-1', role: 'doctor' };
const admin = { id: 'admin-1', role: 'admin' };
const targetId = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
    axios.get.mockReset();
});

describe('study download', () => {
    const app = buildApp('/api/dicom', dicomRoutes);
    const cookie = `auth_token=${tokenFor(doctor.id)}`;

    beforeEach(() => {
        getDB.mockReturnValue({
            query: queryAs(doctor, async () => ({
                rows: [{ pacs_url: 'http://pacs.test/dicom-web', auth_type: 'none' }]
            }))
        });
    });

    test.each(['..', '.', '..%2F..%2Fsystem', 'a%22b', '1.2%0d%0ax'])('rejects study UID %s', async (uid) => {
        await request(app).get(`/api/dicom/studies/${uid}/download`).set('Cookie', cookie).expect(400);

        expect(axios.get).not.toHaveBeenCalled();
    });

    test('accepts a DICOM UID', async () => {
        const { Readable } = require('stream');
        axios.get.mockResolvedValue({ headers: {}, data: Readable.from(['zip']) });

        await request(app).get('/api/dicom/studies/1.2.840.113619.2/download').set('Cookie', cookie).expect(200);

        expect(axios.get.mock.calls[0][0]).toBe('http://pacs.test/dicom-web/studies/1.2.840.113619.2');
    });
});

describe('admin outbound configuration', () => {
    const app = buildApp('/api/admin', adminRoutes);
    const cookie = `auth_token=${tokenFor(admin.id)}`;
    const stored = [
        { api_url: 'http://llm-a.test/v1/chat/completions', api_key: 'stored-key-a' },
        { api_url: 'http://llm-b.test/v1/chat/completions', api_key: 'stored-key-b' }
    ];

    beforeEach(() => {
        getDB.mockReturnValue({ query: queryAs(admin, async () => ({ rows: stored })) });
        axios.get.mockResolvedValue({
            status: 200,
            headers: { 'content-type': 'application/json' },
            data: { data: [{ id: 'model-1' }] }
        });
    });

    test('a stored key is not sent to an unrelated endpoint', async () => {
        await request(app)
            .post('/api/admin/llm-models')
            .set('Cookie', cookie)
            .send({ provider: 'other', api_key: 'USE_STORED_KEY', endpoint: 'http://unrelated.test/v1' })
            .expect(400);

        expect(axios.get).not.toHaveBeenCalled();
    });

    test('a stored key is matched to its own host', async () => {
        await request(app)
            .post('/api/admin/llm-models')
            .set('Cookie', cookie)
            .send({ provider: 'other', api_key: 'USE_STORED_KEY', endpoint: 'http://llm-b.test/v1' })
            .expect(200);

        expect(axios.get.mock.calls[0][1].headers.Authorization).toBe('Bearer stored-key-b');
    });

    test('a key entered by the admin still works with any endpoint', async () => {
        await request(app)
            .post('/api/admin/llm-models')
            .set('Cookie', cookie)
            .send({ provider: 'other', api_key: 'typed-key', endpoint: 'http://new-llm.test/v1' })
            .expect(200);

        expect(axios.get.mock.calls[0][1].headers.Authorization).toBe('Bearer typed-key');
    });

    test('non-JSON model responses are not echoed back', async () => {
        axios.get.mockResolvedValue({ status: 200, headers: { 'content-type': 'text/html' }, data: 'internal page' });

        const res = await request(app)
            .post('/api/admin/llm-models')
            .set('Cookie', cookie)
            .send({ provider: 'other', api_key: 'typed-key', endpoint: 'http://new-llm.test/v1' })
            .expect(502);

        expect(JSON.stringify(res.body)).not.toContain('internal page');
    });

    test.each(['file:///etc/passwd', 'ftp://pacs.test/'])('rejects PACS URL %s', async (pacsUrl) => {
        await request(app)
            .post('/api/admin/pacs-config')
            .set('Cookie', cookie)
            .send({ pacs_url: pacsUrl, auth_type: 'none' })
            .expect(400);
    });

    test('rejects a non-HTTP LLM URL on update and keeps other fields optional', async () => {
        const url = `/api/admin/llm-configs/${targetId}`;
        await request(app).put(url).set('Cookie', cookie).send({ api_url: 'file:///etc/passwd' }).expect(400);

        getDB.mockReturnValue({ query: queryAs(admin, async () => ({ rows: [{ id: targetId }] })) });
        await request(app).put(url).set('Cookie', cookie).send({ enabled: false, id: targetId }).expect(200);
    });
});

test('user deletion runs its transaction on a single connection', async () => {
    const client = {
        query: jest.fn(async (sql) => {
            if (/FROM users u JOIN roles r/.test(sql)) return { rows: [{ id: targetId, role: 'doctor' }] };
            if (/FROM reports/.test(sql)) return { rows: [{ count: 0 }] };
            return { rows: [] };
        }),
        release: jest.fn()
    };
    const pool = { query: jest.fn(queryAs(admin)), connect: jest.fn().mockResolvedValue(client) };
    getDB.mockReturnValue(pool);

    await request(buildApp('/api/admin', adminRoutes))
        .delete(`/api/admin/users/${targetId}`)
        .set('Cookie', `auth_token=${tokenFor(admin.id)}`)
        .expect(200);

    const statements = client.query.mock.calls.map(([sql]) => sql);
    expect(statements).toContain('BEGIN');
    expect(statements).toContain('COMMIT');
    expect(pool.query.mock.calls.some(([sql]) => sql === 'BEGIN')).toBe(false);
    expect(client.release).toHaveBeenCalledTimes(1);
});
