# Backend Production Deployment Guide

This guide describes how to deploy the Node.js Express backend service to modern cloud platforms with HTTPS and persistent SQLite storage.

---

## 1. Cloud Provider Recommendations

The backend requires:
- **Node.js** >= 18.0.0 (Node 20 LTS or Node 22+ recommended).
- **HTTPS** endpoint (required by browsers for secure CORS and camera communication).
- **Environment variables** support.
- **Persistent storage** for the SQLite sessions database (`sessions.db`).

Recommended providers:
1. **Render.com** (Web Service with optional Persistent Disk).
2. **Railway.app** (Volume attached to service).
3. **Fly.io** (Fly Volume mounted at `/data`).
4. **DigitalOcean / Hetzner / AWS Lightsail** (Standard VPS with full filesystem control).

---

## 2. Deploying to Render.com

The repository includes `render.yaml`, configured for the supplied Render backend, a 1 GB persistent disk mounted at `/var/data`, and SQLite at `/var/data/sessions.db`. Deploy using Render's Blueprint flow so the disk and database path are provisioned together. Production now requires both `DATABASE_PATH` and `PERSISTENT_STORAGE_ROOT`, and refuses a database path outside the declared root. Also confirm the persistent disk is actually attached to this Render service: a directory with the right name on an ephemeral filesystem is not persistent.

### Step 1: Create the Blueprint service
1. Log in to [Render.com](https://render.com) and choose **New +** then **Blueprint**.
2. Connect the GitHub repository containing this project and select its `render.yaml`.
3. Confirm this is the `camera-security-demo-1` API service, with root directory `backend`, build command `npm install`, start command `npm start`, and health path `/api/health`. The separate `news-kerala-vision-malayalam.onrender.com` host serves the website redirect, not the API.
4. The Blueprint uses a Starter service because Render persistent disks require a paid service plan.
5. Keep this SQLite-backed service to one instance; Render persistent disks are attached to one service instance and cannot be shared across horizontally scaled instances.

### Step 2: Configure Persistent Disk (Important)
> [!NOTE]
> Without a persistent disk, the SQLite database and permanent-link record can disappear on restart or redeploy. The reusable link therefore requires a disk-backed database.

1. Under the service's **Disks** tab, confirm the Blueprint-created disk exists.
2. Mount Path: `/var/data`; Size: `1 GB`.
3. Confirm `DATABASE_PATH=/var/data/sessions.db` exactly. Do not point SQLite to the service's ephemeral application directory.

### Step 3: Set Environment Variables
Under the **Environment** tab on Render, add:

| Key | Example Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production security optimizations. |
| `PORT` | `10000` | Render default web port (automatically populated). |
| `ADMIN_API_KEY` | `8c4d9e2a7b1f6305a...` | Cryptographically random admin key. |
| `TELEGRAM_BOT_TOKEN` | `7123456789:AAFl...` | Official Telegram Bot Token from BotFather. |
| `TELEGRAM_CHAT_ID` | `987654321` | Numeric Telegram chat identifier. |
| `FRONTEND_ORIGIN` | `https://news-kerala-vision-malayalam-fronte-five.vercel.app` | Exact deployed Vercel origin; no trailing slash. |
| `DATABASE_PATH` | `/var/data/sessions.db` | Path to persistent storage disk. |
| `PERSISTENT_STORAGE_ROOT` | `/var/data` | Attached disk mount root containing the SQLite database. |
| `DEMO_SESSION_DURATION_MINUTES` | `30` | Lifetime of each visitor session created from the reusable link. |

---

## 3. Deploying to Railway.app

1. Log in to [Railway.app](https://railway.app) and create a **New Project** &rarr; **Deploy from GitHub repo**.
2. Set Root Directory to `/backend`.
3. Under **Settings** &rarr; **Volumes**, click **Add Volume** mounted to `/app/data`.
4. Under **Variables**, add:
   - `ADMIN_API_KEY=<secure-random-key>`
   - `TELEGRAM_BOT_TOKEN=<token>`
   - `TELEGRAM_CHAT_ID=<chat-id>`
   - `FRONTEND_ORIGIN=https://news-kerala-vision-malayalam-fronte-five.vercel.app`
   - `DATABASE_PATH=/app/data/sessions.db`
   - `PERSISTENT_STORAGE_ROOT=/app/data`
5. Click **Generate Domain** under Networking to get your public HTTPS URL.

---

## 4. Deploying to a Linux VPS (Ubuntu/Debian with Systemd & Nginx)

1. Clone repository and install dependencies:
   ```bash
   cd /var/www/camera-demo/backend
   npm install --omit=dev
   ```
2. Create production `.env` file:
   ```bash
   cp .env.example .env
   nano .env
   ```
3. Set up a systemd service (`/etc/systemd/system/camera-backend.service`):
   ```ini
   [Unit]
   Description=Camera Security Demonstration Backend
   After=network.target

   [Service]
   Type=simple
   User=www-data
   WorkingDirectory=/var/www/camera-demo/backend
   ExecStart=/usr/bin/node server.js
   Restart=on-failure
   EnvironmentFile=/var/www/camera-demo/backend/.env

   [Install]
   WantedBy=multi-user.target
   ```
   Set `DATABASE_PATH` to a file under your attached persistent disk and `PERSISTENT_STORAGE_ROOT` to that disk's mount path in the production `.env`.
4. Start and enable service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now camera-backend
   ```
5. Configure Nginx reverse proxy with Certbot SSL:
   ```nginx
   server {
       server_name api.yourdomain.com;

       location / {
           proxy_pass http://127.0.0.1:4000;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```
   ```bash
   sudo certbot --nginx -d api.yourdomain.com
   ```

---

## 5. Free-Tier Limitations & Storage Caveats

### Ephemeral Filesystem vs. Persistent Disks
- **Free Tier Sleep & Cold Starts**: On free tiers (e.g. Render Free Web Services), instances spin down after 15 minutes of inactivity. The first incoming request will trigger a cold start taking ~30–50 seconds. The Admin Dashboard handles this gracefully with a "Checking API..." indicator.
- **Data Persistence**: A deployment without a persistent disk can lose the permanent-link record, sessions, and history on restart or redeploy. Do not use an ephemeral filesystem for this project when the reusable link must remain valid. Attach a persistent disk or use a managed database.

### Database Initialization & Migration
- SQLite requires no manual setup. On startup, `services/db.js` creates missing tables/indexes and applies a non-destructive migration for older session databases. It does not delete or recreate an existing database.
- Keep the attached persistent disk mounted across deploys. Do not manually delete `sessions.db`, `sessions.db-wal`, or `sessions.db-shm` while the service is running.

### Managed Database Alternatives (for Serverless / Distributed Hosts)
If deploying to environments where local disk storage is prohibited (e.g., AWS Lambda, Vercel Serverless, Cloudflare Workers):
- **Turso (Hosted libSQL / SQLite)**: Fully compatible with SQLite queries over HTTP/WebSocket without requiring a local file.
- **Supabase / Managed PostgreSQL**: Can replace the SQLite layer by swapping `services/db.js` queries to PostgreSQL `pg` pool.

---

## 6. Post-Deployment Verification

1. Test the health endpoint:
   ```bash
   curl https://camera-security-demo-1.onrender.com/api/health
   ```
   Expected response: `HTTP/2 200` with JSON body:
   ```json
   {
     "status": "ok",
  "database": "connected",
  "persistentStorageConfigured": true
   }
   ```
2. Test CORS rejection:
   ```bash
   curl -i -H "Origin: https://unauthorized-domain.com" https://camera-security-demo-1.onrender.com/api/health
   ```
   Expected response: `403 Forbidden: CORS blocked`.

3. Test the Vercel CORS preflight:
   ```bash
   curl -i -X OPTIONS https://camera-security-demo-1.onrender.com/api/admin/permanent-link \
     -H "Origin: https://news-kerala-vision-malayalam-fronte-five.vercel.app" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: x-admin-key"
   ```
   Expect a successful `2xx` response and an `Access-Control-Allow-Origin` header matching the Vercel origin.
4. Redeploy once and verify `/api/health` reports both `"database":"connected"` and `"persistentStorageConfigured":true`; the admin console should still display the same permanent URL and session history.

## 7. Deploying the Vercel Frontend

Follow [the Vercel deployment guide](VERCEL_DEPLOYMENT.md). The frontend's production API default is `https://camera-security-demo-1.onrender.com`. If changing domains, update `frontend/config.js` and the backend `FRONTEND_ORIGIN` environment variable together, then redeploy both services.
