const { test, describe, before, beforeEach, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.ADMIN_API_KEY = 'test_super_secure_admin_key_987654321';
process.env.TELEGRAM_BOT_TOKEN = '123456789:MockTelegramTokenForAutomatedTesting';
process.env.TELEGRAM_CHAT_ID = '987654321';
process.env.DATABASE_PATH = ':memory:';

const app = require('../server');
const db = require('../services/db');
const telegramService = require('../services/telegram');

// Minimal valid 1x1 JPEG buffer for testing
const TINY_JPEG_BUFFER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
  0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
  0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
  0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
  0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x09, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00,
  0x3f, 0x00, 0xbf, 0x00, 0xff, 0xd9
]);

describe('Photo Submission & Telegram Integration API', () => {
  before(() => {
    db.initDatabase(':memory:');
  });

  after(() => {
    db.closeDatabase();
  });

  test('POST /api/sessions/:id/photo — Successfully delivers photo via Mocked Telegram API (200)', async () => {
    // 1. Mock Telegram API fetch with success
    telegramService.customFetch = async (url, options) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: { message_id: 12345 }
        })
      };
    };

    // 2. Create active session
    const createRes = await request(app)
      .post('/api/sessions')
      .set('X-Admin-Key', process.env.ADMIN_API_KEY)
      .send({ durationMinutes: 30, label: 'Camera Test 1' });

    const sessionId = createRes.body.session.id;

    // 3. Submit photo
    const photoRes = await request(app)
      .post(`/api/sessions/${sessionId}/photo`)
      .attach('photo', TINY_JPEG_BUFFER, 'test-capture.jpg');

    assert.strictEqual(photoRes.status, 200);
    assert.strictEqual(photoRes.body.success, true);
    assert.strictEqual(photoRes.body.session.status, 'active');
    assert.strictEqual(photoRes.body.session.submissionsCount, 1);

    // 4. Verify DB status updated to 'active' and submission counted
    const session = db.getSessionById(sessionId);
    assert.strictEqual(session.status, 'active');
    assert.strictEqual(session.submissionsCount, 1);
    assert.ok(session.submittedAt);
  });

  test('POST /api/sessions/:id/photo — Does NOT mark session submitted if Telegram API fails (502)', async () => {
    // Mock Telegram API failure
    telegramService.customFetch = async (url, options) => {
      return {
        ok: false,
        status: 502,
        json: async () => ({
          ok: false,
          description: 'Bad Gateway: Telegram servers temporarily unreachable'
        })
      };
    };

    // Create session
    const createRes = await request(app)
      .post('/api/sessions')
      .set('X-Admin-Key', process.env.ADMIN_API_KEY)
      .send({ durationMinutes: 30 });

    const sessionId = createRes.body.session.id;

    // Submit photo
    const photoRes = await request(app)
      .post(`/api/sessions/${sessionId}/photo`)
      .attach('photo', TINY_JPEG_BUFFER, 'test-capture.jpg');

    assert.strictEqual(photoRes.status, 502);
    assert.strictEqual(photoRes.body.success, false);
    assert.match(photoRes.body.error, /Telegram delivery failed/i);

    // Verify DB was NOT updated
    const session = db.getSessionById(sessionId);
    assert.strictEqual(session.status, 'created');
  });

  test('POST /api/sessions/:id/photo — Allows multiple photo submissions for the same active session link (200)', async () => {
    // Mock successful telegram
    telegramService.customFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { message_id: 999 } })
    });

    const createRes = await request(app)
      .post('/api/sessions')
      .set('X-Admin-Key', process.env.ADMIN_API_KEY)
      .send({ durationMinutes: 30 });

    const sessionId = createRes.body.session.id;

    // First submission
    const firstRes = await request(app)
      .post(`/api/sessions/${sessionId}/photo`)
      .attach('photo', TINY_JPEG_BUFFER, 'first.jpg');
    assert.strictEqual(firstRes.status, 200);
    assert.strictEqual(firstRes.body.submissionsCount, 1);

    // Second submission on same active session link
    const secondRes = await request(app)
      .post(`/api/sessions/${sessionId}/photo`)
      .attach('photo', TINY_JPEG_BUFFER, 'second.jpg');

    assert.strictEqual(secondRes.status, 200);
    assert.strictEqual(secondRes.body.success, true);
    assert.strictEqual(secondRes.body.submissionsCount, 2);

    // Third submission
    const thirdRes = await request(app)
      .post(`/api/sessions/${sessionId}/photo`)
      .attach('photo', TINY_JPEG_BUFFER, 'third.jpg');

    assert.strictEqual(thirdRes.status, 200);
    assert.strictEqual(thirdRes.body.submissionsCount, 3);

    // Verify DB count
    assert.strictEqual(db.getSubmissionsCount(sessionId), 3);
  });

  test('Public demo — Five visitor sessions submit independently at the same time', async () => {
    const deliveredSessionRefs = [];
    telegramService.customFetch = async (url, options) => {
      const sessionRef = options.body.get('caption').match(/Session Ref: ([a-f0-9]+)/i);
      deliveredSessionRefs.push(sessionRef && sessionRef[1]);
      await new Promise(resolve => setTimeout(resolve, 10));
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: { message_id: deliveredSessionRefs.length } })
      };
    };

    const sourceRes = await request(app)
      .post('/api/sessions')
      .set('X-Admin-Key', process.env.ADMIN_API_KEY)
      .send({ durationMinutes: 30, label: 'Concurrent Shared Link' });
    const sourceSessionId = sourceRes.body.session.id;

    const createResponses = await Promise.all(Array.from({ length: 5 }, (_, index) => request(app)
      .post('/api/sessions/demo')
      .send({ sourceSessionId })));
    const sessionIds = createResponses.map(res => res.body.session.id);
    assert.strictEqual(new Set(sessionIds).size, 5);

    const submissionResponses = await Promise.all(sessionIds.map(sessionId => request(app)
      .post(`/api/sessions/${sessionId}/photo`)
      .attach('photo', TINY_JPEG_BUFFER, `${sessionId}.jpg`)));

    assert.ok(submissionResponses.every(res => res.status === 200 && res.body.success));
    assert.ok(submissionResponses.every(res => res.body.submissionsCount === 1));
    assert.strictEqual(deliveredSessionRefs.length, 5);
    assert.strictEqual(new Set(deliveredSessionRefs).size, 5);
    assert.deepStrictEqual(
      new Set(deliveredSessionRefs),
      new Set(sessionIds.map(sessionId => sessionId.substring(0, 16)))
    );

    const storedSessions = sessionIds.map(sessionId => db.getSessionById(sessionId));
    assert.ok(storedSessions.every(session => session.submissionsCount === 1));
    assert.strictEqual(new Set(storedSessions.map(session => session.id)).size, 5);

    await request(app)
      .post(`/api/sessions/${sourceSessionId}/revoke`)
      .set('X-Admin-Key', process.env.ADMIN_API_KEY);
    const revokedLinkRes = await request(app)
      .post(`/api/sessions/${sessionIds[0]}/photo`)
      .attach('photo', TINY_JPEG_BUFFER, 'revoked-link.jpg');
    assert.strictEqual(revokedLinkRes.status, 403);
  });

  test('POST /api/sessions/:id/photo — Enforces maximum photos per session limit (400)', async () => {
    telegramService.customFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { message_id: 999 } })
    });

    const createRes = await request(app)
      .post('/api/sessions')
      .set('X-Admin-Key', process.env.ADMIN_API_KEY)
      .send({ durationMinutes: 30 });

    const sessionId = createRes.body.session.id;

    // Submit up to MAX_PHOTOS_PER_SESSION (default 10)
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post(`/api/sessions/${sessionId}/photo`)
        .attach('photo', TINY_JPEG_BUFFER, `photo-${i}.jpg`);
      assert.strictEqual(res.status, 200);
    }

    // 11th submission attempt should be rejected with 400
    const overLimitRes = await request(app)
      .post(`/api/sessions/${sessionId}/photo`)
      .attach('photo', TINY_JPEG_BUFFER, 'over-limit.jpg');

    assert.strictEqual(overLimitRes.status, 400);
    assert.strictEqual(overLimitRes.body.success, false);
    assert.match(overLimitRes.body.error, /Submission limit reached/i);
  });

  test('POST /api/sessions/:id/photo — Rejects submission to a revoked session (403)', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .set('X-Admin-Key', process.env.ADMIN_API_KEY)
      .send({ durationMinutes: 30 });

    const sessionId = createRes.body.session.id;

    // Revoke session
    await request(app)
      .post(`/api/sessions/${sessionId}/revoke`)
      .set('X-Admin-Key', process.env.ADMIN_API_KEY);

    // Attempt submission
    const photoRes = await request(app)
      .post(`/api/sessions/${sessionId}/photo`)
      .attach('photo', TINY_JPEG_BUFFER, 'attempt.jpg');

    assert.strictEqual(photoRes.status, 403);
    assert.strictEqual(photoRes.body.success, false);
    assert.match(photoRes.body.error, /revoked/i);
  });

  test('POST /api/sessions/:id/photo — Rejects submission to an expired session (410)', async () => {
    // Manually create expired session in DB with valid hex ID
    const expiredId = 'e00123456789abcdef0123456789abcd';
    db.createSession({
      id: expiredId,
      expiresAt: new Date(Date.now() - 60000).toISOString() // 1 minute in the past
    });

    const photoRes = await request(app)
      .post(`/api/sessions/${expiredId}/photo`)
      .attach('photo', TINY_JPEG_BUFFER, 'expired.jpg');

    assert.strictEqual(photoRes.status, 410);
    assert.strictEqual(photoRes.body.success, false);
    assert.match(photoRes.body.error, /expired/i);
  });

  test('POST /api/sessions/:id/photo — Rejects non-image MIME types (400)', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .set('X-Admin-Key', process.env.ADMIN_API_KEY)
      .send({ durationMinutes: 30 });

    const sessionId = createRes.body.session.id;

    const photoRes = await request(app)
      .post(`/api/sessions/${sessionId}/photo`)
      .attach('photo', Buffer.from('hello plain text'), 'document.txt');

    assert.strictEqual(photoRes.status, 400);
    assert.strictEqual(photoRes.body.success, false);
    assert.match(photoRes.body.error, /Unsupported image format/i);
  });

  test('POST /api/sessions/:id/photo — Rejects request without a photo file (400)', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .set('X-Admin-Key', process.env.ADMIN_API_KEY)
      .send({ durationMinutes: 30 });

    const sessionId = createRes.body.session.id;

    const photoRes = await request(app)
      .post(`/api/sessions/${sessionId}/photo`);

    assert.strictEqual(photoRes.status, 400);
    assert.strictEqual(photoRes.body.success, false);
    assert.match(photoRes.body.error, /Missing photo file/i);
  });

  test('POST /api/sessions/:id/photo — Rejects invalid session ID format (400)', async () => {
    const photoRes = await request(app)
      .post('/api/sessions/invalid-id-!/photo')
      .attach('photo', TINY_JPEG_BUFFER, 'sample.jpg');

    assert.strictEqual(photoRes.status, 400);
    assert.strictEqual(photoRes.body.success, false);
    assert.match(photoRes.body.error, /Invalid session ID format/i);
  });

  test('POST /api/sessions/:id/photo — Rejects oversized photo uploads exceeding 10MB limit (413)', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .set('X-Admin-Key', process.env.ADMIN_API_KEY)
      .send({ durationMinutes: 30 });

    const sessionId = createRes.body.session.id;

    // Create 10.5 MB buffer
    const oversizedBuffer = Buffer.alloc(10.5 * 1024 * 1024);

    const photoRes = await request(app)
      .post(`/api/sessions/${sessionId}/photo`)
      .attach('photo', oversizedBuffer, 'oversized.jpg');

    assert.strictEqual(photoRes.status, 413);
    assert.strictEqual(photoRes.body.success, false);
    assert.match(photoRes.body.error, /exceeds maximum allowable file size/i);
  });

  test('POST /api/sessions/:id/photo — Returns 503 if Telegram credentials are not configured or are placeholders', async () => {
    const originalToken = process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_BOT_TOKEN = 'replace_with_your_telegram_bot_token';

    const createRes = await request(app)
      .post('/api/sessions')
      .set('X-Admin-Key', process.env.ADMIN_API_KEY)
      .send({ durationMinutes: 30 });

    const sessionId = createRes.body.session.id;

    const photoRes = await request(app)
      .post(`/api/sessions/${sessionId}/photo`)
      .attach('photo', TINY_JPEG_BUFFER, 'test.jpg');

    assert.strictEqual(photoRes.status, 503);
    assert.strictEqual(photoRes.body.success, false);
    assert.match(photoRes.body.error, /Telegram Bot is not configured/i);
    assert.match(photoRes.body.error, /placeholder/i);

    process.env.TELEGRAM_BOT_TOKEN = originalToken;
  });

  test('POST /api/sessions/:id/photo — Reports specifically when TELEGRAM_BOT_TOKEN is missing', async () => {
    const originalToken = process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;

    const createRes = await request(app)
      .post('/api/sessions')
      .set('X-Admin-Key', process.env.ADMIN_API_KEY)
      .send({ durationMinutes: 30 });

    const sessionId = createRes.body.session.id;

    const photoRes = await request(app)
      .post(`/api/sessions/${sessionId}/photo`)
      .attach('photo', TINY_JPEG_BUFFER, 'test.jpg');

    assert.strictEqual(photoRes.status, 503);
    assert.strictEqual(photoRes.body.success, false);
    assert.match(photoRes.body.error, /TELEGRAM_BOT_TOKEN/i);

    process.env.TELEGRAM_BOT_TOKEN = originalToken;
  });

  test('POST /api/sessions/:id/photo — Reports specifically when TELEGRAM_CHAT_ID is missing', async () => {
    const originalChatId = process.env.TELEGRAM_CHAT_ID;
    delete process.env.TELEGRAM_CHAT_ID;

    const createRes = await request(app)
      .post('/api/sessions')
      .set('X-Admin-Key', process.env.ADMIN_API_KEY)
      .send({ durationMinutes: 30 });

    const sessionId = createRes.body.session.id;

    const photoRes = await request(app)
      .post(`/api/sessions/${sessionId}/photo`)
      .attach('photo', TINY_JPEG_BUFFER, 'test.jpg');

    assert.strictEqual(photoRes.status, 503);
    assert.strictEqual(photoRes.body.success, false);
    assert.match(photoRes.body.error, /TELEGRAM_CHAT_ID/i);

    process.env.TELEGRAM_CHAT_ID = originalChatId;
  });

  test('Telegram Service — Sanitizes whitespace, quotes, and bot prefixes from credentials', () => {
    const origToken = process.env.TELEGRAM_BOT_TOKEN;
    const origChat = process.env.TELEGRAM_CHAT_ID;

    process.env.TELEGRAM_BOT_TOKEN = '  "bot123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"  ';
    process.env.TELEGRAM_CHAT_ID = " '8850899217' ";

    const creds = telegramService.getCredentials();
    assert.strictEqual(creds.botToken, '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ');
    assert.strictEqual(creds.chatId, '8850899217');

    const validation = telegramService.validateConfiguration();
    assert.strictEqual(validation.configured, true);
    assert.strictEqual(validation.botToken, '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ');
    assert.strictEqual(validation.chatId, '8850899217');

    process.env.TELEGRAM_BOT_TOKEN = origToken;
    process.env.TELEGRAM_CHAT_ID = origChat;
  });

  test('Public Demo Consent Flow — Successfully creates demo session and transmits photo after confirmation (200)', async () => {
    let capturedCaption = '';
    telegramService.customFetch = async (url, options) => {
      // In Node.js native FormData, retrieve the caption field
      capturedCaption = options.body.get('caption');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: { message_id: 99901 }
        })
      };
    };

    // 1. Create ephemeral demo session (same as visitor clicking consent)
    const demoRes = await request(app)
      .post('/api/sessions/demo')
      .send({ label: 'Automated Consent Test' });

    assert.strictEqual(demoRes.status, 201);
    assert.strictEqual(demoRes.body.success, true);
    const demoSessionId = demoRes.body.session.id;

    // 2. Transmit captured photo after confirmation
    const submitRes = await request(app)
      .post(`/api/sessions/${demoSessionId}/photo`)
      .attach('photo', TINY_JPEG_BUFFER, 'confirmed-capture.jpg');

    assert.strictEqual(submitRes.status, 200);
    assert.strictEqual(submitRes.body.success, true);
    assert.strictEqual(submitRes.body.session.status, 'active');

    // 3. Verify consent confirmation notice was included in Telegram caption
    assert.match(capturedCaption, /Consent: Explicitly captured and submitted/i);

    // 4. Verify multiple submissions are allowed for same session link
    const secondSubmitRes = await request(app)
      .post(`/api/sessions/${demoSessionId}/photo`)
      .attach('photo', TINY_JPEG_BUFFER, 'second-attempt.jpg');

    assert.strictEqual(secondSubmitRes.status, 200);
    assert.strictEqual(secondSubmitRes.body.success, true);
    assert.strictEqual(secondSubmitRes.body.submissionsCount, 2);
  });
});
