const { createRealtime, rawSql } = require('@neon/realtime/server');

let realtimeInstance = null;

function isConfigured() {
  return Boolean(process.env.NEON_REALTIME_URL && process.env.NEON_REALTIME_SECRET && process.env.DATABASE_URL);
}

function getDatabaseName() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for Neon Realtime.');
  const databaseName = decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.replace(/^\//, ''));
  if (!databaseName) throw new Error('DATABASE_URL must include a PostgreSQL database name.');
  return databaseName;
}

function getRealtime() {
  if (!isConfigured()) {
    const error = new Error('Neon Realtime is not configured on this backend.');
    error.statusCode = 503;
    throw error;
  }
  if (!realtimeInstance) {
    realtimeInstance = createRealtime({
      url: process.env.NEON_REALTIME_URL,
      secret: process.env.NEON_REALTIME_SECRET,
      db: getDatabaseName()
    });
  }
  return realtimeInstance;
}

async function subscribeAdminSessions() {
  const realtime = getRealtime();
  const query = rawSql(`
    SELECT s.id, s.label, s.status, s.created_at AS "createdAt",
           s.expires_at AS "expiresAt", s.submitted_at AS "submittedAt",
           s.source_session_id AS "sourceSessionId", s.permanent_link_id AS "permanentLinkId",
           COUNT(sub.id)::int AS "submissionsCount"
    FROM sessions s
    LEFT JOIN submissions sub ON sub.session_id = s.id
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `);
  const subscription = await realtime.subscribe(query);
  return { realtime, subscription };
}

async function close() {
  if (!realtimeInstance) return;
  const instance = realtimeInstance;
  realtimeInstance = null;
  await instance.close();
}

module.exports = { isConfigured, subscribeAdminSessions, close };
