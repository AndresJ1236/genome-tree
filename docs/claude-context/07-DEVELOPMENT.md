# 07 — Local Development

## Prerequisites

- **Node.js 20+** (the production runner uses 20-alpine)
- **PostgreSQL 16+** running locally — easiest via Docker:
  ```powershell
  docker run -d --name genome-pg -p 5432:5432 `
    -e POSTGRES_DB=genome_tree `
    -e POSTGRES_USER=genome_tree `
    -e POSTGRES_PASSWORD=devpassword `
    postgres:16-alpine
  ```
- **MinIO** for media uploads (optional if not testing photo features) — easiest via Docker:
  ```powershell
  docker run -d --name genome-minio -p 9000:9000 -p 9001:9001 `
    -e MINIO_ROOT_USER=admin `
    -e MINIO_ROOT_PASSWORD=devpassword `
    minio/minio server /data --console-address ":9001"
  ```
  Then visit http://localhost:9001, log in, create a bucket called `genome-tree`.

## Setup

```powershell
git clone https://github.com/AndresJ1236/genome-tree.git
cd genome-tree
npm install
cp .env.example .env.local
# Edit .env.local with your local DB / MinIO credentials
npx prisma generate
npx prisma db push     # creates tables in your local DB
npm run dev
```

Open http://localhost:3000/setup and create the first family.

## .env.local for local dev

```env
DATABASE_URL="postgresql://genome_tree:devpassword@localhost:5432/genome_tree"
SESSION_SECRET="any-long-random-string-for-dev"
APP_HOSTNAME="localhost:3000"

MINIO_ENDPOINT="localhost"
MINIO_PORT="9000"
MINIO_ROOT_USER="admin"
MINIO_ROOT_PASSWORD="devpassword"
MINIO_BUCKET="genome-tree"
MINIO_PUBLIC_URL=""    # empty → uses http://localhost:9000 directly
```

## npm scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Next.js dev server with hot reload (Turbopack) |
| `npm run build` | Production build (Turbopack) |
| `npm run build:local` | Production build with webpack (slower but more debuggable) |
| `npm run start` | Run the production build |
| `npm run start:local` | Production build on `127.0.0.1:3000` (no LAN exposure) |
| `npm run lint` | ESLint |
| `npm run db:generate` | Regenerate Prisma client (after editing schema.prisma) |
| `npm run db:migrate` | Create + apply a Prisma migration |
| `npm run db:seed` | Run the seed script (`prisma/seed.ts`) |
| `npm run db:studio` | Open Prisma Studio at http://localhost:5555 |

## Hot reload caveats

- **Server actions** (`'use server'`) hot-reload, but cookie-based session changes require a manual reload
- **Schema changes** require `npx prisma generate` + restart the dev server
- **Tailwind v4** changes apply on save; if not, restart the dev server (PostCSS plugin sometimes caches)

## Running tests

The repo has Playwright tests in `tests/`:

```powershell
npx playwright install   # one-time, downloads browsers
npx playwright test      # runs the suite
```

Note: most tests require a running dev server + a populated local DB. The CI pipeline (if any) is not configured yet.

## Useful local Prisma commands

```powershell
# Inspect data
npx prisma studio

# Apply a schema change without creating a migration
npx prisma db push

# Reset everything (DESTRUCTIVE)
npx prisma migrate reset
```

## Common local issues

| Issue | Fix |
|-------|-----|
| `PrismaClientInitializationError: Can't reach database server` | Is Postgres running? `docker ps` — start the container if not |
| Login redirects in a loop | `SESSION_SECRET` mismatch between server and client cookie. Clear cookies and restart |
| Photos don't load | MinIO bucket missing or `MINIO_PUBLIC_URL` set to a wrong value |
| `params is a Promise` errors | Next.js 16: `params` must be `await`ed in pages. Use `const { id } = await params` |
| `middleware.ts is deprecated` warning | Next.js 16: file should be `proxy.ts` with named export `proxy` |

## Recommended dev workflow

1. **Branch off main** for features: `git checkout -b feat/whatever`
2. Make changes incrementally; commit when each piece compiles
3. Run `npm run dev` and click around — there are no automated tests for most routes
4. Run `npx tsc --noEmit` before committing — but ignore Prisma-related errors (they fix themselves on `prisma generate`)
5. Run `npm run lint` and fix anything important; deploy-blocking errors are rare
6. When ready, see [06-DEPLOYMENT.md](./06-DEPLOYMENT.md) for the deploy steps

## Editor setup

Recommended VS Code extensions:
- Prisma (syntax + autocomplete for schema.prisma)
- Tailwind CSS IntelliSense
- ESLint
- Error Lens

The repo has no special workspace settings — defaults work.

## Working with branches

```powershell
git fetch origin
git checkout main
git pull
git checkout -b feat/your-feature
# work
git push -u origin feat/your-feature
# open a PR on GitHub
```

The user typically commits directly to main for solo work and branches only for risky changes. Either is fine — coordinate via the conversation.
