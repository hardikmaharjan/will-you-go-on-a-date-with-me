# Lily Date Invitation

A React date invitation with a Node.js API that saves completed plans to a local SQLite database.

## Run locally

Requires Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

Open the URL printed by Vite. The first run creates a strong admin password in `.local-admin-password` (the file is ignored by Git). Open `/admin` on the same site and enter that password to view submitted plans. Each plan is saved to `data/plans.db`.

## Production

```sh
npm run build
npm start
```

Set `ADMIN_PASSWORD` to a private value of at least 20 characters and `DATA_DIR` to a persistent writable directory in the hosting environment. Keep the admin page behind HTTPS. Hosts with temporary filesystems may erase the database when the app restarts unless a persistent disk is configured.

The invitation submits the activity, selected day, and note to this app’s backend when the user clicks “Send our plan.” The `/admin` dashboard requires the admin password. No plan information is sent to a third party.
