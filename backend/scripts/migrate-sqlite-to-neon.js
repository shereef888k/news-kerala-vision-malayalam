const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { DatabaseSync } = require('node:sqlite');

const projectEnvLocal = path.resolve(__dirname, '../../.env.local');
const backendEnv = path.resolve(__dirname, '../.env');
if (fs.existsSync(projectEnvLocal)) dotenv.config({ path: projectEnvLocal });
if (fs.existsSync(backendEnv)) dotenv.config({ path: backendEnv });

const neonDb = require('../services/db-postgres');
const sourcePath = process.env.LEGACY_SQLITE_PATH || process.env.DATABASE_PATH || path.resolve(__dirname, '../data/sessions.db');
const applyChanges = process.argv.includes('--apply');

function tableExists(sqlite, tableName) {
  return Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

function readTable(sqlite, tableName) {
  return tableExists(sqlite, tableName) ? sqlite.prepare(`SELECT * FROM ${tableName}`).all() : [];
}

function jsonValue(value) {
  if (value === null || value === undefined) return null;
  try { return JSON.stringify(JSON.parse(value)); }
  catch (_) { return JSON.stringify(value); }
}

async function migrateRows(client, rows, sql, valuesForRow) {
  let inserted = 0;
  for (const row of rows) {
    const result = await client.query(sql, valuesForRow(row));
    inserted += result.rowCount;
  }
  return inserted;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Run neon env pull or use the Render Neon connection variable.');
  if (sourcePath === ':memory:' || !fs.existsSync(sourcePath)) {
    throw new Error('The legacy SQLite database file was not found. Set LEGACY_SQLITE_PATH to its mounted file before running this migration.');
  }

  const sqlite = new DatabaseSync(sourcePath, { readOnly: true });
  const rows = {
    permanent_demo_links: readTable(sqlite, 'permanent_demo_links'),
    sessions: readTable(sqlite, 'sessions'),
    events: readTable(sqlite, 'events'),
    submissions: readTable(sqlite, 'submissions')
  };
  sqlite.close();

  const totals = Object.fromEntries(Object.entries(rows).map(([name, items]) => [name, items.length]));
  console.log('Legacy SQLite rows found:', JSON.stringify(totals));
  if (!applyChanges) {
    console.log('Dry run only. Review the counts, then rerun with --apply to import into Neon.');
    return;
  }

  const pool = await neonDb.initDatabase();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const imported = {};
    imported.permanent_demo_links = await migrateRows(client, rows.permanent_demo_links, `
      INSERT INTO permanent_demo_links (id, token, status, created_at, updated_at, revoked_at)
      VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING
    `, row => [row.id, row.token, row.status, row.created_at, row.updated_at, row.revoked_at]);
    imported.sessions = await migrateRows(client, rows.sessions, `
      INSERT INTO sessions (id, label, status, created_at, expires_at, submitted_at, source_session_id, permanent_link_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING
    `, row => [row.id, row.label, row.status, row.created_at, row.expires_at, row.submitted_at,
      row.source_session_id || null, row.permanent_link_id || null]);
    imported.events = await migrateRows(client, rows.events, `
      INSERT INTO events (id, session_id, event_type, created_at, metadata)
      VALUES ($1, $2, $3, $4, $5::jsonb) ON CONFLICT DO NOTHING
    `, row => [row.id, row.session_id, row.event_type, row.created_at, jsonValue(row.metadata)]);
    imported.submissions = await migrateRows(client, rows.submissions, `
      INSERT INTO submissions (id, session_id, submitted_at, filename, mime_type, file_size)
      VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING
    `, row => [row.id, row.session_id, row.submitted_at, row.filename, row.mime_type, row.file_size]);

    for (const table of ['events', 'submissions']) {
      await client.query(`
        SELECT setval(pg_get_serial_sequence('${table}', 'id'),
          GREATEST(COALESCE((SELECT MAX(id) FROM ${table}), 1), 1),
          EXISTS (SELECT 1 FROM ${table}))
      `);
    }
    await client.query('COMMIT');
    console.log('Neon migration completed. Newly imported rows:', JSON.stringify(imported));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await neonDb.closeDatabase();
  }
}

main().catch(error => {
  console.error('SQLite to Neon migration failed:', error.message);
  process.exitCode = 1;
});
