# NotebookSPEC Reply Assistant

A Next.js (App Router) platform for moderating YouTube comments, drafting AI-powered replies, and managing affiliate product recommendations.

## Features
- Google OAuth via NextAuth with allowlist enforcement.
- Incremental YouTube comment sync with quota-aware pagination.
- AI-generated reply drafts including affiliate recommendations.
- Approval workflow that posts replies through the YouTube Data API v3.
- Admin panels for user allowlist, affiliate products, and sync settings.
- Background job utilities for comment sync, draft generation, and posting.

## Getting Started
1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Configure environment**
   - Copy `.env.example` to `.env.local`.
   - Supply your own Google OAuth client, YouTube API key, AI provider key, and a 32-byte encryption key.
   - Rotate any credentials that may have been exposed during scaffolding.
3. **Database setup**
   ```bash
   npx prisma migrate dev
   npm run prisma:seed
   ```
4. **Run development server**
   ```bash
   npm run dev
   ```

## Project Structure
- `app/` — App Router routes, layouts, and Ant Design powered UI.
- `app/api/` — Route handlers for auth, drafts, products, users, sync, queue, and YouTube helpers.
- `lib/` — Prisma client, auth utilities, AI helpers, rate limiter, queue, and YouTube integrations.
- `jobs/` — Node scripts for batch operations (sync, draft generation, posting).
- `prisma/` — Database schema and seeds.
- `tests/` — Vitest suites covering AI draft normalization and YouTube sync adapters.
- `fixtures/` — Mock YouTube API payloads for tests.

## Scripts
- `npm run dev` — Start Next.js dev server.
- `npm run build` — Build production bundle.
- `npm run test` — Execute Vitest suites.
- `npm run prisma:migrate` — Create/update database migrations.
- `npm run prisma:seed` — Seed default admin and settings.

## Security Notes
- Do **not** commit real credentials; always use environment variables.
- Encryption key (`TOKEN_ENCRYPTION_KEY`) must be at least 32 characters for AES-256-GCM.
- Ensure OAuth refresh tokens are rotated and stored encrypted.
- Restrict Google OAuth scopes to `youtube.force-ssl` plus basic profile/email.

## Next Steps
- Complete API implementations for pending handlers (settings, queue execution).
- Integrate a background worker (e.g., BullMQ, Cloud scheduler) for recurring jobs.
- Harden rate limiting and add structured logging/monitoring.
