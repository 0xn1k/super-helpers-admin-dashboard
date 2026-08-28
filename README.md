# SuperHelper Admin Dashboard

Next.js admin dashboard for SuperHelper, using the production Supabase project for auth and backend data access.

## Stack

- Next.js App Router
- TypeScript
- Prisma client for existing Postgres admin data
- Supabase Auth and server-side Supabase clients
- Server route handlers for backend/admin-only operations

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` from `.env.example` and add the production Supabase values:

```bash
cp .env.example .env.local
```

Required variables:

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_EMAILS=
DATABASE_URL=
```



`SUPABASE_SERVICE_ROLE_KEY` must only be used server-side. Do not prefix it with `NEXT_PUBLIC_`, do not import it into client components, and do not commit `.env` or `.env.local`.

3. Start the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Admin Auth

The first admin guard uses Supabase Auth plus the `ADMIN_EMAILS` allowlist. Add production admin emails as a comma-separated list.

Once the SuperHelper admin model is finalized, replace the allowlist in `lib/auth.ts` with a lookup against the production admin/profile table.

## Backend Surface

Backend code lives in `app/api/admin/*` route handlers and uses the server-only Supabase service role client from `lib/supabase/server.ts`.

Current routes:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/admin/me`
- `GET /api/admin/health`
- `GET /api/admin/employers`

## Generated Files

`tsconfig.tsbuildinfo` is a TypeScript build cache file. It is generated automatically to speed up future type checks and builds, is safe to delete, and should not be committed.

## Deploy

For Vercel or any Next.js host, add the same environment variables from `.env.example` in the deployment environment, then run:

```bash
npm run build
```
