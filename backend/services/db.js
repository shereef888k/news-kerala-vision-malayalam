const path = require('path');
const fs = require('fs');

let dbInstance = null;
let isNodeSqlite = false;

/**
 * Initializes and returns the persistent SQLite database instance.
 * Supports native node:sqlite (Node 22+) as well as better-sqlite3.
 * 
 * @param {string} [customPath] - Optional path to database file (e.g. ':memory:')
 */
function initDatabase(customPath) {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = customPath || process.env.DATABASE_PATH || path.join(__dirname, '../data/sessions.db');

  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Detect available SQLite engine
  let DatabaseSync;
  try {
    DatabaseSync = require('node:sqlite').DatabaseSync;
    isNodeSqlite = true;
  } catch (e) {
    try {
      DatabaseSync = require('better-sqlite3');
      isNodeSqlite = false;
    } catch (e2) {
      throw new Error('No SQLite driver available. Ensure Node.js >= 22.5 is used or better-sqlite3 is installed.');
    }
  }

  dbInstance = new DatabaseSync(dbPath);

  // Enable WAL mode for high concurrency
  if (dbPath !== ':memory:') {
    try {
      dbInstance.exec('PRAGMA journal_mode = WAL;');
    } catch (e) {
      // WAL may not be supported on in-memory or certain virtual drives
    }
  }

  // Create schema
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      label TEXT,
      status TEXT NOT NULL DEFAULT 'created',
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      submitted_at TEXT,
      source_session_id TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      submitted_at TEXT NOT NULL,
      filename TEXT,
      mime_type TEXT,
      file_size INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions (status);
    CREATE INDEX IF NOT EXISTS idx_events_session_id ON events (session_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_session_id ON submissions (session_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at ON submissions (submitted_at);
  `);

  // Existing deployments may already have a sessions table from before
  // visitor sessions were linked to their reusable admin entry link.
  const sessionColumns = dbInstance.prepare('PRAGMA table_info(sessions)').all();
  if (!sessionColumns.some(column => column.name === 'source_session_id')) {
    dbInstance.exec('ALTER TABLE sessions ADD COLUMN source_session_id TEXT;');
  }

  return dbInstance;
}

/**
 * Creates a new demonstration session.
 */
function createSession({ id, label = null, expiresAt, createdAt = new Date().toISOString(), sourceSessionId = null }) {
  const db = initDatabase();
  const stmt = db.prepare(`
    INSERT INTO sessions (id, label, status, created_at, expires_at, source_session_id)
    VALUES (?, ?, 'created', ?, ?, ?)
  `);

  stmt.run(id, label, createdAt, expiresAt, sourceSessionId);

  return {
    id,
    label,
    status: 'created',
    createdAt,
    expiresAt,
    submittedAt: null
  };
}

/**
 * Retrieves a session by its unique ID.
 */
function getSessionById(id) {
  const db = initDatabase();
  const stmt = db.prepare(`
    SELECT id, label, status, created_at AS createdAt, expires_at AS expiresAt,
           submitted_at AS submittedAt, source_session_id AS sourceSessionId
    FROM sessions
    WHERE id = ?
  `);

  const row = stmt.get(id);
  if (!row) return null;

  const countStmt = db.prepare('SELECT COUNT(*) AS count FROM submissions WHERE session_id = ?');
  const countRow = countStmt.get(id);
  row.submissionsCount = countRow ? Number(countRow.count) : 0;

  return row;
}

/**
 * Retrieves all sessions, sorted by creation date descending.
 */
function listSessions() {
  const db = initDatabase();
  const stmt = db.prepare(`
    SELECT s.id, s.label, s.status, s.created_at AS createdAt, s.expires_at AS expiresAt,
           s.submitted_at AS submittedAt, s.source_session_id AS sourceSessionId,
           COUNT(sub.id) AS submissionsCount
    FROM sessions s
    LEFT JOIN submissions sub ON s.id = sub.session_id
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `);

  return stmt.all();
}

/**
 * Marks a session as opened if it is currently in 'created' state.
 */
function markSessionOpened(id) {
  const db = initDatabase();
  const stmt = db.prepare(`
    UPDATE sessions
    SET status = 'opened'
    WHERE id = ? AND status = 'created'
  `);

  const result = stmt.run(id);
  return result && result.changes ? result.changes > 0 : true;
}

/**
 * Updates session on verified photo delivery, keeping session active for multiple submissions.
 */
function markSessionActive(id, submittedAt = new Date().toISOString()) {
  const db = initDatabase();
  const stmt = db.prepare(`
    UPDATE sessions
    SET status = 'active', submitted_at = ?
    WHERE id = ? AND status != 'revoked'
  `);

  const result = stmt.run(submittedAt, id);
  return result && result.changes ? result.changes > 0 : true;
}

/**
 * Retained for backwards compatibility: sets session active and records last submission timestamp.
 */
function markSessionSubmitted(id, submittedAt = new Date().toISOString()) {
  return markSessionActive(id, submittedAt);
}

/**
 * Records an authorized photo submission in the submissions table.
 */
function recordSubmission({ sessionId, submittedAt = new Date().toISOString(), filename = null, mimeType = null, fileSize = null }) {
  const db = initDatabase();
  const stmt = db.prepare(`
    INSERT INTO submissions (session_id, submitted_at, filename, mime_type, file_size)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = stmt.run(sessionId, submittedAt, filename, mimeType, fileSize);
  return {
    id: result.lastInsertRowid,
    sessionId,
    submittedAt,
    filename,
    mimeType,
    fileSize
  };
}

/**
 * Returns the number of authorized submissions for a given session ID.
 */
function getSubmissionsCount(sessionId) {
  const db = initDatabase();
  const stmt = db.prepare('SELECT COUNT(*) AS count FROM submissions WHERE session_id = ?');
  const row = stmt.get(sessionId);
  return row ? Number(row.count) : 0;
}

/**
 * Retrieves all submission records for a session ID.
 */
function listSubmissions(sessionId) {
  const db = initDatabase();
  const stmt = db.prepare(`
    SELECT id, session_id AS sessionId, submitted_at AS submittedAt, filename, mime_type AS mimeType, file_size AS fileSize
    FROM submissions
    WHERE session_id = ?
    ORDER BY id ASC
  `);

  return stmt.all(sessionId);
}

/**
 * Revokes an active session.
 */
function revokeSession(id) {
  const db = initDatabase();
  const stmt = db.prepare(`
    UPDATE sessions
    SET status = 'revoked'
    WHERE id = ?
  `);

  const result = stmt.run(id);
  return result && result.changes ? result.changes > 0 : true;
}

/**
 * Records a non-sensitive awareness demonstration event (page_opened, demo_button_clicked, simulation_completed).
 */
function recordEvent({ sessionId, eventType, metadata = null, createdAt = new Date().toISOString() }) {
  const db = initDatabase();
  const metaStr = metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null;
  const stmt = db.prepare(`
    INSERT INTO events (session_id, event_type, created_at, metadata)
    VALUES (?, ?, ?, ?)
  `);

  stmt.run(sessionId, eventType, createdAt, metaStr);

  return {
    sessionId,
    eventType,
    createdAt,
    metadata
  };
}

/**
 * Retrieves all non-sensitive demonstration events for a given session ID.
 */
function listEvents(sessionId) {
  const db = initDatabase();
  const stmt = db.prepare(`
    SELECT id, session_id AS sessionId, event_type AS eventType, created_at AS createdAt, metadata
    FROM events
    WHERE session_id = ?
    ORDER BY id ASC
  `);

  const rows = stmt.all(sessionId);
  return rows.map(r => {
    let parsedMeta = null;
    if (r.metadata) {
      try {
        parsedMeta = JSON.parse(r.metadata);
      } catch (e) {
        parsedMeta = r.metadata;
      }
    }
    return {
      id: r.id,
      sessionId: r.sessionId,
      eventType: r.eventType,
      createdAt: r.createdAt,
      metadata: parsedMeta
    };
  });
}

/**
 * Close database connection (used for teardown/tests).
 */
function closeDatabase() {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch (e) {
      // Ignore
    }
    dbInstance = null;
  }
}

module.exports = {
  initDatabase,
  createSession,
  getSessionById,
  listSessions,
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
