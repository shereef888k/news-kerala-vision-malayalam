# Vercel Frontend Deployment

The frontend is static HTML, CSS, and JavaScript. Set the Vercel project root to `frontend`; the deployed site serves `demo.html`, `admin.html`, and `config.js` directly from `/`.

## Configure the project

1. Import the repository into Vercel and select the project associated with `news-kerala-vision-malayalam-fronte-five.vercel.app`.
2. Set **Root Directory** to `frontend`.
3. Use the **Other** framework preset. Leave the build command blank and set the output directory to `.`. There is no frontend build step.
4. Deploy. The admin console is at `https://news-kerala-vision-malayalam-fronte-five.vercel.app/admin.html`; the public landing page is at the domain root.

`frontend/config.js` points to the live API at `https://camera-security-demo-1.onrender.com`. The older `news-kerala-vision-malayalam.onrender.com` host currently serves the website redirect and returns 404 for `/api/health`; it is not the API. Do not place `ADMIN_API_KEY`, `TELEGRAM_BOT_TOKEN`, or `TELEGRAM_CHAT_ID` in Vercel environment variables for this static site or in any frontend file. Admins enter the key in the existing console; it is never part of visitor links.

## Configure and verify the backend connection

On the Render service, set `FRONTEND_ORIGIN` to exactly:

```text
https://news-kerala-vision-malayalam-fronte-five.vercel.app
```

The API allows the Vercel origin and responds to browser `OPTIONS` preflight requests. After both services deploy:

1. Open `https://camera-security-demo-1.onrender.com/api/health`. Confirm JSON reports `status: "ok"`, `database: "connected"`, `storageProvider: "neon"`, `persistentStorageConfigured: true`, and `realtimeConfigured: true` after the backend update deploys.
2. Open `https://news-kerala-vision-malayalam-fronte-five.vercel.app/admin.html`, enter the Render `ADMIN_API_KEY` in **Backend & Credentials**, and click **Save Settings** and **Test Ping**.
3. Create the permanent demo link once and copy it. The URL uses `/demo.html?link=...`; share this visitor URL, never the admin page or admin key.
4. Open the visitor URL in separate browser sessions. Each one receives an independent session. The notice explains that Continue requests camera access and granting native permission automatically captures and submits one photo; denying or cancelling permission sends nothing.

If the Vercel project is later assigned a different custom domain, add that exact origin to Render's `FRONTEND_ORIGIN` and the allowlist in `backend/server.js`, then redeploy the backend.

The static frontend does not connect directly to Neon. The admin session list receives live updates from the authenticated Render endpoint; Neon connection strings and `NEON_REALTIME_SECRET` stay on Render.
