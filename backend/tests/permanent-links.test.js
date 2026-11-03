const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.ADMIN_API_KEY = 'test_super_secure_admin_key_987654321';
process.env.DATABASE_PATH = ':memory:';

const app = require('../server');
const db = require('../services/db');

describe('Permanent reusable demo link', () => {
  before(() => db.initDatabase(':memory:'));
  after(() => db.closeDatabase());

  test('management endpoints require administrator authentication', async () => {
    const getRes = await request(app).get('/api/admin/permanent-link');
    const createRes = await request(app).post('/api/admin/permanent-link');
    assert.strictEqual(getRes.status, 401);
    assert.strictEqual(createRes.status, 401);
  });

  test('one permanent token can be disabled, re-enabled, and revoked without expiry', async () => {
    const headers = { 'X-Admin-Key': process.env.ADMIN_API_KEY };
    const createRes = await request(app).post('/api/admin/permanent-link').set(headers);
    assert.strictEqual(createRes.status, 201);
    assert.strictEqual(createRes.body.link.status, 'enabled');
    assert.match(createRes.body.link.token, /^[a-f0-9]{64}$/i);
    assert.strictEqual(createRes.body.link.expiresAt, undefined);

    const linkId = createRes.body.link.id;
    const token = createRes.body.link.token;
    const reloadRes = await request(app).get('/api/admin/permanent-link').set(headers);
    assert.strictEqual(reloadRes.status, 200);
    assert.strictEqual(reloadRes.body.link.token, token);

    const disabledRes = await request(app)
      .post(`/api/admin/permanent-link/${linkId}/status`)
      .set(headers)
      .send({ enabled: false });
    assert.strictEqual(disabledRes.body.link.status, 'disabled');

    const blockedRes = await request(app)
      .post('/api/sessions/demo')
      .send({ permanentLinkToken: token });
    assert.strictEqual(blockedRes.status, 403);

    const enabledRes = await request(app)
      .post(`/api/admin/permanent-link/${linkId}/status`)
      .set(headers)
      .send({ enabled: true });
    assert.strictEqual(enabledRes.body.link.status, 'enabled');

    const revokeRes = await request(app)
      .post(`/api/admin/permanent-link/${linkId}/revoke`)
      .set(headers);
    assert.strictEqual(revokeRes.body.link.status, 'revoked');

    const revokedRes = await request(app)
      .post('/api/sessions/demo')
      .send({ permanentLinkToken: token });
    assert.strictEqual(revokedRes.status, 403);

    const replacementRes = await request(app).post('/api/admin/permanent-link').set(headers);
    assert.strictEqual(replacementRes.status, 201);
    assert.notStrictEqual(replacementRes.body.link.token, token);
  });

  test('five visitors get distinct sessions and disabling the link does not mix their state', async () => {
    const headers = { 'X-Admin-Key': process.env.ADMIN_API_KEY };
    const linkRes = await request(app).post('/api/admin/permanent-link').set(headers);
    const link = linkRes.body.link;

    const visitorResponses = await Promise.all(Array.from({ length: 5 }, () => request(app)
      .post('/api/sessions/demo')
      .send({ permanentLinkToken: link.token })));
    assert.ok(visitorResponses.every(response => response.status === 201));

    const visitorIds = visitorResponses.map(response => response.body.session.id);
    assert.strictEqual(new Set(visitorIds).size, 5);
    assert.ok(visitorResponses.every(response => response.body.session.permanentLinkId === undefined));

    const revokeVisitorRes = await request(app)
      .post(`/api/sessions/${visitorIds[0]}/revoke`)
      .set(headers);
    assert.strictEqual(revokeVisitorRes.status, 200);

    const siblingRes = await request(app).get(`/api/sessions/${visitorIds[1]}`);
    assert.strictEqual(siblingRes.status, 200);
    assert.strictEqual(siblingRes.body.status, 'created');

    const disableRes = await request(app)
      .post(`/api/admin/permanent-link/${link.id}/status`)
      .set(headers)
      .send({ enabled: false });
    assert.strictEqual(disableRes.body.link.status, 'disabled');

    const disabledVisitorRes = await request(app).get(`/api/sessions/${visitorIds[1]}`);
    assert.strictEqual(disabledVisitorRes.status, 200);
    assert.strictEqual(disabledVisitorRes.body.status, 'revoked');
  });

  test('legacy administrator session links remain single-use and expire independently', async () => {
    const headers = { 'X-Admin-Key': process.env.ADMIN_API_KEY };
    const sourceRes = await request(app)
      .post('/api/sessions')
      .set(headers)
      .send({ label: 'Single-use option', durationMinutes: 15 });
    const sourceSessionId = sourceRes.body.session.id;

    const firstVisitor = await request(app)
      .post('/api/sessions/demo')
      .send({ sourceSessionId });
    assert.strictEqual(firstVisitor.status, 201);

    const secondVisitor = await request(app)
      .post('/api/sessions/demo')
      .send({ sourceSessionId });
    assert.strictEqual(secondVisitor.status, 409);
  });
});
