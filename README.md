# MSParty

Watch-party MVP: a Next.js web application, a Socket.io sync service, and a Manifest V3 browser extension. Copy `.env.example` to `.env` and configure PostgreSQL, NextAuth, and Cloudflare R2 before running.

## Run locally

This repo uses pnpm workspaces. Enable it once with `corepack enable` (or `npm i -g pnpm`), then install dependencies, generate Prisma, migrate the database, and run the web app and sync server in separate terminals.

`.env` goes at the repo root, where the Prisma CLI reads it — but Next.js only reads the one beside the app it is running, so `apps/web` needs it too. Link rather than copy, so there is one file to edit and no chance of the two drifting:

```sh
cp .env.example .env          # then fill it in
ln -s ../../.env apps/web/.env
```

(On Windows without developer mode, copy the file instead and remember there are now two.)

```sh
pnpm install
pnpm run prisma:generate
pnpm run prisma:migrate
pnpm run dev:web
pnpm run dev:sync
```

The sync server verifies every control event against the database; client-side controls are only a usability layer.

## Signing in

Three ways in, all landing on the same `User` row:

- **Email and password.** Registration picks the username at the same time, so every account is findable from day one.
- **Google.** Optional — set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` and the button appears; leave them blank and it does not. An account is linked to an existing one when Google reports the address as verified, which is the same proof a password reset by email would give. A first-time Google sign-in gets a username derived from the address, changeable for free from the profile screen.
- **Guest.** A name only, tied to a party that exists, for someone arriving on an invite link. Rate limited per address, since it is the one path where an unauthenticated request creates a row.

Attempt counters for all three live in the `RateLimit` table rather than in memory: the web app is serverless, so a per-instance counter resets often enough to be no limit at all.

## Televisions

`/tv` is the ten-foot screen: full-bleed video, type sized to be read across a room, and a control surface of exactly one button — OK shows the chat and who is watching, Back hides it.

It is a strict viewer. The set never emits a control event, and its sync token carries `scope: "tv"`, which the socket server refuses for everything except joining. A paired set keeps a bearer secret in local storage on a device with no lock screen, so that scope is what keeps a stolen one from pausing a film for everyone.

Pairing goes the other way round from signing in, because a remote with four arrows is not a keyboard: the television shows a code, and a phone that is already signed in claims it at `/tv/link`. After that the phone points the set at a party — from `/tv/link`, or the 📺 button in any room — and the set switches within a few seconds, on its own.

Only YouTube parties and uploaded videos play there. Platform parties are driven by the browser extension, and televisions do not run extensions; a set pointed at one says so.

`browserslist` in `apps/web/package.json` exists for these: webOS and Tizen ship Chromium several years behind desktop, and the default build target compiles syntax they cannot parse.

## Deleting an account

Pressing delete hides the account immediately and schedules erasure 30 days out. "Hidden" is enforced, not decorative — it drops out of friend lists, search, the feed, notifications and party rosters, its profile 404s, its socket connection is refused, and its name in old chat lines reads "مستخدم محذوف".

Signing in during those 30 days does **not** silently cancel the deletion. It is refused, and the browser is sent to `/account/restore` carrying a short-lived signed ticket that proves the sign-in succeeded; bringing the account back is a decision made on that screen. After the 30 days the nightly cron erases the rows and the stored objects for real.

Mail — the confirmation link, the "scheduled for deletion" notice, and the reminder three days before erasure — needs `RESEND_API_KEY` and `MAIL_FROM`. Without them nothing is sent and no flow is blocked.

## Deployment

The web app runs on Vercel. The sync server needs a persistent process and cannot run on serverless — it is deployed separately (Railway) using the root `build` and `start` scripts, configured by [`railway.json`](railway.json).

Set `NEXT_PUBLIC_SYNC_SERVER_URL` on Vercel to the sync server's public URL and redeploy. It is inlined at build time, so a rebuild is required for changes to take effect. Set `SYNC_SERVER_ORIGIN` on the sync server to the web app's origin so CORS allows it.
