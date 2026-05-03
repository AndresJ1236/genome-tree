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

Label format: `"Familia <padre> <madre>"` (e.g. "Familia Jácome Pazmiño") with male first, female second.

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
3. Admin copies the link `https://arbol.adastranium.com/invite/<token>` and sends it to the invitee out-of-band (email, Whatsapp, etc.) — there's no email delivery built in
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

`getFamilyModules(familyId)` returns the booleans for use in route guards and menu rendering.
