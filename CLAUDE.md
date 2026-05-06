@AGENTS.md

# For Claude Code agents

Before making changes to this project, read **[docs/claude-context/README.md](./docs/claude-context/README.md)** — it links to a structured set of onboarding docs covering the architecture, database, tree layout algorithm, deployment procedure, gotchas, and project history. The total is ~2100 lines but read in order it gives you exactly what you need to work safely on this codebase.

Quick context:

- **Production**: `https://arbol.example.com` (TrueNAS at `NAS_HOST`, exposed via Cloudflare Tunnel)
- **Current version**: v3.0.0 (May 6, 2026) — see `Version 3.0/RELEASE_NOTES.md`
- **Stack**: Next.js 16 + React 19 + Prisma 7 + PostgreSQL 16 + MinIO + Docker
- **Most complex file**: `src/lib/tree-layout.ts` — read `docs/claude-context/04-TREE-ALGORITHM.md` before touching it

**Critical reminders:**

1. Next.js 16 ≠ Next.js 14. `middleware.ts` → `proxy.ts`, `params` is a Promise, `cookies()` is async.
2. Schema changes need both code commit AND `prisma db push` against production via a temp container — see `docs/claude-context/06-DEPLOYMENT.md`.
3. Hard refresh after every deploy (Cloudflare/browser cache).
4. Never commit `DEPLOY.md`, `deploy-server.sh`, or `.env*` — they're gitignored for a reason.
5. If a deploy breaks something, **revert immediately** (`git revert HEAD && deploy`), then diagnose offline.
