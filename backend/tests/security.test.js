const { test, describe } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.ADMIN_API_KEY = 'test_super_secure_admin_key_987654321';
process.env.DATABASE_PATH = ':memory:';
process.env.FRONTEND_ORIGIN = 'https://trusted.github.io,http://localhost:3000';

const app = require('../server');

describe('Security & Infrastructure Tests', () => {
  test('GET /api/health — Returns operational system status and version (200)', async () => {
    const res = await request(app).get('/api/health');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'ok');
    assert.strictEqual(res.body.database, 'connected');
    assert.strictEqual(typeof res.body.telegramConfigured, 'boolean');
    assert.ok(typeof res.body.uptimeSeconds === 'number');
    assert.ok(res.body.version);
  });

  test('Reverse Proxy Trust — Express is configured with trust proxy = 1 for Render', async () => {
    assert.strictEqual(app.get('trust proxy'), 1);

    // Test that X-Forwarded-For header is handled cleanly by rate limiter without warnings/errors
    const res = await request(app)
      .get('/api/health')
      .set('X-Forwarded-For', '198.51.100.25');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'ok');
  });

  test('Security Headers — Helmet sets appropriate protection headers', async () => {
    const res = await request(app).get('/api/health');

    // Helmet default headers
    assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(res.headers['x-frame-options'], 'SAMEORIGIN');
    assert.ok(res.headers['cross-origin-resource-policy']);
  });

  test('CORS — Allows pre-approved origin in whitelist', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'https://trusted.github.io');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers['access-control-allow-origin'], 'https://trusted.github.io');
  });

  test('CORS — Allows Vercel admin authentication preflight', async () => {
    const origin = 'https://news-kerala-vision-malayalam-fronte-five.vercel.app';
    const res = await request(app)
      .options('/api/admin/permanent-link')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-admin-key');

    assert.strictEqual(res.status, 204);
    assert.strictEqual(res.headers['access-control-allow-origin'], origin);
    assert.match(res.headers['access-control-allow-methods'], /POST/);
    assert.match(res.headers['access-control-allow-headers'], /x-admin-key/i);
  });

  test('CORS — Blocks unapproved third-party origin in production mode', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'https://malicious-site.com');

    assert.strictEqual(res.status, 403);
    assert.match(res.body.error, /CORS blocked/i);

    process.env.NODE_ENV = prevEnv;
  });

  test('404 Route Handling — Returns structured JSON for unknown routes', async () => {
    const res = await request(app).get('/api/unknown-endpoint');

    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.success, false);
    assert.match(res.body.error, /Route not found/i);
  });

  test('Server Auth Configuration — Fails with 500 when ADMIN_API_KEY is not set', async () => {
    const originalKey = process.env.ADMIN_API_KEY;
    delete process.env.ADMIN_API_KEY;

    const res = await request(app)
      .post('/api/sessions')
      .set('X-Admin-Key', 'any_key')
      .send({ durationMinutes: 30 });

    assert.strictEqual(res.status, 500);
    assert.strictEqual(res.body.success, false);
    assert.match(res.body.error, /not configured/i);

    process.env.ADMIN_API_KEY = originalKey;
  });

  test('Production Error Sanitization — Never leaks internal details on 500 in production', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    // Call sessions endpoint with missing key to trigger 500
    const originalKey = process.env.ADMIN_API_KEY;
    delete process.env.ADMIN_API_KEY;

    const res = await request(app)
      .post('/api/sessions')
      .set('X-Admin-Key', 'test')
      .send({});

    assert.strictEqual(res.status, 500);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error, 'An internal server error occurred.');
    assert.strictEqual(res.body.stack, undefined);

    process.env.ADMIN_API_KEY = originalKey;
    process.env.NODE_ENV = prevEnv;
  });
});
