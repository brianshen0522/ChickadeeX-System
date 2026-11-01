const request = require('supertest');
const { buildApp, tokenFor, queryAs } = require('./helpers');

jest.mock('../src/utils/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));
jest.mock('../src/utils/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('../src/services/llm', () => ({ generateAIReport: jest.fn() }));
jest.mock('../src/database/connection', () => ({ getDB: jest.fn() }));
jest.mock('../src/database/redis', () => ({
    getRedis: () => ({ get: jest.fn().mockResolvedValue(null) })
}));

const { getDB } = require('../src/database/connection');
const { generateAIReport } = require('../src/services/llm');
const reportRoutes = require('../src/routes/reports');

const app = buildApp('/api/reports', reportRoutes);
const reportId = '11111111-1111-4111-8111-111111111111';
const doctor = { id: 'doctor-1', email: 'd@example.test', name: 'D', role: 'doctor' };
const cookie = `auth_token=${tokenFor(doctor.id)}`;
const finalizedAt = new Date('2025-01-01');

describe('finalized reports', () => {
    test('reject a new version', async () => {
        const handler = jest.fn(async (sql) => (
            /FROM reports WHERE id = \$1/.test(sql)
                ? { rows: [{ id: reportId, doctor_id: doctor.id, finalized_at: finalizedAt }] }
                : { rows: [] }
        ));
        getDB.mockReturnValue({ query: queryAs(doctor, handler) });

        await request(app)
            .post(`/api/reports/${reportId}/versions`)
            .set('Cookie', cookie)
            .send({ findings: 'f', impression: 'i' })
            .expect(400);

        expect(handler.mock.calls.some(([sql]) => /INSERT INTO report_versions/.test(sql))).toBe(false);
    });

    test('reject AI generation', async () => {
        getDB.mockReturnValue({
            query: queryAs(doctor, async () => ({
                rows: [{ id: reportId, finalized_at: finalizedAt, study_instance_uid: '1.2' }]
            }))
        });

        await request(app).post(`/api/reports/${reportId}/generate`).set('Cookie', cookie).send({}).expect(400);

        expect(generateAIReport).not.toHaveBeenCalled();
    });

    test('drafts still accept a new version', async () => {
        const handler = async (sql) => {
            if (/FROM reports WHERE id = \$1/.test(sql)) {
                return { rows: [{ id: reportId, doctor_id: doctor.id, finalized_at: null }] };
            }
            if (/next_version/.test(sql)) return { rows: [{ next_version: 1 }] };
            if (/INSERT INTO report_versions/.test(sql)) return { rows: [{ version_no: 1 }] };
            return { rows: [] };
        };
        getDB.mockReturnValue({ query: queryAs(doctor, handler) });

        await request(app)
            .post(`/api/reports/${reportId}/versions`)
            .set('Cookie', cookie)
            .send({ findings: 'f', impression: 'i' })
            .expect(201);
    });
});

test('a report without versions cannot be finalized', async () => {
    // PostgreSQL returns COUNT(*) as a string
    const handler = jest.fn(async () => ({ rows: [{ id: reportId, finalized_at: null, version_count: '0' }] }));
    getDB.mockReturnValue({ query: queryAs(doctor, handler) });

    await request(app).post(`/api/reports/${reportId}/finalize`).set('Cookie', cookie).expect(400);

    expect(handler.mock.calls.some(([sql]) => /UPDATE reports/.test(sql))).toBe(false);
});

test('CSV export quotes cells and neutralises formulas', async () => {
    getDB.mockReturnValue({
        query: queryAs(doctor, async () => ({
            rows: [{
                study_instance_uid: '1.2',
                patient_id: 'P1',
                patient_name: '=HYPERLINK("http://example.test")',
                doctor_name: 'Doe, Jane',
                created_at: 'c',
                versions: [{ findings: '+1+1', impression: 'plain\ntext' }]
            }]
        }))
    });

    const res = await request(app)
        .get(`/api/reports/${reportId}/export?format=csv`)
        .set('Cookie', cookie)
        .expect(200);

    const row = res.text.split('\n').slice(1).join('\n');
    expect(row).toContain('"\'=HYPERLINK(""http://example.test"")"');
    expect(row).toContain('"Doe, Jane"');
    expect(row).toContain('"\'+1+1"');
    expect(row).toContain('"plain\ntext"');
});
