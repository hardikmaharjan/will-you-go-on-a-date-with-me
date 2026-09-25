# Lily Date Invitation

A React date invitation with a Node.js API that saves completed plans to Supabase PostgreSQL in production, with local SQLite as a development fallback.

## Run locally

Requires Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

Open the URL printed by Vite. The first run creates a strong admin password in `.local-admin-password` (the file is ignored by Git). Open `/admin` on the same site and enter that password to view submitted plans. By default, local development saves plans to `data/plans.db`.

## Supabase storage

In the Supabase SQL Editor, run [`supabase/schema.sql`](supabase/schema.sql) to create the plans table. Add `SUPABASE_URL` and `SUPABASE_SECRET_KEY` to the backend environment. The secret key must only be set on the server (for example, as a Render secret); never add it to Vite's `VITE_*` variables or client code. When both variables are present, the backend uses Supabase instead of SQLite.

If hosting the frontend on Vercel and the backend on Render, set `VITE_API_BASE_URL` in Vercel to the Render service's base URL, and set `FRONTEND_ORIGIN` in Render to the exact Vercel site origin (for example, `https://your-project.vercel.app`). Redeploy both services after changing environment variables. The Supabase secret belongs only in Render.

## Production

```sh
npm run build
npm start
```

Set `ADMIN_PASSWORD` to a private value of at least 20 characters, plus `SUPABASE_URL` and `SUPABASE_SECRET_KEY` for durable hosted storage. Keep the admin page behind HTTPS. Without Supabase, the backend uses SQLite and needs a persistent writable `DATA_DIR` on hosts with temporary filesystems.

The invitation submits the activity, selected day, and note to this app’s backend when the user clicks “Send our plan.” The `/admin` dashboard requires the admin password. No plan information is sent to a third party.
