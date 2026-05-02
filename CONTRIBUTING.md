# Contributing to Genome Tree

Thank you for your interest in contributing! This document explains how to get the project running locally, how to submit changes, and what conventions to follow.

---

## Table of Contents

1. [Getting started](#getting-started)
2. [Branching and workflow](#branching-and-workflow)
3. [Commit messages](#commit-messages)
4. [Pull requests](#pull-requests)
5. [Code style](#code-style)
6. [Project-specific conventions](#project-specific-conventions)
7. [Reporting bugs](#reporting-bugs)

---

## Getting started

See [`docs/development.md`](docs/development.md) for the full local setup guide. In brief:

```bash
git clone https://github.com/your-org/genome-tree.git
cd genome-tree
npm install
cp .env.example .env   # fill in DATABASE_URL and SESSION_SECRET
npx prisma db push
npx prisma db seed
npm run dev
```

The seed creates a demo family with 13 people and one admin user: `admin` / `admin123`.

---

## Branching and workflow

| Branch | Purpose |
|--------|---------|
| `main` | Stable, production-ready code |
| `dev` | Integration branch — PRs merge here first |
| `feat/<name>` | New features |
| `fix/<name>` | Bug fixes |
| `docs/<name>` | Documentation only |
| `refactor/<name>` | Refactors with no behavior change |

1. Fork the repository and clone your fork.
2. Create a branch from `dev` (or `main` for hotfixes).
3. Make your changes in small, focused commits.
4. Open a PR against `dev`.

---

## Commit messages

Use the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <short description>
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`

**Scope** (optional): the area you changed — `tree`, `auth`, `content`, `admin`, `db`, `docker`, `ui`

Examples:
```
feat(tree): add pet orbit placement around owner node
fix(auth): redirect to login when session cookie is missing
docs: add deployment guide for Cloudflare Tunnel
refactor(layout): extract generation BFS into helper function
```

Keep the subject line under 72 characters. Add a body if the motivation is non-obvious.

---

## Pull requests

- **One concern per PR** — mix of unrelated changes slows review.
- Fill in the PR template: what changed, why, and how to test it.
- All TypeScript errors must be resolved (`npm run build` passes cleanly).
- If your change touches the database schema, include the migration approach (usually `npx prisma db push` is fine for dev; document breaking changes).
- Screenshots or recordings are welcome for UI changes.

---

## Code style

The project uses ESLint and TypeScript's strict mode. Before opening a PR:

```bash
npm run lint
npm run build   # catches type errors
```

General rules:
- No comments that describe *what* the code does — identifiers should be self-explanatory.
- Comments only for *why*: hidden constraints, surprising behavior, workarounds for external bugs.
- No console.log left in committed code.
- Prefer `const` over `let`; avoid `any`.
- Server Actions live in `src/app/actions/`. Keep them thin — business logic in lib functions.
- Components are in PascalCase. Utility files are kebab-case.

---

## Project-specific conventions

### Next.js 16 (breaking changes)

This project runs Next.js 16, which differs from 14/15 in important ways:

- Route protection lives in `src/proxy.ts` (not `middleware.ts`), exported as `export const proxy`.
- `params` in page components is `Promise<{ slug: string }>` — always `await params` before use.
- See [`AGENTS.md`](AGENTS.md) for details.

### Prisma v7

- The datasource URL is configured in `prisma.config.ts`, not in `schema.prisma`.
- `PrismaClient` requires the `@prisma/adapter-pg` driver adapter.

### Multi-tenancy

Every database record (Person, Content, Media, etc.) carries a `familyId`. Never query without scoping to the current family from the session.

### Tree layout

The layout algorithm in `src/lib/tree-layout.ts` is custom. Pets are excluded from the generation grid and placed in orbit around their owner after all regular nodes are positioned. See [`docs/architecture.md`](docs/architecture.md) for the algorithm details.

---

## Reporting bugs

Open an issue on GitHub with:

1. What you expected to happen
2. What actually happened
3. Steps to reproduce
4. Browser and OS (for UI bugs)
5. Relevant logs or screenshots

For security vulnerabilities, please **do not open a public issue** — email the maintainers directly.
