# Claude Context — Genome Tree

> Onboarding documentation for Claude Code agents working on this project.
> Read this first, in order, before making changes.

## Read order

1. **[01-OVERVIEW.md](./01-OVERVIEW.md)** — What this project is, current version, production state
2. **[02-ARCHITECTURE.md](./02-ARCHITECTURE.md)** — Tech stack, folder structure, request lifecycle
3. **[03-DATABASE.md](./03-DATABASE.md)** — Schema, models, enums, key relationships
4. **[04-TREE-ALGORITHM.md](./04-TREE-ALGORITHM.md)** — The tree layout algorithm in depth (the most complex part of the codebase)
5. **[05-FEATURES.md](./05-FEATURES.md)** — Every user-facing feature explained
6. **[06-DEPLOYMENT.md](./06-DEPLOYMENT.md)** — Production deployment procedure (TrueNAS + Cloudflare)
7. **[07-DEVELOPMENT.md](./07-DEVELOPMENT.md)** — Local dev setup, common commands
8. **[08-PROCEDURES.md](./08-PROCEDURES.md)** — Step-by-step recipes for common tasks
9. **[09-GOTCHAS.md](./09-GOTCHAS.md)** — Known traps, anti-patterns, things that bit us
10. **[10-HISTORY.md](./10-HISTORY.md)** — Major changes timeline
11. **[11-SECURITY.md](./11-SECURITY.md)** — Full security layer: auth hardening, sessions, CSP nonces, upload validation, rate limiting

## Quick orientation

| Question | Answer |
|----------|--------|
| What is this? | Self-hosted genealogy app for a single extended family |
| Current version | v3.1.0 (May 6, 2026) |
| Production URL | https://arbol.example.com |
| Production host | TrueNAS SCALE NAS_HOST (private LAN, exposed via Cloudflare Tunnel) |
| Deploy target | `NAS_DEPLOY_PATH` on the NAS |
| Repo | https://github.com/AndresJ1236/genome-tree |
| Owner | Persona Owner (`AJ`) — also the focus user in screenshots |

## Critical reminders for Claude agents

1. **This is NOT the Next.js you know** — it's Next.js 16 with breaking changes. Read [09-GOTCHAS.md](./09-GOTCHAS.md#nextjs-16-breaking-changes) before writing routing or middleware code.

2. **Don't expose secrets in git.** `DEPLOY.md` and `deploy-server.sh` are in `.gitignore` — they live only on Andrés's local machine. Never commit anything containing the SSH key path, server IP, or production passwords.

3. **The tree layout algorithm is the heart of the app.** It's been rewritten three times. Before changing `src/lib/tree-layout.ts`, read [04-TREE-ALGORITHM.md](./04-TREE-ALGORITHM.md) end-to-end.

4. **Schema changes need TWO things** — code commit AND `prisma db push` against production. The runtime container can't run `prisma db push` because `effect` is missing; you must use a temp `node:20-alpine` container. Procedure in [06-DEPLOYMENT.md](./06-DEPLOYMENT.md#applying-schema-changes).

5. **Local `tsc` may show false errors.** The local Prisma client lags behind enum additions until you run `npx prisma generate` locally. Production rebuild always regenerates. If only Prisma-related errors appear, deploy and check production logs.

6. **Hard refresh after every deploy.** Cloudflare and the browser both cache the JS bundle aggressively. `Ctrl+Shift+R` (or `Cmd+Shift+R`).

7. **Security layer is documented.** Before touching auth, sessions, file uploads, or CSP read [11-SECURITY.md](./11-SECURITY.md). Key invariants: `typ` claim on JWTs, `sessionVersion` for forced logout, single-use reset tokens via `resetTokenJti`, magic byte upload validation, per-request CSP nonces.

## Project version & changelog

See [`Version 3.0/RELEASE_NOTES.md`](../../Version%203.0/RELEASE_NOTES.md) at the repo root for the latest changelog. Older versions in their own `Version X.Y/` folders. Future versions go in new `Version X.Y/` siblings (no `Final/` prefix — that's been retired).

## When in doubt

- The user (Andrés) speaks Spanish primarily but is comfortable with English technical terms.
- Prefer concise responses with clear next steps. Don't repeat back what the user just said.
- Verify your assumptions before large changes — query the DB directly via `docker exec genome-db-1 psql -U genome_tree -d genome_tree`.
- If a deploy seems to do nothing, the bundle may be cached. If it broke something, **revert immediately** (`git revert HEAD && deploy`), then diagnose offline.
