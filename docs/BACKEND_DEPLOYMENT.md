# Backend Deployment: Render + Neon

Production session, permanent-link, event, and submission records use Neon PostgreSQL. The admin session table subscribes to Neon Realtime through an authenticated server endpoint; the Realtime secret stays on the backend. SQLite remains available for local tests and offline development.

## 1. Provision Neon

Use Node.js 22.5 or newer. From the project root:

```bash
npm install
npm install --prefix backend
neon login
neon init -y --org-id org-falling-morning-29932094 --project-id misty-dawn-89271289 --branch production --services postgres,realtime --no-agent-setup
neon config plan
neon deploy
```

The CLI writes the branch's Neon variables to the ignored root `.env.local`. The app uses the pooled `DATABASE_URL` for normal API traffic and reads `NEON_REALTIME_URL` and `NEON_REALTIME_SECRET` on the server. Do not put any of these values in Vercel or browser JavaScript. Keep the secret file private.

`neon init` creates `neon.ts`; PostgreSQL is the branch's built-in database and `preview.realtime` enables Realtime. Review `neon config plan` before deploying the config.

## 2. Configure the Render API

Keep the existing `camera-security-demo-1` service, its `backend` root directory, and its current SQLite disk attached until any needed legacy data has been imported. The SQLite disk is only a migration source and rollback copy after Neon is enabled.

Set these variables in Render's **Environment** page. For Neon values, copy them from the private `.env.local` created by `neon deploy` without printing them in logs:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon pooled connection string |
| `NEON_REALTIME_URL` | Neon Realtime endpoint |
| `NEON_REALTIME_SECRET` | Neon Realtime server secret |
| `FRONTEND_ORIGIN` | `https://news-kerala-vision-malayalam-fronte-five.vercel.app` |
| `ADMIN_API_KEY` | Existing server-only admin key |
| `TELEGRAM_BOT_TOKEN` | Existing server-only Telegram bot token |
| `TELEGRAM_CHAT_ID` | Existing server-only Telegram destination |

The `render.yaml` marks Neon values `sync: false` so Blueprint sync cannot overwrite them. The API fails startup if `DATABASE_URL` is missing in production; it does not silently create a new SQLite database.

Deploy the latest project to Render after setting the environment variables. The server creates tables and indexes idempotently at startup. Do not remove the old disk while importing legacy records.

## 3. Preserve existing SQLite records

If the old SQLite database contains the permanent link or session history, leave the disk mounted. After deploying the new backend and setting the Neon variables, run the migration from the Render Shell. First preview row counts:

```bash
LEGACY_SQLITE_PATH=/var/data/sessions.db node scripts/migrate-sqlite-to-neon.js
```

Only if the counts are expected, import them:

```bash
LEGACY_SQLITE_PATH=/var/data/sessions.db node scripts/migrate-sqlite-to-neon.js --apply
```

The importer preserves session IDs, permanent-link tokens and status, events, and submission metadata. It does not copy photo files (the app does not store photo bytes in SQLite). It is safe to rerun; conflicts are skipped. The script prints counts only, never tokens. If the source database was already lost or never persisted, the old link record cannot be reconstructed from its URL alone.

After migration, open `/admin.html` and verify the existing permanent link before removing or decommissioning the old disk.

## 4. Verify the deployment

Run the local build check and tests:

```bash
npm run build
npm test
```

After deploying, check `https://camera-security-demo-1.onrender.com/api/health`. A working setup reports `database: "connected"`, `storageProvider: "neon"`, `persistentStorageConfigured: true`, and `realtimeConfigured: true`.

The admin session dashboard uses the authenticated `/api/admin/sessions/realtime` stream. If Realtime is not available, the existing dashboard falls back to periodic session refresh. `NEON_REALTIME_SECRET` is never returned by the health endpoint or sent to the browser.

## 5. Vercel frontend

Set the Vercel project root to `frontend`. The static site calls the Render API and does not connect directly to Neon. Do not add `DATABASE_URL`, `NEON_REALTIME_SECRET`, Telegram credentials, or the admin key to Vercel. See [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md).
