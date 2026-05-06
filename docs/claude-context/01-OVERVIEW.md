# 01 — Overview

## What this is

**Genome Tree** is a self-hosted family genealogy web application. One PostgreSQL database, one Docker stack, one extended family using it. Currently deployed for the Apellido1–Apellido2 family (the user, Persona Owner, is the primary admin and developer).

The product fits a niche between commercial genealogy SaaS (Ancestry, MyHeritage) and open-source desktop tools (GRAMPS, etc.):

- **Self-hosted & private** — all data lives on the family's own hardware
- **Multi-user collaboration** — admins, family members, branch-restricted users
- **Rich content archive** — stories, recipes, diary, interviews, objects, sources, photos, links — all attached to specific people
- **Visual tree** — custom layout engine, not a generic graph library
- **Per-user perspective** — each logged-in user sees the tree from THEIR position (their dad's side on the left, mom's side on the right)

## Current version: v3.0.0

Released May 6, 2026. Major changes vs v2.0:

- **Photo system overhaul**: `sharp` pipeline generates 4 versions per upload (4K-capped original + 3 WebP variants). 23× lighter page loads on mobile. Backfill of legacy photos done.
- **Mobile / responsive UX**: bigger fonts, "Ir a mí" recenter button, color legend, simplified Spanish form labels, inline confirm buttons replacing native `confirm()`.
- **Birthdays of the month**: popover in tree header showing whose birthday falls this month, with today highlighted.
- **Story comments**: lazy-loaded discussion thread per story, with notifications.
- **Soft delete**: Person and Content rows are recoverable instead of destructively deleted.
- **Security**: MinIO bucket policy applied programmatically; robust MIME validation on upload (`resolveMimeType` with extension fallback for browsers that send empty `file.type`).

See [`Version 3.0/RELEASE_NOTES.md`](../../Version%203.0/RELEASE_NOTES.md) for the full changelog. v2.0 (tree layout overhaul, notifications, sibling relationships, member proposals) is in [`Version 2.0/RELEASE_NOTES.md`](../../Version%202.0/RELEASE_NOTES.md).

## Production state

| | |
|---|---|
| Status | Live, single family in production |
| URL | https://arbol.example.com |
| Host | TrueNAS SCALE Electric Eel 24.10+ at `NAS_HOST` |
| Public exposure | Cloudflare Tunnel (no port forwarding) |
| Storage | PostgreSQL 16 + MinIO (both Docker volumes on the NAS) |
| Auth | Stateless JWT cookies (no Redis, no session table) |
| Users | A handful — admin + family branch reps |

## What's NOT done yet

Carried from v1.0, still pending:

- **Audio/video module** — schema is there, upload pipeline isn't built
- **Full archive export** — JSON export of relations works; full export with media doesn't
- **Email delivery** — invitation links are generated but must be copied manually
- **Mobile-native layout** — tree canvas works on tablet/desktop only; profile pages are responsive

New gaps in v2.0:

- The side-bounded layout assumes the focus person has BOTH `fatherId` and `motherId` set. If only one is registered, the BFS travels in only one direction and the entire visible graph ends up on one side.
- Notifications fan out per-audit-entry. Bulk imports (100+ people in one go) cause a brief lag.

## File structure at a glance

```
genome-tree/
├── prisma/schema.prisma     # Single source of truth for the data model
├── src/
│   ├── app/                 # Next.js 16 App Router pages
│   │   ├── (protected)/     # Authenticated routes
│   │   │   └── [familySlug]/
│   │   │       ├── tree/        # The interactive canvas
│   │   │       ├── person/      # Profile + edit pages
│   │   │       ├── admin/       # Admin dashboard
│   │   │       └── settings/    # User settings + proposals queue
│   │   ├── actions/         # Server actions (Next.js 'use server')
│   │   ├── api/             # JSON API routes (search, relations export)
│   │   ├── auth/login/      # Login form post handler
│   │   ├── invite/[token]/  # Invitation acceptance
│   │   ├── reset/[token]/   # Password reset
│   │   ├── setup/           # First-time setup wizard
│   │   └── proxy.ts         # Next.js 16 middleware (renamed from middleware.ts)
│   ├── components/          # React components (admin, forms, profile, tree, ui)
│   └── lib/                 # Pure logic (tree-layout, audit, notifications, etc.)
├── docker/                  # Container entrypoint script
├── nginx/                   # Reverse proxy config
├── docs/
│   ├── claude-context/      # ← YOU ARE HERE
│   └── *.md                 # Older user-facing docs (some outdated)
├── Version 1.0/             # v1.0 release artifacts
├── Version 2.0/             # v2.0 release artifacts
├── Version 3.0/             # v3.0 release artifacts (current)
├── docker-compose.yml       # 5 services: db, minio, app, nginx, cloudflared
└── Dockerfile               # Multi-stage: deps → builder → runner
```

Things specifically NOT in git (gitignored):

- `DEPLOY.md` — host-specific deploy commands
- `deploy-server.sh` — server-side helper
- `.env*` (except `.env.example`) — secrets
- `node_modules/`, `.next/`, build artifacts

## The user

The primary user/developer is **Persona Owner** (`AJ` in tree screenshots). When the user says "mi papá", they mean Persona Padre. "Mi mamá" = Persona Madre. The tree they see is centered on themselves (focus = AJ).

When working on layout/visibility issues, this matters because:
- The Apellido1 side has fewer recorded relatives (~7 people)
- The Apellido2 side has many more (~35-40 people)
- Visual imbalance is a feature of the data, not always a bug
