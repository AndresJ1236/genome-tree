# Genome Tree v3.0.0 — Release Notes

**Release date:** 2026-05-06

---

## Overview

Genome Tree v3.0 takes the codebase from "works" to "comfortable for non-technical family members on any device." Four pillars of work:

1. **Photo system overhaul** — automatic image processing on upload (4K cap + WebP variants), 23× faster page loads on mobile
2. **Mobile / responsive UX** — bigger fonts, navigation aids, simplified forms, plain-Spanish labels
3. **Security hardening** — proper bucket policy for media, robust MIME validation on upload, soft delete to prevent accidental data loss
4. **New family-engagement features** — birthdays of the month, comments on stories, soft-delete recovery

The visible result for end users: the app now feels finished. Photos load in milliseconds even on 4G. Buttons are easy to tap on phone. Stories become conversations. And nothing destructive is actually destructive — everything is recoverable.

---

## Highlights

### 📸 Photo system rebuilt from scratch

A complete pipeline for image processing on every upload, using `sharp` and `libvips`. For each photo uploaded, **four versions** are generated and stored:

| Version | Size | Format | Used for |
|---------|------|--------|----------|
| **Original** | capped at 4K (3840px max side) | original format (JPEG/PNG/WebP/GIF) | Lightbox / download |
| **large** | ~250 KB at 1600px | WebP 85% | Profile expanded view |
| **medium** | ~50 KB at 400px | WebP 80% | Gallery grid, profile avatar |
| **thumb** | ~10 KB at 150px square (face-aware) | WebP 75% | Future tree node thumbnails |

**EXIF orientation respected** via `sharp.rotate()` — iPhone photos no longer appear sideways.

**Measured improvements** (typical browsing session):

| Scenario | v2.0 (no thumbnails) | v3.0 (with thumbnails) |
|----------|----------------------|------------------------|
| Profile with 9-photo gallery | ~19 MB | ~1 MB |
| Profile with 30 photos in "Fotos" tab | ~60 MB | ~2.2 MB |
| Browsing session: open tree + click 5 people + 2 profiles | **~70 MB** | **~3 MB** |

**23× lighter on mobile**. The 3.46 MB photo of Jessy María that previously made galleries crawl now ships as a 19 KB medium variant for grids and a 192 KB large variant for expanded view.

**Backfill executed** — all 11 existing photos in the production archive were processed retroactively. New uploads run through the pipeline automatically.

`pickMediaUrl(item, prefer)` helper provides graceful fallback to the original URL for any legacy row that hasn't been backfilled, so nothing breaks during transition.

### 📱 Mobile-friendly UI

Every interaction surface was retuned for touch and small screens:

- **"Ir a mí" button** in the tree corner — recenters the canvas on the logged-in user's position with one tap
- **Collapsible color legend** in the bottom-left explaining node colors
- **Larger fonts everywhere** — base 11px → 13–14px in PersonPanel, PersonNode, settings, and header nav
- **Visible help button** — replaced the cryptic 28px `?` circle with a labeled `? Ayuda` button
- **Better onboarding overlay** — emoji icons, larger text, clear pointer to the help button
- **Renamed "Mis propuestas" → "Mis cambios"** — clearer for non-technical members

### 📝 Forms simplified for everyone

Member-facing forms got a plain-Spanish polish:

- **Specific titles** — "Nueva historia" / "Editar receta" instead of generic "Nuevo contenido"
- **"Escribe aquí"** instead of "Cuerpo" for the main text field
- **"Referencia (opcional)"** instead of "Fuente" with a descriptive placeholder
- **"¿Qué tan seguro es esto?"** instead of "Confianza", with plain-Spanish options for HIGH/MEDIUM/LOW
- **Interview field reorder** — Título → Pregunta → Respuesta (was out of order)
- **Inline confirm buttons** — replaced 5 jarring native `confirm()` popups with a `ConfirmButton` component (single tap to arm, second tap to commit)
- **Bigger labels and buttons** — 13px labels, 15px buttons (vs. 11px / 12px previously)

### 🎂 Birthdays of the month

A small popover in the tree header shows everyone whose birthday falls in the current calendar month:

- 🎂 button labeled with the current month name
- Click → list ordered by day, with the age the person turns this year
- **Today's birthday → highlighted in yellow** and **a red dot on the button** as an indicator
- Past days of the current month → dimmed
- Toggle to include/exclude deceased family members (honor those who are gone, or focus on the living)
- Each entry links to the person's profile

Excludes soft-deleted people automatically. Respects per-user visibility scope.

### 💬 Comments on stories

Each story in a profile now has a discussion thread at the bottom:

- **"💬 Ver N comentarios"** or **"💬 Comentar"** if empty
- Lazy-loaded — comments don't fetch until expanded, so a profile with 30 stories doesn't fire 30 queries
- Author name + relative timestamp ("hace 5 min")
- Author can delete their own comments; admins can delete any
- **Automatic notifications** to all family members (excl. author) when a comment is posted, with new `NEW_COMMENT` notification type and 💬 icon in the bell

Currently scoped to stories only. Adding to recipes / diary / objects / etc. is a 3-line change per content type.

### 🗑️ Soft delete (recoverable trash)

Person and Content rows are no longer destructively deleted. Both models gain `deletedAt` and `deletedById` fields:

- `deletePerson` and `deleteContent` actions now `UPDATE { deletedAt: now() }` instead of `DELETE`
- All listing queries filter `deletedAt: null` (tree page, candidate selectors, profile content, search)
- Single-row lookups by ID still find soft-deleted rows — needed for restoration
- New `restorePerson` and `restoreContent` admin actions return rows to active state
- Audit log records the delete action and links the actor

This is purely additive — the existing rules (can't delete a person with descendants) still apply. The only change is that when a delete IS allowed, it's recoverable.

### 🔒 Security improvements

- **Bucket policy** — MinIO `genome-tree` bucket now has an explicit anonymous-read policy applied via code in `ensureBucket()`. Without it, nginx's `proxy_pass` to MinIO returned 403 because nginx doesn't sign requests with MinIO credentials. Real security stays at the nginx layer (`auth_request` gates `/media/` behind a session cookie) — bucket access alone is unguessable due to CUID + epoch + 6-char random keys.
- **Robust MIME validation** — uploads now resolve a canonical MIME type via `resolveMimeType(file)` that:
  - Normalizes informal aliases (`image/jpg` → `image/jpeg`)
  - Falls back to file extension when the browser sends an empty `file.type` (common on some Android keyboards and older Safari builds)
  - Rejects only when both the reported MIME and the extension are unknown
- **Soft delete** prevents accidental destructive actions — admins can recover any person or story they deleted by mistake.
- **Sibling relationship safety** — explicit `SIBLING` rows route through `explicitSiblings` map (separate from `inferredCouples`), so the layout never accidentally treats siblings as a couple.

### 🧹 Repo and ops hygiene

- **Comprehensive Claude Code agent docs** — `docs/claude-context/` (~2100 lines, 11 files) covering architecture, database, tree algorithm in depth, deployment procedure, gotchas, and history. New AI agents can pick up the project end-to-end.
- **Deploy artifacts removed from git** — `DEPLOY.md` and `deploy-server.sh` (which contained server IP and SSH key path) are now gitignored and live only on the developer's machine.
- **Docker cache cleanup** — freed 34.67 GB of stale Docker build cache and orphaned image layers from the production NAS without touching any data.
- **Sharp + libvips bindings** explicitly copied in the runner stage of the Dockerfile to survive Next.js standalone tracing.

---

## Algorithm details (tree, carried from v2.0 with one important bug fix)

The tree layout pipeline introduced in v2.0 (BFS-from-focus generation assignment, side-bounded paternal/maternal split, lateral score propagation) is unchanged. One **structural enhancement** was added in v3.0:

- **Explicit SIBLING relationships** — a new `Relationship.type = SIBLING` lets you mark people as siblings even when their shared parents aren't recorded. Useful for the topmost row of a tree (e.g., "Fabiola, Santiago, Lupe son hermanos de Ana"). The BFS traverses these edges sideways (same generation), and the renderer draws a discrete dashed arc above the row — visible only when the siblings DON'T already share a registered parent (those already get a junction edge through their family unit).

---

## Schema changes

### New columns on `Media`

- `thumbUrl: String?` — 150px WebP variant
- `mediumUrl: String?` — 400px WebP variant
- `largeUrl: String?` — 1600px WebP variant
- `width: Int?` — actual width of original (post-cap)
- `height: Int?` — actual height of original

### New columns on `Person`

- `deletedAt: DateTime?` — soft delete marker
- `deletedById: String?` — who soft-deleted

### New columns on `Content`

- `deletedAt: DateTime?` — soft delete marker
- `deletedById: String?`

### New table: `Comment`

```prisma
model Comment {
  id          String    @id @default(cuid())
  contentId   String
  familyId    String
  authorId    String
  body        String    @db.Text
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?
  @@index([contentId, createdAt])
}
```

### New `RelationshipType` enum value: `SIBLING`

Routed separately from SPOUSE/PARTNER in `tree-layout.ts` (does NOT pollute `inferredCouples`).

### New `NotificationType` enum value: `NEW_COMMENT`

Fired automatically via `logAudit('CREATE_COMMENT')` → `fanOutNotificationsFromAudit()`.

Apply with `prisma db push` from a temp `node:20-alpine` container — see `docs/claude-context/06-DEPLOYMENT.md`.

---

## Tech stack

Same as v2.0. The only new runtime dependency is **`sharp` 0.34** (for image processing). It pulls platform-specific `libvips` bindings via `@img/sharp-linuxmusl-x64` on the Alpine runner.

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js | 16.2.4 |
| Runtime | React | 19.2.4 |
| Styling | Tailwind CSS | v4 |
| ORM | Prisma | 7.8.0 |
| Database | PostgreSQL | 16-alpine |
| Auth | jose JWT | 6.x |
| **Image processing** | **sharp / libvips** | **0.34** *(new)* |
| Storage | MinIO | latest |
| Container | Docker + nginx + cloudflared | — |

---

## Storage projections (real numbers)

For sizing future hard drives, with thumbnails enabled and original capped at 4K, real measurements from the production archive:

| Photo type | Original (raw phone) | Original (capped 4K) | Large WebP | Medium WebP | Thumb WebP |
|------------|----------------------|----------------------|------------|-------------|------------|
| Big landscape | 3.46 MB | **1.44 MB** | 192 KB | 19 KB | 6 KB |
| Portrait scan | 1.33 MB | 1.33 MB (already small) | 77 KB | 21 KB | 4 KB |
| Average mix | ~2 MB | ~1.1 MB | ~250 KB | ~50 KB | ~10 KB |

For a family of **100 people** at "rich archive" (25 photos/person):

| Strategy | Total storage |
|----------|---------------|
| v2.0 (no resize) | ~5.1 GB |
| **v3.0 (cap + thumbs)** | **~2.8 GB** *(45% less, plus 23× faster page loads)* |

A modest 50–250 GB disk is enough for hundreds of members and decades of growth.

---

## Upgrading from v2.0

1. Pull `main` (commit at tag `v3.0.0`)
2. Run `prisma db push` against your existing database — additive changes only
3. Rebuild the Docker image: `docker compose up -d --build`
4. **Run the photo backfill** to generate variants for existing photos:

   ```bash
   set -a && . .env.production && set +a
   docker run --rm --network <stack>_default \
     -v <repo>:/app -w /app \
     -e DATABASE_URL="$DATABASE_URL" \
     -e MINIO_ENDPOINT=minio -e MINIO_PORT=9000 \
     -e MINIO_ROOT_USER="$MINIO_ROOT_USER" \
     -e MINIO_ROOT_PASSWORD="$MINIO_ROOT_PASSWORD" \
     -e MINIO_BUCKET=genome-tree \
     -e MINIO_PUBLIC_URL="$MINIO_PUBLIC_URL"  \
     node:20-alpine sh -c '
       npm install --no-save sharp @aws-sdk/client-s3 \
         @prisma/client@7.8 @prisma/adapter-pg@7.8 prisma@7.8 pg tsx &&
       npx prisma generate --schema /app/prisma/schema.prisma &&
       npx tsx scripts/backfill-image-variants.ts'
   ```

   Idempotent: only processes rows where `thumbUrl IS NULL`.

   **CRITICAL**: do not omit `MINIO_PUBLIC_URL` — without it, the script falls back to internal Docker URLs (`http://minio:9000/...`) that the browser cannot reach. See script header for details and the SQL fix if you forget.

5. Verify in admin: Núcleos tab shows correct labels; soft-deleted persons no longer appear in tree; profile photos load fast.

No data migration is required.

---

## Known limitations (carried from v2.0)

- Audio/video module schema exists, upload pipeline isn't built
- Full archive export with media not implemented (relations JSON export works)
- No SMTP delivery for invitation links — admin still copies them manually
- Comments are scoped to stories only (extending to other content types is a 3-line change)
- The side-bounded layout assumes the focus person has both `fatherId` and `motherId` set; with only one parent registered, the BFS travels in only one direction. Workaround: register both parents, even with placeholder names.

---

## What's not in this release

Things that came up during the v3.0 cycle but were deliberately deferred:

- **Email delivery** for invitations
- **Trash management UI** — restore actions exist on the server, but admin needs a "Papelera" page to use them through the UI (currently only via direct DB)
- **Audio / video uploads**
- **Mobile-native tree canvas** — the canvas works on tablet/desktop; phone canvas needs custom touch gestures and a pinch-to-zoom implementation
- **Full archive (`.zip`) export with media**

These remain candidates for v3.1 / v4.0.
