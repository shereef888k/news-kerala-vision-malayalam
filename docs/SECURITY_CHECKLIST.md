# Security & Privacy Checklist

This document details the security controls, privacy-by-design patterns, and threat mitigations implemented across the Camera Security Demonstration platform.

---

## 1. Consent Architecture & Ethical Demonstration Standard

- [x] **Explicit Consent Gate**: The visitor sees a notice before Continue stating that the page requests camera access and, if granted, automatically captures and sends one photo to the configured Telegram destination.
- [x] **Native Permission Gate**: The page calls `navigator.mediaDevices.getUserMedia()` directly from the Continue tap. A denied or cancelled browser prompt creates no visitor session, captures no photo, and sends no photo.
- [x] **Single Automatic Capture and Submission**: After permission is granted, the page captures one frame without a live preview or second confirmation and submits that photo through the existing backend API.
- [x] **Camera Cleanup**: Camera tracks stop immediately after the frame is captured and also stop on page exit.
- [x] **Transparent Education**: The visitor interface clearly explains where the photo is delivered (the administrator's Telegram chat) and for what purpose.

---

## 2. Secrets Management & Credential Protection

- [x] **Strict Separation of Secrets**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and `ADMIN_API_KEY` reside exclusively in backend environment variables (`.env`).
- [x] **No Secrets in Frontend Artifacts**: `config.js`, `app.js`, `demo.js`, and HTML files contain zero credentials, chat IDs, or API keys.
- [x] **Repository Protection**: `.gitignore` strictly excludes `.env`, `*.key`, `*.pem`, and local database files.
- [x] **API Response Sanitization**: Public session endpoints (`GET /api/sessions/:id`) expose only non-sensitive metadata (`id`, `label`, `status`, `expiresAt`). The bot token and chat ID are never returned in any response.

---

## 3. Session Security & Access Controls

- [x] **Cryptographically Secure Random IDs**: Session identifiers are generated using `crypto.randomBytes(16).toString('hex')`, preventing ID enumeration or guessing.
- [x] **Time-Bounded Lifespan**: Every session has an explicit `expires_at` timestamp (default 15–30 minutes). Expired sessions are rejected automatically with `410 Gone`.
- [x] **Duplicate UI Submission Guard**: The visitor page issues only one automatic photo request per visitor session. Existing administrator-created time-limited links remain single-use; each public permanent-link visit receives a separate expiring session.
- [x] **Administrator Revocation**: Administrators can invalidate any active link instantly via `POST /api/sessions/:id/revoke`.
- [x] **Timing-Safe Admin Authentication**: Admin API keys are validated using `crypto.timingSafeEqual` to prevent side-channel timing attacks.

---

## 4. Network & Input Validation Controls

- [x] **In-Memory Photo Processing**: Photos are held in volatile RAM buffers (`multer.memoryStorage()`) and forwarded directly to the Telegram API. Photographs are never written to disk.
- [x] **Strict MIME Type Whitelisting**: Only `image/jpeg`, `image/png`, and `image/webp` are accepted. Executables, scripts, and non-image payloads are rejected with `400 Bad Request`.
- [x] **Payload Size Limits**: Strict 10 MB upload ceiling enforced by Multer. Oversized uploads return `413 Payload Too Large`.
- [x] **Rate Limiting**:
  - Global API limiter: 200 requests / 15 minutes.
  - Photo submission limiter: 20 submissions / 15 minutes per IP.
- [x] **CORS Whitelisting**: Cross-Origin Resource Sharing is locked to the configured `FRONTEND_ORIGIN` in production. Unapproved origins receive `403 Forbidden`.
- [x] **HTTP Security Headers**: Powered by `helmet`, enforcing `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and cross-origin resource isolation.

---

## 5. Client-Side Hardware & Browser Safety

- [x] **Secure Context Requirement**: Enforces `window.isSecureContext === true` (HTTPS or localhost).
- [x] **Standard Web APIs**: Relies strictly on standard `navigator.mediaDevices.getUserMedia()`. No deceptive plugins, permissions workarounds, or obfuscated payloads.
- [x] **Canvas Image Optimization**: Photos are scaled down to a maximum dimension of 1280px and compressed to JPEG (quality 0.85) prior to transmission, saving mobile bandwidth and removing unnecessary sensor metadata.
- [x] **Tab Visibility / Lifecycle Cleanup**: Listens to `beforeunload`, `pagehide`, and `visibilitychange` to release camera hardware if the user navigates away or hides the tab.
