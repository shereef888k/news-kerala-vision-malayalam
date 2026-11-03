const crypto = require('crypto');
const { Pool } = require('pg');

let pool;
let initialization;

function initDatabase() {
  if (initialization) return initialization;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to connect the production API to Neon PostgreSQL.');
  }
  const configuredPoolSize = Number.parseInt(process.env.PG_POOL_MAX || '10', 10);
  const poolSize = Number.isInteger(configuredPoolSize) && configuredPoolSize > 0 && configuredPoolSize <= 100
    ? configuredPoolSize
    : 10;

  pool = new Pool({
    connectionString,
    max: poolSize,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: 'camera-security-demo-api'
  });

  pool.on('error', error => {
    console.error('[Database] Idle Neon PostgreSQL connection failed:', error.message);
  });

  initialization = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS permanent_demo_links (
        id TEXT PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (status IN ('enabled', 'disabled', 'revoked')),
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        label TEXT,
        status TEXT NOT NULL DEFAULT 'created',
        created_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        submitted_at TIMESTAMPTZ,
        source_session_id TEXT,
        permanent_link_id TEXT
      );

      CREATE TABLE IF NOT EXISTS events (
        id BIGSERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        metadata JSONB
      );

      CREATE TABLE IF NOT EXISTS submissions (
        id BIGSERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        submitted_at TIMESTAMPTZ NOT NULL,
        filename TEXT,
        mime_type TEXT,
        file_size BIGINT
      );

      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS source_session_id TEXT;
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS permanent_link_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions (status);
      CREATE INDEX IF NOT EXISTS idx_sessions_permanent_link_id ON sessions (permanent_link_id);
      CREATE INDEX IF NOT EXISTS idx_events_session_id ON events (session_id);
      CREATE INDEX IF NOT EXISTS idx_submissions_session_id ON submissions (session_id);
      CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at ON submissions (submitted_at);
    `);
    return pool;
  })().catch(async error => {
    const failedPool = pool;
    pool = null;
    initialization = null;
    if (failedPool) await failedPool.end().catch(() => {});
    throw error;
  });

  return initialization;
}

async function query(sql, parameters = []) {
  const connection = await initDatabase();
  return connection.query(sql, parameters);
}

function sessionShape(row) {
  if (!row) return null;
  return {
    ...row,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : row.expiresAt,
    submittedAt: row.submittedAt instanceof Date ? row.submittedAt.toISOString() : row.submittedAt,
    submissionsCount: Number(row.submissionsCount || 0)
  };
}

function permanentLinkShape(row) {
  if (!row) return null;
  return {
    ...row,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    revokedAt: row.revokedAt instanceof Date ? row.revokedAt.toISOString() : row.revokedAt
  };
}

async function createSession({ id, label = null, expiresAt, createdAt = new Date().toISOString(), sourceSessionId = null, permanentLinkId = null }) {
  const result = await query(`
    INSERT INTO sessions (id, label, status, created_at, expires_at, source_session_id, permanent_link_id)
    VALUES ($1, $2, 'created', $3, $4, $5, $6)
    RETURNING id, label, status, created_at AS "createdAt", expires_at AS "expiresAt",
              submitted_at AS "submittedAt", source_session_id AS "sourceSessionId",
              permanent_link_id AS "permanentLinkId"
  `, [id, label, createdAt, expiresAt, sourceSessionId, permanentLinkId]);
  return sessionShape(result.rows[0]);
}

async function getSessionById(id) {
  const result = await query(`
    SELECT s.id, s.label, s.status, s.created_at AS "createdAt", s.expires_at AS "expiresAt",
           s.submitted_at AS "submittedAt", s.source_session_id AS "sourceSessionId",
           s.permanent_link_id AS "permanentLinkId",
           (SELECT COUNT(*)::int FROM submissions WHERE session_id = s.id) AS "submissionsCount"
    FROM sessions s WHERE s.id = $1
  `, [id]);
  return sessionShape(result.rows[0]);
}

async function listSessions() {
  const result = await query(`
    SELECT s.id, s.label, s.status, s.created_at AS "createdAt", s.expires_at AS "expiresAt",
           s.submitted_at AS "submittedAt", s.source_session_id AS "sourceSessionId",
           s.permanent_link_id AS "permanentLinkId", COUNT(sub.id)::int AS "submissionsCount"
    FROM sessions s LEFT JOIN submissions sub ON sub.session_id = s.id
    GROUP BY s.id ORDER BY s.created_at DESC
  `);
  return result.rows.map(sessionShape);
}

async function getLatestPermanentDemoLink(connection = pool) {
  if (!connection) await initDatabase();
  const result = await (connection || pool).query(`
    SELECT id, token, status, created_at AS "createdAt", updated_at AS "updatedAt", revoked_at AS "revokedAt"
    FROM permanent_demo_links ORDER BY created_at DESC LIMIT 1
  `);
  return permanentLinkShape(result.rows[0]);
}

async function getPermanentDemoLinkById(id, connection = pool) {
  if (!connection) await initDatabase();
  const result = await (connection || pool).query(`
    SELECT id, token, status, created_at AS "createdAt", updated_at AS "updatedAt", revoked_at AS "revokedAt"
    FROM permanent_demo_links WHERE id = $1
  `, [id]);
  return permanentLinkShape(result.rows[0]);
}

async function getPermanentDemoLinkByToken(token) {
  const result = await query(`
    SELECT id, token, status, created_at AS "createdAt", updated_at AS "updatedAt", revoked_at AS "revokedAt"
    FROM permanent_demo_links WHERE token = $1
  `, [token]);
  return permanentLinkShape(result.rows[0]);
}

async function createPermanentDemoLink() {
  const connection = await initDatabase();
  const client = await connection.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(88492211, 387201)');
    const current = await getLatestPermanentDemoLink(client);
    if (current && current.status !== 'revoked') {
      await client.query('COMMIT');
      return current;
    }

    const id = crypto.randomBytes(16).toString('hex');
    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date().toISOString();
    await client.query(`
      INSERT INTO permanent_demo_links (id, token, status, created_at, updated_at)
      VALUES ($1, $2, 'enabled', $3, $3)
    `, [id, token, now]);
    const created = await getPermanentDemoLinkById(id, client);
    await client.query('COMMIT');
    return created;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function setPermanentDemoLinkStatus(id, status) {
  if (!['enabled', 'disabled', 'revoked'].includes(status)) {
    throw new Error('Invalid permanent demo link status.');
  }
  const now = new Date().toISOString();
  const result = await query(`
    UPDATE permanent_demo_links
    SET status = $1, updated_at = $2,
        revoked_at = CASE WHEN $1 = 'revoked' THEN $2 ELSE revoked_at END
    WHERE id = $3 AND (status <> 'revoked' OR $1 = 'revoked')
    RETURNING id
  `, [status, now, id]);
  return result.rowCount ? getPermanentDemoLinkById(id) : null;
}

async function getVisitorSessionForSource(sourceSessionId) {
  const result = await query('SELECT id FROM sessions WHERE source_session_id = $1 LIMIT 1', [sourceSessionId]);
  return result.rows[0] || null;
}

async function healthCheck() {
  await query('SELECT 1 AS ok');
  return { connected: true, persistentStorageConfigured: true, storageProvider: 'neon' };
}

async function markSessionOpened(id) {
  const result = await query(`
    UPDATE sessions SET status = 'opened' WHERE id = $1 AND status = 'created'
  `, [id]);
  return result.rowCount > 0;
}

async function markSessionActive(id, submittedAt = new Date().toISOString()) {
  const result = await query(`
    UPDATE sessions SET status = 'active', submitted_at = $1 WHERE id = $2 AND status <> 'revoked'
  `, [submittedAt, id]);
  return result.rowCount > 0;
}

function markSessionSubmitted(id, submittedAt = new Date().toISOString()) {
  return markSessionActive(id, submittedAt);
}

async function recordSubmission({ sessionId, submittedAt = new Date().toISOString(), filename = null, mimeType = null, fileSize = null }) {
  const result = await query(`
    INSERT INTO submissions (session_id, submitted_at, filename, mime_type, file_size)
    VALUES ($1, $2, $3, $4, $5) RETURNING id
  `, [sessionId, submittedAt, filename, mimeType, fileSize]);
  return { id: result.rows[0].id, sessionId, submittedAt, filename, mimeType, fileSize };
}

async function getSubmissionsCount(sessionId) {
  const result = await query('SELECT COUNT(*)::int AS count FROM submissions WHERE session_id = $1', [sessionId]);
  return Number(result.rows[0].count);
}

async function listSubmissions(sessionId) {
  const result = await query(`
    SELECT id, session_id AS "sessionId", submitted_at AS "submittedAt", filename,
           mime_type AS "mimeType", file_size AS "fileSize"
    FROM submissions WHERE session_id = $1 ORDER BY id ASC
  `, [sessionId]);
  return result.rows;
}

async function revokeSession(id) {
  const result = await query("UPDATE sessions SET status = 'revoked' WHERE id = $1", [id]);
  return result.rowCount > 0;
}

async function recordEvent({ sessionId, eventType, metadata = null, createdAt = new Date().toISOString() }) {
  const metadataJson = metadata === null || metadata === undefined ? null : JSON.stringify(metadata);
  await query(`
    INSERT INTO events (session_id, event_type, created_at, metadata)
    VALUES ($1, $2, $3, $4::jsonb)
  `, [sessionId, eventType, createdAt, metadataJson]);
  return { sessionId, eventType, createdAt, metadata };
}

async function listEvents(sessionId) {
  const result = await query(`
    SELECT id, session_id AS "sessionId", event_type AS "eventType",
           created_at AS "createdAt", metadata
    FROM events WHERE session_id = $1 ORDER BY id ASC
  `, [sessionId]);
  return result.rows.map(row => ({
    ...row,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt
  }));
}

async function closeDatabase() {
  if (pool) await pool.end();
  pool = null;
  initialization = null;
}

module.exports = {
  initDatabase,
  createSession,
  getSessionById,
  listSessions,
  getLatestPermanentDemoLink,
  getPermanentDemoLinkById,
  getPermanentDemoLinkByToken,
  createPermanentDemoLink,
  setPermanentDemoLinkStatus,
  getVisitorSessionForSource,
  healthCheck,
  markSessionOpened,
  markSessionActive,
  markSessionSubmitted,
  recordSubmission,
  getSubmissionsCount,
  listSubmissions,
  revokeSession,
  recordEvent,
  listEvents,
  closeDatabase
};
