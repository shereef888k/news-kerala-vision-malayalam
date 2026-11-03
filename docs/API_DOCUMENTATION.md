# API Specification & Reference Documentation

The Camera Security Demonstration backend exposes a RESTful JSON API for session generation, state tracking, and consent-based photo dispatch.

---

## Base URL & Authentication

- **Base URL**: `https://<your-backend-host>/api`
- **Administrator Authentication**: Privileged endpoints require the `X-Admin-Key` header or `Authorization: Bearer <key>`.
- **Public Visitor Endpoints**: `GET /api/sessions/:id`, `POST /api/sessions/:id/opened`, and `POST /api/sessions/:id/photo` require valid session references and no admin credentials.

---

## Endpoints Overview

| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Public | System status, uptime, and database connectivity. |
| `POST` | `/api/sessions` | **Admin Required** | Issues a new cryptographic demonstration session. |
| `GET` | `/api/sessions` | **Admin Required** | Lists all generated demonstration sessions. |
| `POST` | `/api/sessions/demo` | Public link token | Mints an independent, expiring visitor session from the enabled permanent link (or a legacy single-use link). |
| `GET` | `/api/sessions/:id` | Public | Fetches limited public information for a session. |
| `POST` | `/api/sessions/:id/opened` | Public | Records that a visitor opened the demonstration link. |
| `POST` | `/api/sessions/:id/photo` | Public | Submits a captured photo and dispatches it to Telegram. |
| `POST` | `/api/sessions/:id/revoke` | **Admin Required** | Immediately invalidates an active session link. |
| `GET` | `/api/admin/permanent-link` | **Admin Required** | Reads the permanent link and its enabled/disabled/revoked state. |
| `GET` | `/api/admin/sessions/realtime` | **Admin Required** | Streams session-list updates from Neon Realtime as server-sent events. |
| `POST` | `/api/admin/permanent-link` | **Admin Required** | Creates the permanent link, or returns the existing link. |
| `POST` | `/api/admin/permanent-link/:id/status` | **Admin Required** | Enables or disables the permanent link. |
| `POST` | `/api/admin/permanent-link/:id/revoke` | **Admin Required** | Revokes the permanent link; revocation is permanent. |

---

## 1. Health Check

### `GET /api/health`
Verifies backend operational status, Neon database connectivity, Realtime configuration, and server version.

#### Request Example
```http
GET /api/health HTTP/1.1
Host: api.example.com
```

#### Response `200 OK`
```json
{
  "status": "ok",
  "service": "Camera Security Demonstration API",
  "uptimeSeconds": 3600,
  "timestamp": "2026-10-26T12:00:00.000Z",
  "version": "1.0.0",
  "database": "connected",
  "persistentStorageConfigured": true,
  "storageProvider": "neon",
  "realtimeConfigured": true
}
```

---

## 2. Session Management

### `GET /api/admin/sessions/realtime`
Opens an administrator-authenticated `text/event-stream` connection. A `sessions` event contains the same session rows as `GET /api/sessions`, updated from Neon Realtime. The connection closes when the client disconnects. The Neon Realtime secret is never returned to the caller.

#### Request Example
```http
GET /api/admin/sessions/realtime HTTP/1.1
Accept: text/event-stream
X-Admin-Key: <admin-key>
```

### `POST /api/sessions/demo`
Creates a new, independent visitor session. The permanent URL token is a public bearer value and must never contain or replace the administrator key. The endpoint accepts requests only for an enabled permanent link or a valid, unused legacy session link.

#### Request Body
```json
{
  "permanentLinkToken": "<64-character-random-token>"
}
```

#### Response `201 Created`
```json
{
  "success": true,
  "message": "Public demonstration session created.",
  "session": {
    "id": "<unique-session-id>",
    "label": "Permanent Link Visitor",
    "status": "created",
    "createdAt": "2026-11-03T12:00:00.000Z",
    "expiresAt": "2026-11-03T12:30:00.000Z",
    "submittedAt": null
  }
}
```

Visitor session lifetime is configured by `DEMO_SESSION_DURATION_MINUTES` (default 30 minutes). The permanent link has no time-based expiration; an administrator can disable or revoke it. Missing or invalid link tokens are rejected, and administrators can continue to issue optional time-limited legacy links through `POST /api/sessions`.

### Permanent link administration

These endpoints require the `X-Admin-Key` header. They expose the public link token only to an authenticated administrator.

- `GET /api/admin/permanent-link` returns the latest link or `null`.
- `POST /api/admin/permanent-link` creates a link if none exists, otherwise returns the existing non-revoked link.
- `POST /api/admin/permanent-link/:id/status` accepts `{ "enabled": true }` or `{ "enabled": false }`. A disabled link can be re-enabled; a revoked link cannot.
- `POST /api/admin/permanent-link/:id/revoke` permanently revokes the current link. A replacement requires a new link and URL.

Disabling or revoking a permanent link also prevents its existing visitor sessions from opening or submitting photos.

---

### `POST /api/sessions`
Generates a new time-bounded session reference.

#### Headers
- `X-Admin-Key`: `<ADMIN_API_KEY>`
- `Content-Type`: `application/json`

#### Request Body
```json
{
  "label": "Audit iOS Safari",
  "durationMinutes": 30
}
```

#### Response `201 Created`
```json
{
  "success": true,
  "message": "Session created successfully.",
  "session": {
    "id": "670c9bfc8536540a76376d0b8c08a1f4",
    "label": "Audit iOS Safari",
    "status": "created",
    "createdAt": "2026-10-26T12:00:00.000Z",
    "expiresAt": "2026-10-26T12:30:00.000Z",
    "submittedAt": null
  }
}
```

#### Error Responses
- `401 Unauthorized`: Missing or incorrect `X-Admin-Key`.
- `403 Forbidden`: Public session creation attempted without a valid public link.
- `404 Not Found`: Permanent link token or legacy source session does not exist. A missing permanent-link record means the API is using a different or empty database; the public URL itself has no expiration time. Confirm the frontend uses the correct API and, when migrating, import the prior SQLite records into Neon.
- `409 Conflict`: Legacy single-use link was already used.
- `410 Gone`: Legacy source session expired.
- `400 Bad Request`: `durationMinutes` is less than 1 or exceeds 10080.

---

### `GET /api/sessions`
Retrieves all demonstration sessions for administrative monitoring.

#### Headers
- `X-Admin-Key`: `<ADMIN_API_KEY>`

#### Response `200 OK`
```json
{
  "success": true,
  "sessions": [
    {
      "id": "670c9bfc8536540a76376d0b8c08a1f4",
      "label": "Audit iOS Safari",
      "status": "opened",
      "createdAt": "2026-10-26T12:00:00.000Z",
      "expiresAt": "2026-10-26T12:30:00.000Z",
      "submittedAt": null
    }
  ]
}
```

---

### `GET /api/sessions/:id`
Retrieves public session metadata to determine validity before starting the visitor camera.

#### Response `200 OK`
```json
{
  "success": true,
  "id": "670c9bfc8536540a76376d0b8c08a1f4",
  "label": "Audit iOS Safari",
  "status": "opened",
  "createdAt": "2026-10-26T12:00:00.000Z",
  "expiresAt": "2026-10-26T12:30:00.000Z"
}
```

#### Error Responses
- `400 Bad Request`: Malformed session ID.
- `404 Not Found`: Session does not exist.

---

### `POST /api/sessions/:id/opened`
Called when the visitor page loads to transition state from `created` to `opened`.

#### Response `200 OK`
```json
{
  "success": true,
  "status": "opened"
}
```

#### Error Responses
- `403 Forbidden`: Session has been revoked.
- `410 Gone`: Session has expired.

---

### `POST /api/sessions/:id/revoke`
Immediately revokes an active demonstration link.

#### Headers
- `X-Admin-Key`: `<ADMIN_API_KEY>`

#### Response `200 OK`
```json
{
  "success": true,
  "message": "Session #670c9bfc revoked successfully."
}
```

---

## 3. Photo Submission & Dispatch

### `POST /api/sessions/:id/photo`
Receives the single photo captured after the visitor chose Continue and granted native browser camera permission, validates session eligibility, and delivers it to Telegram. The visitor page sends the request automatically after capture and redirects only after the backend confirms successful delivery.

#### Headers
- `Content-Type`: `multipart/form-data`

#### Form Parameters
- `photo`: Binary file (`image/jpeg`, `image/png`, or `image/webp`). Max size: `10 MB`.

#### Response `200 OK`
```json
{
  "success": true,
  "message": "Photo explicitly submitted and delivered to administrator Telegram chat.",
  "session": {
    "id": "670c9bfc8536540a76376d0b8c08a1f4",
    "status": "submitted",
    "submittedAt": "2026-10-26T12:05:14.321Z"
  }
}
```

#### Error Responses
- `400 Bad Request`: Missing file or unsupported MIME type.
- `403 Forbidden`: Session has been revoked.
- `404 Not Found`: Session does not exist.
- `409 Conflict`: A photo was already submitted for this single-use session.
- `410 Gone`: Session has expired.
- `413 Payload Too Large`: Photo exceeds 10 MB limit.
- `429 Too Many Requests`: Submission rate limit reached.
- `502 Bad Gateway`: Telegram Bot API rejected delivery or was unreachable.
- `503 Service Unavailable`: Telegram Bot is not configured on the backend.
