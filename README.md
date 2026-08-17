# MSParty

Watch-party MVP: a Next.js web application, a Socket.io sync service, and a Manifest V3 browser extension. Copy `.env.example` to `.env` and configure PostgreSQL, NextAuth, and Cloudflare R2 before running.

## Run locally

This repo uses pnpm workspaces. Enable it once with `corepack enable` (or `npm i -g pnpm`), then install dependencies, generate Prisma, migrate the database, and run the web app and sync server in separate terminals:

```sh
pnpm install
pnpm run prisma:generate
pnpm run prisma:migrate
pnpm run dev:web
pnpm run dev:sync
```

The sync server verifies every control event against the database; client-side controls are only a usability layer.

## Deployment

The web app runs on Vercel. The sync server needs a persistent process and cannot run on serverless — it is deployed separately (Railway) using the root `build` and `start` scripts, configured by [`railway.json`](railway.json).

Set `NEXT_PUBLIC_SYNC_SERVER_URL` on Vercel to the sync server's public URL and redeploy. It is inlined at build time, so a rebuild is required for changes to take effect. Set `SYNC_SERVER_ORIGIN` on the sync server to the web app's origin so CORS allows it.
