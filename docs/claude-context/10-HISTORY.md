# 10 — History

> Major changes timeline. Detail-level changelog lives in `Version X.Y/RELEASE_NOTES.md`.

## v2.0.0 — May 3, 2026

### Tree visualization rewrite

- **BFS-from-focus generation algorithm** replaced depth-from-roots. Siblings now always share a generation. Pass 1 and Pass 2 alignment workarounds removed (caused oscillation).
- **Side-bounded layout**: paternal cluster at `x < 0`, maternal at `x > 0`, focus + neutrals at center, 500px valley between sides. Replaced the index-based per-generation positioning that caused paternal nodes to drift right.
- **Lateral score propagation** through siblings, spouses, children, and parents iteratively, so entire family branches inherit the side of the closest connected ancestor.
- **Pass 0 — implicit couple detection** age tolerance raised from 35 → 60 years. Caught a real-world miss.

### New: SIBLING relationships

- `RelationshipType` enum gains `SIBLING`. Used to mark people as siblings even when their shared parents aren't recorded yet.
- BFS traverses sibling edges sideways (same generation).
- `siblingLinks` output added to `TreeLayout` — only emitted for sibling pairs without a registered shared parent (those already get a junction edge through their family unit).
- Renderer (`FamilyEdges.tsx`) draws a discrete dashed arc above the row.
- UI (`PersonEditor`) adds "Hermano/a" to the relationship Tipo dropdown. The end-date controls are hidden for SIBLING.
- Server action (`createRelationship`) accepts SIBLING; skips the managed-family-unit auto-create path.

### Audit-driven notifications

- Every `logAudit()` call now fires `fanOutNotificationsFromAudit()` in the background. Notifications work for offline users (they see them next time they log in).
- New `NotificationType.PERSON_UPDATED` for edits.
- `NotificationBell` polls `getMyUnreadCount()` every 30s.
- Removed scattered `notifyFamilyMembers(...)` calls — all notification logic now lives in one place.

### Family unit improvements

- `bulkAutoCreateFamilyUnits` admin action detects couples from BOTH explicit `Relationship` rows AND implicit pairs (children with both `fatherId` and `motherId` set).
- Retroactive parentA/B correction: existing units where female is in `parentA` get swapped to MALE-first.
- Family unit labels standardized to `"Familia <padre> <madre>"`.

### Member proposals

- New `PersonCreationProposal` model lets non-admin users propose new people.
- Admin queue at `/[familySlug]/settings/proposals` for review/approve/reject.
- Notifications to admins on submit; to proposer on approve/reject.

### Repo hygiene

- `Final/` folder retired. Versions now live at the repo root (`Version 1.0/`, `Version 2.0/`).
- `DEPLOY.md` and `deploy-server.sh` removed from version control (gitignored). They contained server IP and SSH key path. The files still exist locally on the user's machine.
- Documentation reorganized: this `docs/claude-context/` folder created for Claude Code agents.

### Schema changes

- `enum RelationshipType` + `SIBLING`
- `enum NotificationType` + `PERSON_UPDATED`
- New table: `PersonCreationProposal`

Apply with `prisma db push` from a temp `node:20-alpine` container — see [06-DEPLOYMENT.md](./06-DEPLOYMENT.md#applying-schema-changes).

---

## v1.0.0 — May 2, 2026

The first stable release. Full release notes at `Version 1.0/RELEASE_NOTES.md`.

### Highlights

- **Interactive tree** with custom layout (no third-party graph library)
- **7-module content archive**: Stories, Recipes, Diary, Interviews, Objects, Sources, Important Links
- **Three-scope permission model**: ADMIN / FAMILY / BRANCH
- **Managed Family Units**: optional delegation layer with representative users
- **Change proposals**: non-admins propose; admins approve/reject
- **Audit log**: full history of every significant change
- **Pet nodes**: pets orbit their owner instead of taking a row in the gen grid
- **Docker stack**: db + minio + app + nginx + cloudflared
- **First-run setup wizard** at `/setup`

### Tech stack at v1.0

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 |
| Runtime | React 19 |
| Styling | Tailwind CSS v4 |
| ORM | Prisma 7 |
| Database | PostgreSQL 16 |
| Auth | jose JWT |
| Storage | MinIO |
| Container | Docker + Nginx + Cloudflare Tunnel |

Same stack carried into v2.0 — no dependency upgrades in this release.

---

## Pre-v1.0 (April 2026)

The repo was rebuilt from scratch in late April 2026 (see `docs/reconstruccion.md` for the historical context). Before that, an earlier MVP existed but was abandoned for architectural reasons. The v1.0 codebase is the first stable iteration; everything before it is in folders like `Beta/` and `Genome Tree/` at the repo root (gitignored, kept as local snapshots only).

---

## Future direction

Not committed but discussed:

- **Audio/video module** — schema is there, upload pipeline isn't built
- **Full archive export** with media (currently only relations export)
- **Email delivery** for invitations (currently links must be copied manually)
- **Mobile-native tree canvas** — current tree is tablet/desktop only
- **Sibling-via-spouse fallback in BFS** — when focus has only one parent set, use the parent's spouse (from `inferredCouples`) as a "fake" other parent so the L/R split still works
