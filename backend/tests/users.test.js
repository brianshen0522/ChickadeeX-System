const request = require('supertest');
const bcrypt = require('bcryptjs');
const { buildApp, tokenFor, queryAs } = require('./helpers');

jest.mock('../src/utils/audit', () => ({ createAuditLog: jest.fn() }));
jest.mock('../src/database/connection', () => ({ getDB: jest.fn() }));
const mockRedis = { get: jest.fn().mockResolvedValue(null), setEx: jest.fn().mockResolvedValue('OK') };
jest.mock('../src/database/redis', () => ({ getRedis: () => mockRedis }));

const { getDB } = require('../src/database/connection');
const userRoutes = require('../src/routes/users');

const user = { id: 'user-1', email: 'a@example.test', name: 'A', role: 'doctor' };

test('a password change ends other sessions and keeps this one on a new token', async () => {
    const local_password = await bcrypt.hash('old-password', 4);
    const query = jest.fn(async () => ({ rows: [{ id: user.id, local_password }] }));
    getDB.mockReturnValue({ query: queryAs(user, query) });
    const oldToken = tokenFor(user.id);

    const res = await request(buildApp('/api/users', userRoutes))
        .put('/api/users/password')
        .set('Cookie', `auth_token=${oldToken}`)
        .send({ current_password: 'old-password', new_password: 'new-password' })
        .expect(200);

    expect(mockRedis.setEx).toHaveBeenCalledWith(`revoked_before:${user.id}`, 1800, expect.any(String));
    expect(query).toHaveBeenCalledWith('DELETE FROM sessions WHERE user_id = $1', [user.id]);
    expect(res.headers['set-cookie'][0]).toMatch(/^auth_token=.+HttpOnly/);
});
