# Genome Tree v2.0.0 — Release Notes

**Release date:** 2026-05-03

---

## Overview

Genome Tree v2.0 focuses on a major overhaul of the tree visualization algorithm and a rewrite of the notification pipeline. The tree now produces a clean left/right split between paternal and maternal branches with strict boundaries, and notifications no longer require the user to be online when a change happens.

---

## Highlights

### Tree layout — paternal left, maternal right

Earlier versions placed everyone by depth-from-root, which produced messy mixed branches when one side of the family had more recorded generations than the other. v2.0 introduces a side-bounded layout:

- **Paternal cluster** (the user's father's lineage) is placed at `x < 0`
- **Maternal cluster** (the user's mother's lineage) is placed at `x > 0`
- The user and their parents sit at the center as the natural boundary
- A 500 px valley separates each cluster from the center, making the split obvious at a glance

The view is per-user — when a Apellido1 Apellido2 logs in, they see Apellido1 on the left and Apellido2 on the right; a Rubio Apellido2 logged in sees Rubio on the left and Apellido2 on the right.

### Generation alignment fixes

Three correctness bugs in the generation-assignment algorithm were fixed:

1. **Pass 0 — implicit-couple detection** now picks up couples that share a child even without an explicit `Relationship` record. The age-difference tolerance was raised from 35 to 60 years to handle data-entry errors and unusual gaps.
2. **Pass 2 oscillation** — when one spouse came from a deeper recorded branch (e.g. mother's family has more generations than father's), the alignment loop used to push one partner up, then drag them back down on the next pass, leaving them on different rows. Re-derivation now only increases generations, never decreases — couple alignment becomes "sticky".
3. **Lateral score propagation** — paternal/maternal classification now propagates through siblings, spouses, children, and parents iteratively until every person in the visible graph is tagged. No more ancestors' siblings (and their entire descendant lines) defaulting to the middle.

### Audit-driven notifications

The notification system was rewritten so it works for users who weren't online when a change happened:

- Every `logAudit(...)` call now fires a fan-out into the notification table, scoped to the audience (FAMILY+ADMIN, admins-only, etc.) and excluding the actor
- New notification type: `PERSON_UPDATED` (in addition to `NEW_PERSON_ADDED`, `NEW_CONTENT_ADDED`)
- The notification badge polls every 30 seconds, so users see new notifications without refreshing

### Family unit improvements

- **Auto-create from couples** detects pairs both from the explicit `Relationship` table AND from implicit pairs (children whose `fatherId` and `motherId` both point to people in the family). One click creates all missing nuclei.
- **Retroactive parentA/B correction** fixes existing units where the female parent landed in `parentA` instead of `parentB`. The convention is now consistently MALE first, FEMALE second; both UNKNOWN falls back to alphabetical.
- **Family unit labels** standardized to `"Familia <padre> <madre>"`.

### Member proposals

Non-admin users can now submit `PersonCreationProposal` entries to suggest new people in the tree. Admins review the queue from the admin dashboard and accept or reject with a reason.

---

## Algorithm details (for the curious)

The tree layout pipeline now runs four ordered passes inside `computeFocusLateralScores`:

1. **BFS upward** from the focus person — `fatherId` → negative score, `motherId` → positive score
2. **Spouse propagation** — partners get their spouse's score
3. **Focus-sibling spread** — the focus's siblings are placed close to the focus, spread by birth order
4. **Branch propagation** — siblings, spouses, children, and parents iteratively inherit scores until the family graph stabilizes

Then in the per-generation layout step, units are partitioned by score sign and placed in three explicit regions (negative, zero, positive) with a `SIDE_GAP_PX = 500` boundary between each. The bottom-up traversal propagates this separation upward through `desiredCenterForUnit`, which midpoints child positions.

---

## Tech stack

Same as v1.0 — no dependency upgrades in this release.

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Runtime | React 19 |
| Styling | Tailwind CSS v4 |
| ORM | Prisma 7 |
| Database | PostgreSQL 16+ |
| Auth | `jose` stateless JWT |
| Storage | MinIO (S3-compatible) |
| Container | Docker + Nginx + Cloudflare Tunnel |

---

## Schema changes

- New table: `PersonCreationProposal`
- New enum value: `PERSON_UPDATED` in `NotificationType`

Apply with `npx prisma db push` from a node container against the production DB.

---

## Known limitations

Carried over from v1.0:

- Audio/video content module is present in the schema but disabled by default
- Full archive export (with media) is not yet implemented — only relations export to JSON works
- No email delivery — invitation links are still copied manually from the admin panel
- No mobile-native layout for the tree canvas

New in v2.0:

- Notifications fan out per audit entry. For very high-volume operations (a bulk import of 100+ people), expect a brief lag before all notifications appear; the fan-out runs fire-and-forget after each audit write.
- The side-bounded layout assumes both `fatherId` and `motherId` are set on the focus person. If only one parent is registered, the BFS only travels one direction and the entire visible graph ends up on a single side. Fix: register both parents (or set them later via the admin profile editor).

---

## Upgrading from v1.0

1. Pull `main` (commit at tag `v2.0.0`)
2. Run `npx prisma db push` against your existing database — the schema additions are non-destructive
3. Rebuild the Docker image: `docker compose up -d --build`
4. After deploy, admins should:
   - Click "↻ Auto-crear desde parejas" in the Núcleos tab to populate `ManagedFamilyUnit` rows from existing relationships and shared children
   - Verify each user has both `fatherId` and `motherId` set — required for the new layout to render their tree with paternal/maternal split

No data migration is required; all existing rows continue to work.
