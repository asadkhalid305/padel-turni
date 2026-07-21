# Padel Turni

Padel Turni is a recreational event-management app for reusable player rosters, fair Americano-style draws, live scoring and timers, standings, and cross-event history.

[Live app](https://padelturni.asadullahkhalid.com) · [GitHub repository](https://github.com/asadkhalid305/padel-turni)

## Features

- Reusable players with 1-10 ratings
- Admin-controlled links between roster players and signed-in accounts
- Event-level name and rating snapshots
- Deterministic schedules with unequal court availability
- Fairness diagnostics for appearances, rests, partners, opponents, and ratings
- Safe draw editing before a match is completed
- Persistent score and timer state
- Standings derived from completed matches
- Historical player dashboard
- Responsive live-match controls

## Stack

Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4, Supabase Postgres, Zod, React Hook Form, and Vitest.

## Local Setup

Use Node 24 (`nvm use`) and install dependencies:

```bash
npm install
cp .env.example .env.local
```

Fill the Supabase variables in `.env.local`, then:

```bash
npm run dev
```

Supabase variables are required for authentication. Configure Google as an Auth provider in Supabase and add `/auth/callback` to the allowed redirect URLs.

## Environment

```text
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
ADMIN_ROLE_API_SECRET
RESEND_API_KEY
RESEND_FROM_EMAIL
CONTEXT7_API_KEY
```

`SUPABASE_SECRET_KEY` and `ADMIN_ROLE_API_SECRET` are server-only and must never use a `NEXT_PUBLIC_` prefix. `CONTEXT7_API_KEY` is optional and only raises MCP rate limits.

`RESEND_API_KEY` and `RESEND_FROM_EMAIL` are optional until final-standings emails are enabled. Without them, tournament completion still succeeds and email deliveries remain pending for retry once configured.

## Supabase

Repository migrations are the schema source of truth.

```bash
supabase start
supabase db reset
supabase migration list --local
supabase gen types typescript --local --schema public > src/types/database.ts
```

`supabase db reset` applies `supabase/migrations/` and the repeatable `supabase/seed.sql`. For a hosted project, link it and use the current CLI help before running `supabase db push`.

### Local Google Auth

Local Padel Turni always runs on `http://localhost:3100`. `npm run dev` fails if that port is busy instead of silently falling back to another port, because OAuth redirect URLs must stay exact.

Local Supabase can run the same Google OAuth flow as the hosted project. Create a Google OAuth **Web application** client and configure it with:

- Authorized JavaScript origins:
  - `http://localhost:3100`
- Authorized redirect URI:
  - the local Supabase auth callback from `supabase start`, for example `http://127.0.0.1:55321/auth/v1/callback`

Then set these shell variables before starting Supabase:

```bash
export SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID="your-google-client-id"
export SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET="your-google-client-secret"
supabase stop
supabase start
```

For local app testing, point `.env.local` at the local Supabase values printed by `supabase status --output env`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3100
```

Keep production and Vercel environment variables pointed at the hosted Supabase project.

## Quality Commands

```bash
npm run format
npm run lint
npm run typecheck
npm test
npm run build
```

## Context7

The official Context7 endpoint is configured in `.codex/config.toml`. Codex loads project MCP configuration only after the repository is trusted and a new session starts. The endpoint works without a key; set `CONTEXT7_API_KEY` for higher limits if desired.

## Deployment

Deploy as a standard Next.js application and configure the three Supabase environment variables in the hosting platform. Database migrations must be applied before the first production request.

Users sign in with Google through Supabase Auth. First-time sign-in creates a `member` account in `public.app_users` but does not create or expose a roster player. Admins create roster players separately, then link a player to a signed-in account from the Players screen. Unlinked non-admin accounts cannot view private roster, event, or history data.

Super admins can manage `member`, `admin`, and `super_admin` roles from linked player accounts. The secret-protected endpoints remain available for server-only role bootstrap and automation:

```bash
curl -X POST http://localhost:3000/api/admin/users/grant \
  -H "content-type: application/json" \
  -H "x-admin-role-secret: $ADMIN_ROLE_API_SECRET" \
  -d '{"email":"organizer@example.com"}'

curl -X POST http://localhost:3000/api/admin/users/grant \
  -H "content-type: application/json" \
  -H "x-admin-role-secret: $ADMIN_ROLE_API_SECRET" \
  -d '{"email":"owner@example.com","role":"super_admin"}'

curl -X POST http://localhost:3000/api/admin/users/revoke \
  -H "content-type: application/json" \
  -H "x-admin-role-secret: $ADMIN_ROLE_API_SECRET" \
  -d '{"email":"organizer@example.com"}'
```

RBAC is enforced in server-only actions. Admin and super-admin users can create, update, delete, score, and run timers; super admins can grant or revoke elevated roles without removing the final remaining super admin. Linked member users can read Players, History, and existing events. Data access still runs through server-only code using the Supabase secret key, with RLS enabled and browser roles denied.
