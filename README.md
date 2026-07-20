# MSParty

Watch-party MVP: a Next.js web application, a Socket.io sync service, and a Manifest V3 browser extension. Copy `.env.example` to `.env` and configure PostgreSQL, NextAuth, and Cloudflare R2 before running.

## Run locally

Install dependencies, generate Prisma, migrate the database, then run the web app and sync server in separate terminals:

```sh
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev:web
npm run dev:sync
```

The sync server verifies every control event against the database; client-side controls are only a usability layer.
