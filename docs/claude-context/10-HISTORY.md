# 10 — History

> Major changes timeline. Detail-level changelog lives in `Version X.Y/RELEASE_NOTES.md`.

## v3.2.0 — May 8, 2026

The "speed of capture + genealogical depth" release. Full notes at `Version 3.2/RELEASE_NOTES.md`.

### Quick-action radial menu on tree nodes

- Hover-still 1s on any person node opens a circular radial menu of 5–6 small action bubbles (sibling, father, mother, partner, child, invite-link).
- Disables individual bubbles when the relationship already exists (e.g., father bubble greys out if person has fatherId).
- Bubbles render in tree-coords inside the transformed container — scale with the tree zoom, always anchored just outside the node border.
- Clicking a bubble navigates to `/person/new` with prefilled URL params (`childOf`, `parentOf`, `siblingOf`, `partnerOf`, `asParent`) that the editor reads to pre-populate the form.
- Invite bubble (admin only) generates a link directly without redirect, copies to clipboard, shows inline confirmation.

Anti-falsos-positivos: 8px movement tolerance during the 1s hover (resets timer), auto-close when cursor exits the bubble cluster radius, ESC close.

Source: `src/components/tree/QuickActionMenu.tsx`, hover detection in `PersonNode.tsx`.

### Genealogical depth

- **Adoption / step-parent flag.** New enum `RelationKind` (BIOLOGICAL / ADOPTIVE / STEP), columns `Person.fatherKind` and `Person.motherKind`. UI dropdown next to each parent assignment in PersonEditor. Legacy data interpreted as BIOLOGICAL (null = legacy).
- **Real marriage date.** New `Relationship.startDate` column. Timeline omits the MARRIAGE event when startDate is null (better than showing wrong date — the previous bug rendered marriages on the date the relationship was *registered* in the system, not when the actual marriage happened).
- **Half-siblings (UX hint).** Schema already supported them (fatherId/motherId independent). Added a hint in the sibling-of editor flow explaining how to remove the non-shared parent.

### GEDCOM export

- `GET /api/gedcom/export` (admin only) returns a GEDCOM 5.5.1 file with INDI per person, FAM constructed from shared fatherId/motherId, MARR/DIV events with real dates, PEDI adopted/foster when fatherKind/motherKind is ADOPTIVE/STEP, NOTE with the bio.
- Open in Ancestry, MyHeritage, FamilySearch.
- No content (stories, recipes) or media — those are extensions outside GEDCOM standard.
- GEDCOM **import** deferred to a future release (open design questions: duplicates, photo files, uncertain dates).

### Editor UX

- **Invite link button** in PersonEditor (admin, edit mode, non-PET) — generates a MEMBER+FAMILY-scope invite for that specific person, copies to clipboard, shows "✓ Link copiado" feedback for 4 seconds.
- **Images in stories/diary/interviews** — previously only recipes and objects. New gallery render in PersonPage shows the images below the body. Cap raised to **1920px (HD)** vs 3840px (4K) for person photos — saves ~75% storage with no quality loss for thumbnails.
- **Redirect to edit after creating content** — was returning to the profile, where the upload UI is invisible. Now lands on the edit page where users see the upload zone immediately.
- **@mentions in comments** with autocomplete dropdown, Unicode-safe regex, MENTION_IN_COMMENT notifications. New `Comment.mentionedUserIds: String[]` column.

### Tree visual tools

- **Dark mode** via custom CSS overrides (no filter trick — emojis stay natural). Cyan palette: bg `#121925`, surface `#1a2a3d`, accent `#1da7c8`, text `#d4eef2`. Toggle in side drawer, persisted in localStorage, inline `<head>` script applies before first paint to avoid flash.
- **Heatmap dashboard** (admin/representative) — toggle in side drawer paints each node with a halo coloured by content richness. Score 0–100 from weighted sum (audio/video × 10, stories × 8, recipes × 7, etc., photos capped at 10). Gradient red → orange → yellow → lime → green via 2-segment HSL interpolation.
- **Drag-drop reorder** for the photo gallery. Persists via existing `reorderMedia` action.
- **Keyboard shortcuts**: `/` focuses search, `?` opens shortcut overlay, `Esc` closes panels.
- **Side drawer** with ☰ button — consolidates Tiempo/Mapa/JSON/GEDCOM/Configuración that previously cluttered the top bar. Slides in from right with 220ms cubic-bezier transition.

### OCR for old documents

- Button "📄 Extraer texto" in photo lightbox (admin/representative) calls Claude Vision (`claude-sonnet-4-5`) with the image and a prompt oriented to old documents (acts, letters, certificates).
- Returns extracted text preserving structure, shows in panel with copy-to-clipboard button.
- New runtime dep: `@anthropic-ai/sdk` (loaded dynamically to keep cold path light).
- **Requires `ANTHROPIC_API_KEY` in `.env.production`** — if missing, returns user-friendly error.

### Bug fixes

- **Pending proposals visible in `/settings/proposals`** — that page only showed user's own proposals. Now also shows "Por revisar" section for admins/representatives with inline Approve/Reject. Notification href changed from `/admin` to `/settings/proposals`.
- **Featured-photo toggle ★ working again** — `export const REACTION_TYPES` in a `'use server'` file broke SSR module loading in Next.js 16, cascading to break unrelated server actions. Constants moved to `src/lib/reactions-types.ts`.
- **Radial menu bubbles clickable again** — pan handler's `setPointerCapture` was stealing the pointer before button.onClick fired. Fix: exempt `.quick-action-bubble` from drag-initiation.
- **Half-marriage display fixed** — see "Real marriage date" above.

### Schema changes

- `Person`: + `fatherKind`, `motherKind` (RelationKind?)
- `Relationship`: + `startDate`
- `Comment`: + `mentionedUserIds: String[]`
- New enum: `RelationKind { BIOLOGICAL, ADOPTIVE, STEP }`
- `NotificationType`: + `MENTION_IN_COMMENT`

### New runtime dependencies

- `@anthropic-ai/sdk` — for OCR (dynamic import)

---

## v3.1.0 — May 6, 2026

The "engagement, exploration and operational resilience" release. Full notes at `Version 3.1/RELEASE_NOTES.md`. Highlights: reactions on stories/photos, kinship calculator badge, "hace X años" panel, audio/video module activation, Sentry + Vitest integration.

---

## v3.0.0 — May 6, 2026

The "ready for the family" release. Full notes at `Version 3.0/RELEASE_NOTES.md`.

### Photo system rebuilt

- `sharp` + `libvips` pipeline on every upload generates 4 versions: original capped at 4K, plus 1600/400/150px WebP variants.
- `pickMediaUrl(item, prefer)` helper with graceful fallback for legacy rows.
- All 11 production photos backfilled. Browsing session weight: ~70 MB → ~3 MB (23× lighter on mobile).
- EXIF orientation now respected via `sharp.rotate()` — iPhone photos no longer sideways.

### Mobile / responsive UX

- "Ir a mí" button to recenter the tree on the focus person.
- Collapsible color legend explaining node colors.
- Bigger fonts everywhere (11px → 13–14px).
- Visible "? Ayuda" button (was a cryptic 28px circle).
- Forms simplified with plain Spanish: "Escribe aquí" instead of "Cuerpo", "¿Qué tan seguro es esto?" instead of "Confianza", specific titles ("Nueva historia") instead of generic "Nuevo contenido".
- Native `confirm()` dialogs replaced with inline `ConfirmButton` (single tap to arm, second tap to commit).

### New family-engagement features

- **Birthdays of the month** popover in the tree header. Today's birthday highlighted with a red dot indicator on the button.
- **Comments on stories** — lazy-loaded thread per story, with author + relative timestamp, soft-delete-aware. Notifications via new `NEW_COMMENT` type.
- **Soft delete** — Person and Content rows now have `deletedAt`/`deletedById`. Recoverable via `restorePerson` / `restoreContent` admin actions. All listing queries filter `deletedAt: null`.

### Security improvements

- MinIO bucket policy applied programmatically in `ensureBucket()` (anonymous reads enabled inside Docker network; nginx auth_request gates external access).
- Robust MIME validation in upload — `resolveMimeType(file)` normalizes informal aliases, falls back to file extension, rejects only unknown types.
- Soft delete prevents accidental data loss — every destructive action is now recoverable.

### Schema changes

- `Media`: + `thumbUrl`, `mediumUrl`, `largeUrl`, `width`, `height`
- `Person`: + `deletedAt`, `deletedById`
- `Content`: + `deletedAt`, `deletedById`
- New table `Comment` with `(contentId, createdAt)` index
- `RelationshipType` enum: + `SIBLING`
- `NotificationType` enum: + `NEW_COMMENT`

### New runtime dependency

- `sharp` 0.34 (with `libvips` Linux musl bindings copied explicitly in the Dockerfile runner stage)

---

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
