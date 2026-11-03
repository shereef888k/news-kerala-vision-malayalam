const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';

const db = require('../services/db');

test('SQLite session and permanent-link records survive a connection restart and schema migration', () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'camera-demo-db-'));
  const databasePath = path.join(tempDirectory, 'sessions.db');
  const legacyDatabase = new DatabaseSync(databasePath);
  legacyDatabase.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      label TEXT,
      status TEXT NOT NULL DEFAULT 'created',
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      submitted_at TEXT
    );
  `);
  legacyDatabase.close();

  const sessionId = crypto.randomBytes(16).toString('hex');
  try {
    db.initDatabase(databasePath);
    const session = db.createSession({
      id: sessionId,
      label: 'Persistence check',
      expiresAt: new Date(Date.now() + 60000).toISOString()
    });
    const permanentLink = db.createPermanentDemoLink();
    assert.strictEqual(session.id, sessionId);
    assert.ok(db.healthCheck());

    db.closeDatabase();
    db.initDatabase(databasePath);
    assert.strictEqual(db.getSessionById(sessionId).label, 'Persistence check');
    assert.strictEqual(db.getLatestPermanentDemoLink().token, permanentLink.token);
    assert.ok(db.healthCheck());
  } finally {
    db.closeDatabase();
    const resolvedTempRoot = path.resolve(os.tmpdir()) + path.sep;
    const resolvedDirectory = path.resolve(tempDirectory);
    assert.ok(resolvedDirectory.startsWith(resolvedTempRoot), 'Temporary test directory must be inside the OS temp directory.');
    fs.rmSync(resolvedDirectory, { recursive: true, force: true });
  }
});

test('production startup refuses an unspecified database path instead of silently using ephemeral storage', () => {
  const previousEnvironment = process.env.NODE_ENV;
  const previousDatabasePath = process.env.DATABASE_PATH;
  db.closeDatabase();
  process.env.NODE_ENV = 'production';
  delete process.env.DATABASE_PATH;
  try {
    assert.throws(() => db.initDatabase(), /DATABASE_PATH must point to persistent storage/);
  } finally {
    process.env.NODE_ENV = previousEnvironment;
    if (previousDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousDatabasePath;
  }
});
