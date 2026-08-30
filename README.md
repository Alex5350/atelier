# Atelier

**A studio for making with AI: chat with your files, iterate images through passes,
and see exactly what every model call costs.**

> **Independent example.** Atelier is a personal portfolio project and a work in
> progress. It is not affiliated with any employer or client. All data is local
> and synthetic; all credentials in the repo are demo values.

## What is here today (phase 1 of a 12-phase build)

- A Next.js (App Router, strict TypeScript) application on **Bun**, Tailwind CSS v4,
  and shadcn/ui with a dark-first studio design and fluid motion transitions.
- **PostgreSQL with pgvector** via docker compose (host port 5433), Drizzle ORM
  migrations, and the foundational tables: auth, the model registry, effective-dated
  model prices, the append-only usage ledger, and per-user budget settings.
- **Single-operator authentication** (better-auth, email and password) with a
  middleware cookie gate plus server-side session validation.
- The app shell: sidebar navigation to the four surfaces (Chat, Studio, Usage,
  Admin), a live dashboard that already reads the registry and ledger tables, and
  honest placeholder pages for what arrives in later phases.
- Unit tests (bun test) and CI on GitHub Actions (typecheck, lint, test, build,
  migrate, seed, schema smoke check).

## The roadmap

| Wave | Phases | Delivers |
|---|---|---|
| 1 | 1 to 4 | skeleton and auth (done), model registry with demo mode, streaming chat, usage ledger with daily budget |
| 2 | 5 to 6 | file attachments as context, retrieval with citations |
| 3 | 7 to 9 | the passes studio: generation, references, review gating, lineage, enhancement tools, export |
| 4 | 10 to 12 | video seam, admin registry and spend dashboards, end-to-end tests and docs |

With zero provider API keys configured the app is designed to run in a clearly
labeled demo mode against mock providers; that guarantee lands with phase 2.

## Running it

Prerequisites: Bun 1.4+ and Docker.

```bash
docker compose up -d        # PostgreSQL 17 + pgvector on localhost:5433
cp .env.example .env.local  # demo values; generate a real BETTER_AUTH_SECRET
bun install
bunx --bun drizzle-kit push
bun run db:seed             # creates the demo operator (see .env.example)
bun run dev                 # http://localhost:3000
```

The seeded operator signs in with `ATELIER_ADMIN_EMAIL` / `ATELIER_ADMIN_PASSWORD`
(defaults `alex@atelier.local` / `atelier-demo`; demo values, not secrets).

## Engineering notes

- Datastore is PostgreSQL only; the pgvector extension is enabled by the first
  migration for the retrieval phases.
- Migrations are additive; the usage ledger pins the price row it was charged at
  so historical costs never silently change when prices update.
- No secrets in the repo: keys are read from the environment on the server only,
  and `.env*` is gitignored.

Full architecture and decision records arrive with the docs phase (12).
