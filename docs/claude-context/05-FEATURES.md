# 05 — Features

## Tree visualization

- **Pan/zoom canvas** — mouse drag, wheel zoom, touch pinch
- **Per-user perspective** — each user sees the tree from their own focus position
- **Side-bounded layout** — paternal lineage on the left, maternal on the right, 500px valley between (v2.0)
- **Generation alignment** — siblings and spouses always on the same row (v2.0 BFS-from-focus)
- **Couple arc** — horizontal connector between spouses, hidden for ex-couples
- **Sibling links** — discrete dashed arc for explicit siblings without registered shared parents (v2.0)
- **Pet orbits** — pets appear as small satellites around their owner, not in the gen grid
- **Search overlay** — `TreeSearch.tsx`, full-text across people in the visible set
- **Side panel** — clicking a node opens `PersonPanel.tsx` with quick info + actions
- **First-use onboarding** — overlay shown to new users
- **Viewport virtualization** — only nodes inside (or near) the viewport are rendered

Source: `src/components/tree/`, `src/lib/tree-layout.ts`, `src/lib/tree-types.ts`.

## Person profiles

- **Cover photo** — single hero image, top of profile
- **Basic data** — names (firstName, middleName, lastName), birth/death dates, birthplace, gender, bio
- **Birth surnames** — `birthSurname1`, `birthSurname2` (for cultures with two surnames at birth)
- **Featured gallery** — up to 9 photos marked `isFeatured`
- **Pet variant** — `nodeKind = PET` simplifies the form
- **Core flag** — `isCore=true` protects founding ancestors from accidental delete

Source: `src/components/profile/PersonPage.tsx` (read-only), `src/components/forms/PersonEditor.tsx` (edit/create).

## Content archive (per-person)

| Module | Type enum | Fields |
|--------|-----------|--------|
| Stories | `STORY` | title, body, authorName, occurredAt, confidence, visibility |
| Recipes | `RECIPE` | title, ingredients, steps, notes, photos |
| Diary | `DIARY` | title, body, occurredAt (date) |
| Interviews | `INTERVIEW` | title, body, authorName (interviewer), occurredAt |
| Objects | `OBJECT` | title, body, photos (heirlooms) |
| Sources | `SOURCE` | title, body (citations, references) |
| Important Links | (separate model) | named link from one Person to another or to a free-text figure |

Each item has a `visibility` (BRANCH/FAMILY/ADMIN) controlling who can read it.

After 10 days, content rows lock (`lockedAt` set on first save) — no UI unlock; admins can delete-and-recreate.

Source: `src/lib/content-types.ts`, `src/components/forms/ContentEditor.tsx`, `src/app/actions/content.ts`.

## Roles, scopes, and permissions

### Role (capability)
- **ADMIN** — approves proposals, manages users, edits everything
- **MEMBER** — proposes changes, edits within their scope

### Scope (visibility)
- **ADMIN scope** — sees and edits the entire family
- **FAMILY scope** — sees and edits the entire family (no proposal approval power)
- **BRANCH scope** — sees only their subtree (`branchRootId` + N degrees of blood relations)

### AccessRule (per-person override)
ALLOW or DENY a specific permission (`VIEW_PERSON`, `EDIT_PERSON`, `VIEW_MEDIA`, `VIEW_PRIVATE`, `VIEW_CONTENT`) for a specific user OR for a specific person.

Resolution in `src/lib/permissions.ts` and `src/lib/access-rules.ts`.

## Managed Family Units

A delegation layer mapping nuclear families to a representative user.

- Auto-created when a SPOUSE/PARTNER `Relationship` is created (in `createRelationship` action)
- Bulk-detected via "↻ Auto-crear desde parejas" in the admin núcleos tab — this catches couples that exist as shared children but have no explicit `Relationship` row
- Each unit has flags: `canInviteUsers`, `canEditPeople`, `canManageContent`, `canViewAudit`
- Affiliated persons (those whose parents aren't in the tree but who claim this unit) link via `Person.unitAffiliationId`

Label format: `"Familia <padre> <madre>"` (e.g. "Familia Apellido1 Apellido2") with male first, female second.

Source: `src/lib/managed-family-unit.ts`, `src/components/admin/AdminDashboard.tsx`.

## Proposals (member contributions)

Two types:

**`PersonUpdateProposal`** — change to an existing Person.

```
MEMBER opens PersonEditor → fills fields → submits
  ↓ creates PersonUpdateProposal { fieldChanges: { name: { old, new } }, status: PENDING }
  ↓ NotificationType.PROPOSAL_SUBMITTED to admins
ADMIN opens /[familySlug]/settings/proposals
  ↓ reviews, approves or rejects with reason
  ↓ on approve: applies fieldChanges to Person, status=APPROVED
  ↓ NotificationType.PROPOSAL_APPROVED or PROPOSAL_REJECTED to proposer
```

**`PersonCreationProposal`** — new Person to be added.

Same flow, but creates a brand-new Person on approval (using the proposed `fatherId`/`motherId` if provided).

Source: `src/app/actions/proposals.ts`, `src/app/(protected)/[familySlug]/settings/proposals/`.

## Notifications

Driven by the audit log — every `logAudit()` call kicks off `fanOutNotificationsFromAudit()` in the background.

| Audit action | Notification | Audience |
|--------------|--------------|----------|
| `CREATE_PERSON` | `NEW_PERSON_ADDED` | All FAMILY+ADMIN scope users in the family (excl. actor) |
| `UPDATE_PERSON` | `PERSON_UPDATED` | Admins + unit reps only |
| `CREATE_CONTENT` | `NEW_CONTENT_ADDED` | All FAMILY+ADMIN scope users (excl. actor) |
| `CREATE_PROPOSAL` | `PROPOSAL_SUBMITTED` | Admins |
| `APPROVE_PROPOSAL` | `PROPOSAL_APPROVED` | Original proposer |
| `REJECT_PROPOSAL` | `PROPOSAL_REJECTED` | Original proposer |

The `NotificationBell` in the header polls `getMyUnreadCount()` every 30 seconds. Clicking the bell opens a dropdown with the recent notifications and a "Mark all read" button.

Source: `src/lib/notifications.ts`, `src/lib/audit.ts`, `src/components/notifications/NotificationBell.tsx`.

## Search

Spanish-aware full-text matching across:
- Person names (first, middle, last, birth surnames)
- Person bio
- Content title and body

Returns combined results, ranked by exact match preference.

Source: `src/app/api/search/route.ts`, `src/lib/search-utils.ts`.

Configurable per-family via `FamilyConfig.moduleSearch`.

## Audit log

Append-only `AuditLog` table. Every server action that mutates data SHOULD call `logAudit()`. The action string is free-form but consistent:

- `CREATE_PERSON`, `UPDATE_PERSON`, `DELETE_PERSON`
- `CREATE_RELATIONSHIP`, `DELETE_RELATIONSHIP`
- `CREATE_CONTENT`, `UPDATE_CONTENT`, `DELETE_CONTENT`
- `UPLOAD_MEDIA`, `DELETE_MEDIA`
- `INVITE_USER`, `ACCEPT_INVITE`, `RESET_PASSWORD`
- `CREATE_PROPOSAL`, `APPROVE_PROPOSAL`, `REJECT_PROPOSAL`

Visible in the admin dashboard, "Auditoría" tab.

## Setup wizard

`/setup` is the first-run page. If the database has no Family rows, the wizard creates the first Family + first ADMIN user and redirects to the tree.

Public path (no auth required) — included in `proxy.ts` `PUBLIC_PATHS`.

## Invitation flow

Admins click "Invitar usuario" in the admin dashboard:

1. Enter username + name + role/scope
2. Server creates a User row WITHOUT password, generates an invitation JWT
3. Admin copies the link `https://arbol.example.com/invite/<token>` and sends it to the invitee out-of-band (email, Whatsapp, etc.) — there's no email delivery built in
4. Invitee opens the link, sees the acceptance form, sets their password
5. Token is single-use; after acceptance, login works normally

Source: `src/app/actions/invite.ts`, `src/lib/invite.ts`, `src/app/invite/[token]/page.tsx`.

## Password reset

Same shape as invitation:

1. Admin (or self-service if logged in) requests reset for a username
2. Server issues a reset JWT
3. User opens the link, sets new password
4. Token is single-use

Source: `src/app/actions/reset.ts`, `src/lib/reset.ts`, `src/app/reset/[token]/page.tsx`.

## Family configuration

Per-family flags and limits in `FamilyConfig`:

- Limits: `maxMediaPerPerson` (100), `maxFeaturedMedia` (9), `maxStories` (30), `maxStoryChars` (10k), `maxRecipeMedia` (3)
- Modules (boolean): `moduleStories`, `moduleDiary`, `moduleRecipes`, `moduleMedia`, `moduleObjects`, `moduleLinks`, `moduleAudioVideo`, `moduleExportImport`, `moduleSearch`

Editable in the admin dashboard, "Configuración" tab.

## Quick-action radial menu (v3.2)

Hover-still 1 second on any person node opens a small circular menu around the node with up to 6 actions:

| Bubble | Icon | Action | Disabled when |
|---|---|---|---|
| Sibling | 🧑‍🤝‍🧑 | Open editor with this person's parents pre-filled | — |
| Father | 👨 | Open editor with this person as the new person's child | Person already has fatherId |
| Mother | 👩 | Idem mother | Person already has motherId |
| Partner | 💕 | Open editor; on save, creates SPOUSE/PARTNER Relationship | Person has active partner (no endDate or future endDate) |
| Child | 👶 | Open editor with this person pre-set as parent | — |
| Invite | ✉️ | Generate invite link → copy to clipboard → close (no redirect) | Non-admin viewer |

**Trigger:** mouse stays still on a node for 1000ms (`HOVER_STILL_MS`). Movement > 8px resets the timer. Touch uses the same timing.

**Layout:** bubbles distributed in 180° upper arc (W → N → E) avoiding the south where the name renders. The angle distribution is algorithmic — `distributeAngles(n)` gives even spacing for any count.

**Positioning:** `RADIUS = NODE_W/2 + GAP + BUBBLE/2` in tree-coords. Rendered inside the same transformed container as PersonNodes, so they scale and translate with the tree zoom/pan automatically. Always anchored just outside the node border.

**Auto-close:** mousemove window listener checks if cursor exits a circle of `RADIUS + bubble/2 + 36px` from the cluster center. ESC also closes.

**Permissions:** the long-hover detector only activates when `canCreatePerson` (admin or representative). The invite bubble only shows when `isAdmin`.

Source: `src/components/tree/QuickActionMenu.tsx`, hover detector in `src/components/tree/PersonNode.tsx`, integration in `src/components/tree/FamilyTree.tsx`.

**Critical detail:** the `.quick-action-bubble` className is exempted from the tree's pan-handler drag check — without it, `setPointerCapture` steals the pointer and the button's onClick never fires.

## Adoption / step relations (v3.2)

`Person` has a `RelationKind` enum on each parent edge:

| Kind | Meaning |
|---|---|
| `BIOLOGICAL` | Blood (default) |
| `ADOPTIVE` | Legal adoption |
| `STEP` | Step-parent (current spouse of biological parent, no formal adoption) |

Columns `Person.fatherKind` / `Person.motherKind` are nullable — null is interpreted as legacy = BIOLOGICAL. UI dropdown appears in PersonEditor only when there's an actual fatherId/motherId assigned.

Sync rules: clearing the parent ID clears the kind. Assigning a parent without choosing kind defaults to BIOLOGICAL.

GEDCOM export emits `PEDI adopted` or `PEDI foster` automatically.

Half-siblings are NOT a separate model — they emerge naturally when two people share only one parent (different fatherId or motherId for each). The PersonEditor sibling-of flow has a hint reminding users to clear the non-shared parent.

## Invite link from person editor (v3.2)

In PersonEditor (admin, edit mode, non-PET), a section "Invitar a esta persona" with:

- Button "📨 Generar link de invitación" → `createInviteLink({ role: MEMBER, scope: FAMILY, personId })` → copy URL to clipboard automatically.
- Inline confirmation "✓ Link copiado al portapapeles" for 4 seconds.
- Read-only input with the URL + manual "Copiar" button as fallback.

The radial menu (§ Quick-action) also exposes this for fast multi-person inviting.

## @ Mentions in comments (v3.2)

Typing `@` in a comment opens a dropdown with family members. Selecting one inserts a styled mention link. On save:

- Server parses `@palabra` against family users (regex `@([\p{L}\p{N}_]+)` Unicode-safe)
- Match strategy: case-insensitive against `username` first (unique), then first name
- Stores matched user IDs in `Comment.mentionedUserIds: String[]`
- Creates `Notification.MENTION_IN_COMMENT` for each, excluding self-mentions

Render: each mention becomes a `<Link>` to the user's `Person` profile (if linked), styled with green text + light background.

Source: `src/lib/mentions.ts` (parser), `src/app/actions/comments.ts`, `src/components/ui/CommentsThread.tsx`.

## GEDCOM export (v3.2)

`GET /api/gedcom/export` (admin only) returns the family tree as a GEDCOM 5.5.1 file:

- INDI per Person — name (with `birthSurname1` as primary surname for genealogy), sex, BIRT (date + place), DEAT (date), NOTE with bio
- FAM constructed from shared (fatherId, motherId) — agglutinates children of same parents
- Additional FAM rows for SPOUSE/PARTNER Relationship without shared children
- MARR / DIV events with real dates from `Relationship.startDate` / `endDate`
- PEDI adopted/foster when `fatherKind`/`motherKind` is ADOPTIVE/STEP
- HEADER with software identifier + UTF-8 charset

Open in Ancestry, MyHeritage, FamilySearch.

NOT exported: content (stories, recipes, diary, interviews, sources), media, comments, reactions — those are extensions outside the GEDCOM spec.

GEDCOM **import** is intentionally not implemented yet. Open design questions: how to merge with existing tree, how to handle photo files referenced in the .ged, how to interpret approximate dates ("ABT 1940", "BEF 1900").

Source: `src/lib/gedcom-export.ts`, `src/app/api/gedcom/export/route.ts`. Button in TreeToolsMenu side drawer.

## Heatmap of content richness (v3.2)

Admin/representative can toggle a "Mapa de calor" mode in the side drawer. Each tree node receives a colored halo based on a richness score:

```
score = min(100, raw / 60 × 100)

raw = min(photos, 10) × 2
    + audioVideo × 10
    + stories × 8
    + interviews × 8
    + recipes × 7
    + sources × 6
    + objects × 5
    + diary × 5
    + links × 3
```

Calibration target: a "well-documented" person (1 audio + 2 stories + 1 recipe + 1 interview + 5 photos + 1 source ≈ 57) reaches near-full green.

**Color gradient (HSL, 2 segments):**

- 0–50: hue 0° → 50° (red → orange → yellow)
- 50–100: hue 50° → 120° (yellow → lime → green)

Render: `radial-gradient` halo behind each node + matching border color. Selector by `.person-circle` class for reliability across modes.

Server action: `getFamilyContentRichness()` in `src/app/actions/heatmap.ts`. Permissions: `canCreatePerson` (admin or representative).

## OCR for old documents (v3.2)

Photo lightbox shows a "📄 Extraer texto" button (admin/representative). Click → server action `extractTextFromImage(mediaId)`:

1. Verify caller can manage the person's content
2. Fetch image bytes from MinIO (uses `largeUrl` 1600px when available — sufficient for OCR, cheaper)
3. Call Claude Vision (`claude-sonnet-4-5`) with the image as base64 + prompt oriented to family documents
4. Return text preserving line breaks and structure

Result panel shows the extracted text with a "Copiar texto" button. Audit log entry `OCR_IMAGE`.

Requires `ANTHROPIC_API_KEY` in `.env.production`. If missing, returns user-friendly error string. The `@anthropic-ai/sdk` is loaded via dynamic import to keep the cold path light.

Source: `src/app/actions/ocr.ts`, UI in `src/components/profile/PersonPage.tsx` lightbox.

## Drag-drop reorder photos (v3.2)

Photo gallery in PersonPage now supports HTML5 native drag-drop. Drag a thumbnail over another → drops there → calls `reorderMedia(personId, orderedIds)` (already existed). Optimistic update with optional rollback via `router.refresh()` on server error.

Visual feedback: dragged card at 40% opacity, drop target outlined with 2px green outline.

## Keyboard shortcuts (v3.2)

Global keydown listener in the tree page:

- `/` — focus the search input
- `?` — toggle help overlay listing all shortcuts
- `Esc` — close active panel/menu (radial menu first, then person panel)

Filtered when typing in input/textarea/contenteditable except Esc.

Source: `src/components/tree/KeyboardShortcuts.tsx`.

## Dark mode (v3.2)

Toggle in the side drawer (☰). Persisted in `localStorage` under key `genome-tree-theme`. Inline `<head>` script applies the theme before first paint to avoid the FOUC.

Implementation: `data-theme="dark"` on `<html>` triggers a comprehensive set of CSS overrides in `globals.css` targeting common inline-style patterns via attribute selectors and specific element classes.

Cyan palette:

| Variable | Color | Use |
|---|---|---|
| `--night-bg` | `#121925` | Page background |
| `--night-surface` | `#1a2a3d` | Cards, panels |
| `--night-elevated` | `#123d50` | Highlight, hover |
| `--night-border` | `#146d86` | Borders, primary buttons |
| `--night-accent` | `#1da7c8` | Headings, links |
| `--night-text` | `#d4eef2` | Primary text (near-white with cyan tint) |
| `--night-muted` | `#5d8a99` | Secondary text |

**Important exceptions:**

- Tree person circles keep a light "pastille" look (light bg `#d4eef2`, dark text `#121925`) — same visual language as light mode, just over a dark page bg.
- Pet circles keep their sepia tint (`#ebe0c8`) with dark brown text — distinguishes them from person nodes.
- TreeSearch bar (`.tree-search-root`) keeps light colors — stands out as a luminous control element.

NO CSS filter trick — emojis (🔔, 🎂, etc.) render with their natural OS colors.

Source: `src/app/globals.css` (`html[data-theme="dark"]` rules), toggle in `src/components/tree/TreeToolsMenu.tsx`.

`getFamilyModules(familyId)` returns the booleans for use in route guards and menu rendering.
