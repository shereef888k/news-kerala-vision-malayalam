# Cross-Platform Camera Security Demonstration Platform

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.5.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.21.2-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Neon](https://img.shields.io/badge/Database-Neon%20PostgreSQL-00E599?logo=postgresql&logoColor=white)](https://neon.com/)
[![Telegram Bot API](https://img.shields.io/badge/Telegram-Bot%20API%20sendPhoto-26A5E4?logo=telegram&logoColor=white)](https://core.telegram.org/bots/api#sendphoto)
[![Tests](https://img.shields.io/badge/Tests-51%20Passed-brightgreen)](https://nodejs.org/api/test.html)

A professional, consent-based Phishing & Camera Security Awareness Demonstration platform designed to evaluate browser permission models and social engineering recognition across desktop and mobile devices.

The platform provides a modern, video-style landing page with video playback simulation, thumbnails, and advertisement-style content, with zero camera access on initial page load or ordinary video playback. A separate, clearly disclosed **Phishing Awareness Simulation** allows visitors to understand how misleading pages lure users and how browser security protects them:
- **Safe Simulation Mode**: Uses a prerecorded synthetic test graphic (100% safe, zero camera hardware access).
- **Live Hardware Gate Mode**: Clearly discloses the camera flow and invokes the browser's native permission prompt only after consent.
- **Awareness Debrief**: Explains critical red flags (context mismatch, social engineering lures, native permission gates, hardware LED status) and reviews non-sensitive demonstration telemetry (`page_opened`, `demo_button_clicked`, `simulation_completed`).

> [!IMPORTANT]
> **Strict Consent Protocol**: This is an educational security awareness platform. It incorporates **zero hidden capture**, **no covert tracking**, **no permission bypasses**, and **no disguise of camera access as video playback**. All camera access is clearly disclosed on a dedicated demonstration page and strictly respects browser permission gates.

---

## Live Deployments

- **Frontend (Vercel)**: [https://news-kerala-vision-malayalam-fronte-five.vercel.app](https://news-kerala-vision-malayalam-fronte-five.vercel.app)
- **Backend API (Render)**: [https://camera-security-demo-1.onrender.com](https://camera-security-demo-1.onrender.com/)

---

## Browser Compatibility

| Platform | Browsers | Support | Notes |
| :--- | :--- | :--- | :--- |
| **Apple iOS & iPadOS** | Safari, Chrome, Edge, Firefox | Supported | Requires HTTPS. Supported permission prompt. |
| **Android** | Chrome, Firefox, Edge, Brave, Samsung Internet | Supported | Requires HTTPS. Native permission prompt. |
| **Windows Desktop** | Chrome, Edge, Firefox, Brave, Opera | Supported | Hardware indicator light auditing. |
| **macOS Desktop** | Safari, Chrome, Firefox, Edge | Supported | Green indicator light turns off immediately on capture. |
| **Linux Desktop** | Chrome, Firefox | Supported | Standard V4L2 device security testing. |

---

## Architectural Overview

The repository is organized into two decoupled applications:

```text
├── frontend/                     # Static HTML5/CSS3/Vanilla JS (Vercel or GitHub Pages)
│   ├── index.html                # Video-style landing page (thumbnail, video player, ad content)
│   ├── demo.html                 # Separate educational camera awareness test (no live preview)
│   ├── admin.html                # Administrator console & session manager
│   ├── style.css                 # Dark navy & slate security design system
│   ├── app.js                    # Admin dashboard, realtime session updates & link copying
│   ├── demo.js                   # Landing page video loop & camera snapshot / delivery logic
│   └── config.js                 # Public backend URL resolver (Zero secrets)
├── backend/                      # Production Node.js & Express REST API
│   ├── server.js                 # Express server with Helmet, CORS & Rate Limiting
│   ├── package.json              # Backend dependencies & test scripts
│   ├── .env.example              # Environment variables template
│   ├── routes/
│   │   ├── sessions.js           # Session generation, verification & revocation
│   │   └── photos.js             # Multipart upload, MIME check & Telegram delivery
│   ├── services/
│   │   ├── db.js                 # Neon in production; SQLite test adapter in tests
│   │   ├── db-postgres.js        # Neon PostgreSQL pool and persistent schema
│   │   ├── realtime.js           # Server-only Neon Realtime subscriptions
│   │   └── telegram.js           # Telegram Bot API sendPhoto integration
│   ├── middleware/
│   │   ├── auth.js               # Timing-safe Administrator API key middleware
│   │   └── errorHandler.js       # Centralized error & 404 handler
│   └── tests/                    # Automated test suites (node:test & Supertest)
│       ├── sessions.test.js      # Session lifecycle & authentication tests
│       ├── photos.test.js        # Photo submission & Mocked Telegram tests
│       └── security.test.js      # CORS, Helmet & health check tests
├── docs/                         # In-depth operational guides
│   ├── API_DOCUMENTATION.md      # Full REST API specification with examples
│   ├── GITHUB_PAGES_DEPLOYMENT.md# Guide for hosting frontend on GitHub Pages
│   ├── BACKEND_DEPLOYMENT.md     # Production deployment (Render, Railway, VPS)
│   ├── TELEGRAM_BOT_SETUP.md     # Step-by-step BotFather & Chat ID guide
│   ├── SECURITY_CHECKLIST.md     # Comprehensive security & privacy checklist
│   └── TROUBLESHOOTING.md        # Camera permissions & Telegram error solutions
└── .github/workflows/
    └── deploy-frontend.yml       # Automated GitHub Pages CI/CD workflow
```

---

## Quick Start (Local Setup)

### 1. Prerequisites
- **Node.js** >= 22.5.0 (the SQLite test adapter uses the built-in Node SQLite driver)
- A **Telegram account** (for receiving submitted photos)

---

### 2. Configure Neon and Start the Backend

1. Install root and backend dependencies:
   ```bash
   npm install
   npm install --prefix backend
   ```
2. Sign in to Neon and deploy the services declared in `neon.ts`:
   ```bash
   neon login
   neon deploy
   ```
   Neon writes `DATABASE_URL`, `NEON_REALTIME_URL`, and `NEON_REALTIME_SECRET` to the ignored root `.env.local`. The backend loads this file automatically; keep the Realtime secret on the server.
3. Copy `backend/.env.example` to `backend/.env` and set `ADMIN_API_KEY`, Telegram credentials, and local `FRONTEND_ORIGIN`. Do not put Neon secrets in the static frontend.
4. Build-check the JavaScript and Neon config, then start the backend:
   ```bash
   npm run build
   npm start
   ```
   The backend starts at `http://localhost:4000`. Check `http://localhost:4000/api/health` for Neon PostgreSQL and Realtime status.

---

### 3. Launch the Frontend

You can serve the `frontend/` directory with any static file server:

```bash
# Using Python (built-in on Windows/macOS/Linux)
python -m http.server 3000 --directory frontend

# OR using Node's npx serve
npx -y serve frontend -p 3000
```

1. Open your browser to the **Admin Dashboard**:
   ```text
   http://localhost:3000/admin.html
   ```
2. In **Backend & Credentials**, enter your `ADMIN_API_KEY` and click **Save Settings**.
3. In **Permanent Reusable Demo Link**, create or copy the link once. It stays valid until an administrator disables or revokes it.
4. Each visit receives a separate, time-limited session. The notice explains that tapping Continue requests camera access and, after native permission is granted, automatically captures and submits one photo. Denying or cancelling permission sends nothing.

---

## Demonstration Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Visitor
    participant Landing as Video Landing Page (index.html)
    participant DemoPage as Camera Test Page (demo.html)
    participant Browser as Device / Browser
    participant Backend as Render Backend API
    participant Telegram as Telegram Bot API

    Visitor->>Landing: Visits landing page
    Landing->>Visitor: Plays educational video animation & shows tech content (Zero camera access)
    Visitor->>DemoPage: Navigates to separate Educational Camera Security Test
    DemoPage->>Visitor: Discloses camera access, one automatic photo, and Telegram delivery
    Visitor->>DemoPage: Chooses Continue
    DemoPage->>Browser: Requests navigator.mediaDevices.getUserMedia()
    Browser->>Visitor: Displays native browser camera permission dialog
    Visitor->>Browser: Approves camera permission
    DemoPage->>Browser: Captures exactly one photo after permission
    DemoPage->>Browser: Stops camera tracks immediately after capture
    Browser-->>Visitor: Device camera indicator / green dot turns off
    DemoPage->>Backend: Automatically POSTs /api/sessions/:id/photo (Multipart JPEG)
    Backend->>Telegram: sendPhoto(photoBuffer, caption)
    Telegram-->>Backend: 200 OK (Delivered)
    Backend-->>DemoPage: 200 OK (Submission confirmed)
    DemoPage->>Visitor: Redirects after the server confirms submission, with no completion screen
```

---

## Running Automated Tests

The backend includes a comprehensive automated test suite testing session issuance, expiration, revocation, timing-safe authentication, image validation, rate limiting, and Telegram API mocking:

```bash
cd backend
npm test
```

The current 50-test suite covers backend and browser flow, automatic single-photo submission, denied permission handling, permanent-link lifecycle, API URL correction, storage-path validation, database reopen persistence, preflight handling, and five independent visitor sessions.

---

## Detailed Documentation Guides

- **[Telegram Bot Setup Guide](docs/TELEGRAM_BOT_SETUP.md)**: How to create a bot with BotFather, start the conversation, and find your Chat ID.
- **[GitHub Pages Deployment Guide](docs/GITHUB_PAGES_DEPLOYMENT.md)**: How to publish the frontend to GitHub Pages with automatic subpath handling.
- **[Backend Production Deployment Guide](docs/BACKEND_DEPLOYMENT.md)**: Deploying to Render, Railway, or Linux VPS with persistent volumes and CORS.
- **[Vercel Deployment Guide](docs/VERCEL_DEPLOYMENT.md)**: Configure the static frontend project and API URL.
- **[REST API Documentation](docs/API_DOCUMENTATION.md)**: Detailed endpoint schemas, request parameters, responses, and error codes.
- **[Security Checklist](docs/SECURITY_CHECKLIST.md)**: Review of security measures, consent architecture, and secrets isolation.
- **[Troubleshooting Guide](docs/TROUBLESHOOTING.md)**: Fix camera permission prompts on iOS/Android and solve Telegram error codes.

---

## License

This project is open-source under the [MIT License](LICENSE).
