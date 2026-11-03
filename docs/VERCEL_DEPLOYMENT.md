# Vercel Frontend Deployment

The frontend is static HTML, CSS, and JavaScript. Keep the repository root as the Vercel project root because the root `index.html` redirects into `frontend/` and the generated share URLs point to `/frontend/demo.html`.

## Configure the project

1. Import the repository into Vercel and select the project associated with `news-kerala-vision-malayalam-fronte-five.vercel.app`.
2. Set **Root Directory** to `.` (repository root) and leave **Include files outside the Root Directory** enabled if Vercel shows that option.
3. Use the **Other** framework preset. Leave the build command blank and set the output directory to `.`. There is no frontend build step.
4. Deploy. The admin console is at `https://news-kerala-vision-malayalam-fronte-five.vercel.app/frontend/admin.html`; the public landing page is at the domain root.

`frontend/config.js` already points to `https://news-kerala-vision-malayalam.onrender.com`. Do not place `ADMIN_API_KEY`, `TELEGRAM_BOT_TOKEN`, or `TELEGRAM_CHAT_ID` in Vercel environment variables for this static site or in any frontend file. Admins enter the key in the existing console, which stores it in that browser's local storage and sends it in authenticated admin requests. It is never part of visitor links.

## Configure and verify the backend connection

On the Render service, set `FRONTEND_ORIGIN` to exactly:

```text
https://news-kerala-vision-malayalam-fronte-five.vercel.app
```

The API allows the Vercel origin and responds to browser `OPTIONS` preflight requests. After both services deploy:

1. Open `https://news-kerala-vision-malayalam.onrender.com/api/health`. Confirm JSON reports `status: "ok"` and `database: "connected"`.
2. Open `https://news-kerala-vision-malayalam-fronte-five.vercel.app/frontend/admin.html`, enter the Render `ADMIN_API_KEY` in **Backend & Credentials**, and click **Save Settings** and **Test Ping**.
3. Create the permanent demo link once and copy it. The URL uses `/frontend/demo.html?link=...`; share this visitor URL, never the admin page or admin key.
4. Open the visitor URL in separate browser sessions. Each one receives an independent session; the URL stays active until an admin disables or revokes it.

If the Vercel project is later assigned a different custom domain, add that exact origin to Render's `FRONTEND_ORIGIN` and the allowlist in `backend/server.js`, then redeploy the backend.
