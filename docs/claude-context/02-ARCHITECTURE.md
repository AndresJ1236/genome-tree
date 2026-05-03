# 02 — Architecture

## Tech stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Framework | Next.js | 16.2.4 | App Router only, no Pages. Turbopack production builds. |
| Runtime | React | 19.2.4 | Server Components by default |
| Language | TypeScript | 5.x | Strict mode |
| Styling | Tailwind CSS | v4 | New PostCSS plugin (`@tailwindcss/postcss`) |
| ORM | Prisma | 7.8.0 | With `@prisma/adapter-pg` |
| Database | PostgreSQL | 16-alpine | Single DB, multi-tenant via `familyId` |
| Auth | `jose` | 6.x | Stateless JWT in HTTP-only cookies |
| Password hashing | `bcryptjs` | 3.x | |
| Storage | MinIO | latest | S3-compatible, used for photos/media |
| Container | Docker + nginx + cloudflared | — | 5-service stack |
| Tunneling | Cloudflare Tunnel | — | No port forwarding required |

> The repo's `AGENTS.md` says: "This is NOT the Next.js you know" — read [09-GOTCHAS.md](./09-GOTCHAS.md#nextjs-16-breaking-changes) before touching middleware or page params.

## Folder structure

### `src/app/` — Next.js App Router

```
src/app/
├── layout.tsx               # Root layout (HTML shell)
├── page.tsx                 # Public landing → redirects based on auth
├── globals.css              # Tailwind + global styles
├── proxy.ts                 # Middleware (Next 16 renames middleware.ts → proxy.ts)
├── (protected)/             # Layout group: requires auth
│   ├── layout.tsx           # Auth check + family slug resolution
│   └── [familySlug]/
│       ├── tree/page.tsx              # Interactive tree canvas
│       ├── admin/page.tsx             # Admin dashboard
│       ├── settings/page.tsx          # User settings
│       ├── settings/proposals/        # Proposal review queue
│       └── person/
│           ├── new/page.tsx           # Create new person
│           └── [personId]/
│               ├── page.tsx           # Profile view
│               ├── edit/page.tsx      # Profile edit
│               └── content/
│                   ├── new/                  # Create content item
│                   └── [contentId]/edit/     # Edit content item
├── actions/                 # Server actions ('use server')
│   ├── people.ts            # CRUD for persons + relationships
│   ├── content.ts           # CRUD for stories/recipes/diary/etc.
│   ├── admin.ts             # Admin-only operations
│   ├── proposals.ts         # PersonCreationProposal + PersonUpdateProposal
│   ├── notifications.ts     # Read/mark-read notifications
│   ├── auth.ts              # Login/logout
│   ├── invite.ts            # Invite user, accept invitation
│   ├── reset.ts             # Password reset flow
│   ├── setup.ts             # First-time setup
│   └── media.ts             # MinIO upload coordination
├── api/                     # JSON endpoints (not server actions)
│   ├── search/route.ts      # Full-text search
│   └── relations/export/    # Relations JSON export
├── auth/login/route.ts      # POST handler for login form
├── invite/[token]/page.tsx  # Invitation landing
├── reset/[token]/page.tsx   # Password reset landing
├── login/page.tsx           # Login form
└── setup/page.tsx           # First-run wizard
```

### `src/components/`

```
src/components/
├── admin/AdminDashboard.tsx       # 1300-line tabbed admin UI
├── forms/
│   ├── PersonEditor.tsx           # ~1200 lines — create/edit persons + relationships
│   ├── ContentEditor.tsx          # Edit stories/recipes/etc.
│   ├── InviteAcceptanceForm.tsx
│   └── ResetPasswordForm.tsx
├── profile/PersonPage.tsx         # ~1100 lines — read-only profile view
├── tree/
│   ├── FamilyTree.tsx             # SVG canvas + pan/zoom
│   ├── FamilyEdges.tsx            # Edge rendering (couple arc, branch, sibling, pet tether)
│   ├── PersonNode.tsx             # Individual node circle
│   ├── PersonPanel.tsx            # Side panel when clicking a node
│   ├── TreeSearch.tsx             # Search overlay
│   └── OnboardingOverlay.tsx
├── notifications/NotificationBell.tsx   # Header bell + dropdown
└── ui/
    ├── HelpPanel.tsx
    └── HelpTooltip.tsx
```

### `src/lib/` — Pure logic (no React, no Next-specific runtime)

| File | Purpose |
|------|---------|
| `tree-layout.ts` | The layout engine. Generation BFS, lateral scoring, side-bounded x positioning. **See [04-TREE-ALGORITHM.md](./04-TREE-ALGORITHM.md).** |
| `tree-types.ts` | Shared types (`PersonData`, `RelationshipData`, `LayoutNode`, `FamilyUnit`, `SiblingLink`, `TreeLayout`) |
| `prisma.ts` | Single Prisma client instance (cached across hot reloads) |
| `session.ts` | JWT issuance/verification, session cookie helpers |
| `audit.ts` | `logAudit()` — writes AuditLog row + fires notification fan-out |
| `notifications.ts` | `fanOutNotificationsFromAudit()` — derives Notification rows from audit entries |
| `permissions.ts` | `getVisiblePersonIds(session)` — returns Set of person IDs visible to the user based on scope |
| `access-rules.ts` | Per-person ALLOW/DENY rule evaluation |
| `visibility-graph.ts` | BFS for BRANCH-scoped visibility (focus + N degrees of blood relatives) |
| `family-config.ts` | `getFamilyModules()` — reads which content modules are enabled |
| `managed-family-unit.ts` | Helpers for ManagedFamilyUnit ops |
| `managed-audit.ts` | Audit checks for unit-managed people |
| `content-types.ts` | Shared types for editors (`PersonEditorPayload`, `RelationshipItem`, etc.) |
| `person-name.ts` | `getPersonDisplayName()` — formats first + last with fallbacks |
| `relations-json.ts` | Import/export schema for the JSON relations format |
| `search-utils.ts` | Spanish-aware full-text matching helpers |
| `storage.ts` | MinIO client + signed URL generation |
| `invite.ts` | Invitation token issue/verify |
| `reset.ts` | Password reset token issue/verify |

### `prisma/`

```
prisma/
├── schema.prisma   # Single source of truth (~530 lines)
└── seed.ts         # Optional dev seed data
```

## Request lifecycle

### A typical authenticated page load

```
Browser GET /[familySlug]/tree
  ↓
Cloudflare Tunnel (terminates TLS)
  ↓
nginx (Docker, port 8080) — strips /media prefix or proxies to app
  ↓
Next.js app container (port 3000)
  ↓
proxy.ts middleware → checks JWT cookie, redirects if invalid
  ↓
(protected)/layout.tsx → loads session, validates familySlug
  ↓
[familySlug]/tree/page.tsx (Server Component) →
  - getSession()
  - prisma.family.findUnique({ where: { slug } })
  - getVisiblePersonIds(session)  → permissions filter
  - prisma.person.findMany({ where: { familyId, id: { in: visibleIds } } })
  - prisma.relationship.findMany({ where: { person1: { familyId } } })
  - getFamilyModules(familyId)
  ↓
React renders <FamilyTree persons relationships familySlug searchEnabled focusPersonId />
  (client component)
  ↓
useMemo → computeTreeLayout(persons, relationships, { focusPersonId })
  ↓
SVG nodes + edges → mounted in viewport
```

### A typical mutation (e.g. edit a person)

```
Client (PersonEditor) → form submit
  ↓
startTransition(() => updatePerson({ id, fields }))   ← server action
  ↓
'use server' on src/app/actions/people.ts
  ↓
getSession() → check role/scope
  ↓
prisma.person.update({ ... })
  ↓
logAudit({ action: 'UPDATE_PERSON', oldValue, newValue })  ← fire-and-forget
  └─ inside logAudit: fanOutNotificationsFromAudit() runs in background
       └─ creates Notification rows for relevant users (excluding actor)
  ↓
revalidatePath('/[familySlug]/tree')   ← Next.js cache bust
revalidatePath('/[familySlug]/person/[id]')
  ↓
return { ok: true } to client
  ↓
Client refreshes affected routes via Next.js Server Actions response
```

## Auth flow

1. User submits login form → POST `/auth/login`
2. `auth/login/route.ts` verifies credentials with `bcryptjs.compare()`
3. On success, issues a JWT via `jose` containing `{ userId, familyId, role, scope, personId, branchRootId }`
4. Sets HTTP-only cookie `session=<jwt>` with 30-day expiry
5. Redirects to `/[familySlug]/tree`
6. Subsequent requests: `proxy.ts` middleware reads cookie, decodes JWT, attaches session to request
7. Server actions/pages call `getSession()` to access the decoded payload

## Permissions model

Three orthogonal concepts:

| Concept | Stored on | Values | Effect |
|---------|-----------|--------|--------|
| `role` | User | `ADMIN`, `MEMBER` | App-wide capability — admins can approve proposals, edit everything |
| `scope` | User | `ADMIN`, `FAMILY`, `BRANCH` | Visibility scope — what people they can see |
| `branchRootId` | User | nullable Person ID | For `BRANCH` scope: the root of their visible subtree |
| `representativeUserId` | ManagedFamilyUnit | nullable User | If set, that user has unit-level admin powers (invite, edit, etc.) |
| `accessRules` | AccessRule rows | per-person ALLOW/DENY | Override scope for specific people/permissions |

Resolution order (in `permissions.ts` and `access-rules.ts`):

1. If `scope === 'ADMIN'` → see everyone in the family
2. If `scope === 'FAMILY'` → see everyone in the family
3. If `scope === 'BRANCH'` → BFS from `branchRootId` up to N degrees through blood relations (`visibility-graph.ts`)
4. Apply `AccessRule` overrides per-person

## Multi-tenancy

Every queryable model has a `familyId` foreign key. Every Prisma query includes a `familyId` filter derived from `session.familyId`. There is currently only one Family in production, but the schema is designed to support more.

The URL is `/[familySlug]/...` — the slug is resolved to a familyId in the protected layout, and any mismatch with the session's familyId causes a 404.
