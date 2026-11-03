// Keep the lightweight SQLite adapter for local tests. Every production process
// uses the shared Neon PostgreSQL database so sessions and links survive deploys.
const sqlite = require('./db-sqlite');
const postgres = require('./db-postgres');
const useSQLiteTests = process.env.NODE_ENV === 'test';

function activeAdapter() {
  if (useSQLiteTests) return sqlite;
  if (process.env.DATABASE_URL || process.env.NODE_ENV === 'production') return postgres;
  return sqlite;
}

module.exports = new Proxy({}, {
  get(_target, property) {
    const value = activeAdapter()[property];
    return typeof value === 'function' ? value.bind(activeAdapter()) : value;
  }
});
