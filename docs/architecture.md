# Architecture

This document describes how Genome Tree is structured, the key design decisions, and the algorithms that drive the family tree.

---

## Table of Contents

1. [System overview](#system-overview)
2. [Tech stack](#tech-stack)
3. [Key design decisions](#key-design-decisions)
4. [Request lifecycle](#request-lifecycle)
5. [Authentication](#authentication)
6. [Multi-tenancy](#multi-tenancy)
7. [Tree layout algorithm](#tree-layout-algorithm)
8. [Pet orbit placement](#pet-orbit-placement)
9. [Viewport virtualization](#viewport-virtualization)
10. [Content archive and locking](#content-archive-and-locking)
11. [Media storage](#media-storage)
12. [File structure](#file-structure)

---

## System overview

Genome Tree is a Next.js application backed by PostgreSQL and MinIO. All pages and data mutations are handled server-side via React Server Components and Server Actions. The client receives rendered HTML plus minimal client components for the interactive tree canvas and real-time UI.

```
Browser
  │
  ▼
Cloudflare Tunnel → Nginx → Next.js (port 3000)
                              │
                    ┌─────────┴──────────┐
                    │                    │
               PostgreSQL             MinIO
             (family data)       (media files)
```

In production the stack runs as five Docker containers (app, db, minio, nginx, cloudflared) on a single server. Cloudflare Tunnel exposes the application over HTTPS without opening any inbound ports on the host.

---

## Tech stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Framework | Next.js | 16.2.4 | App Router, Server Components, Server Actions |
| Runtime | React | 19.2.4 | — |
| Styling | Tailwind CSS | v4 | Uses `@theme` in globals.css — no `tailwind.config.ts` |
| ORM | Prisma | 7.8.0 | Requires `prisma.config.ts` + driver adapter |
| DB driver | `@prisma/adapter-pg` + `pg` | — | Prisma v7 no longer accepts URL in schema.prisma |
| Database | PostgreSQL | 16+ | — |
| Auth | `jose` | 6.x | Stateless JWT in httpOnly cookie |
| Storage | MinIO | latest | S3-compatible, self-hosted |
| Container | Docker + Nginx | — | Production stack |

### Next.js 16 — important breaking changes

- Route protection lives in `src/proxy.ts`, exported as `export const proxy`. The old `middleware.ts` / `export default function middleware()` API is gone.
- `params` in page components is now `Promise<{ slug: string }>` — always `await params` before destructuring.
- Read `node_modules/next/dist/docs/` for the full migration guide.

### Prisma v7 — important changes

- The datasource URL is configured in `prisma.config.ts` via `defineConfig({ datasource: { url } })`. The `datasource db {}` block in `schema.prisma` does not contain a `url` field.
- `PrismaClient` is instantiated with a driver adapter: `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`.
- In Docker, the Prisma WASM binary must be present alongside the CLI binary (copied in `Dockerfile`).

---

## Key design decisions

### No graph library for the tree

React Flow, D3, and similar libraries were evaluated and rejected. They provide too much generic infrastructure and impose visual conventions that don't match the organic, family-album aesthetic required. The custom layout engine in `src/lib/tree-layout.ts` gives full control over positioning, edge routing, and rendering, at the cost of ~400 lines of layout code.

### Parentage via direct fields, not a relationship table

Parent-child relationships are stored as `fatherId` and `motherId` on the `Person` model — not in a separate relationship table. This simplifies the tree traversal dramatically: finding a person's ancestors or descendants is a straightforward recursive query rather than a graph walk. Couple relationships (SPOUSE/PARTNER) live in the separate `Relationship` table because they are optional, formal, and have attributes (end date).

### Stateless JWT sessions

No session store. The JWT cookie carries all session state (`userId`, `familyId`, `familySlug`, `role`, `scope`, `personId`, `branchRootId`). This means the proxy can enforce authentication and route based on `familySlug` without a database round-trip per request. The tradeoff is that permissions can't be revoked instantly — they expire when the 7-day token expires.

---

## Request lifecycle

```
1. Browser sends request
2. proxy.ts inspects cookie:
   - No valid session → redirect /login
   - Valid session on /login → redirect /[familySlug]/tree
   - Valid session elsewhere → pass through
3. Page Server Component runs:
   - Calls getSession() to read JWT payload
   - Queries DB scoped to session.familyId
   - Returns rendered HTML
4. Client receives HTML + minimal JS bundle
5. Server Actions handle mutations (forms, buttons)
   - Re-validate session inside each action
   - Write to DB
   - revalidatePath() to refresh UI
```

---

## Authentication

`src/lib/session.ts` wraps `jose`:

- `createSession(payload)` — signs a JWT, sets it as an httpOnly, sameSite:lax cookie with 7-day expiry.
- `getSession()` — reads and verifies the cookie; throws if missing or invalid.
- `deleteSession()` — clears the cookie on logout.

The JWT payload:

```typescript
{
  userId:      string
  familyId:    string
  familySlug:  string
  role:        'ADMIN' | 'MEMBER'
  scope:       'ADMIN' | 'FAMILY' | 'BRANCH'
  personId:    string | null
  branchRootId: string | null
}
```

---

## Multi-tenancy

Every model in the database carries a `familyId` column. The tenant is identified by the `familySlug` URL segment (e.g., `/martinez/tree`). All database queries are scoped to `familyId` from the session — never trust the URL slug for authorization.

The `Family` model is the root tenant. Users belong to exactly one family. People, content, media, and all other resources belong to one family.

---

## Tree layout algorithm

The layout engine is in `src/lib/tree-layout.ts`. It runs entirely on the server during the tree page load and returns a flat list of `LayoutNode` objects with absolute `{ x, y }` positions.

### Inputs

- `persons: PersonData[]` — all people in the family (excluding pets — see below)
- `relationships: RelationshipData[]` — SPOUSE/PARTNER pairs (used alongside inferred couples)

### Steps

1. **Build adjacency maps** — `parentsOf`, `childrenOf`, `spousesOf` computed from `fatherId`/`motherId` fields and the Relationship table.

2. **BFS for generations** — start from root nodes (no parents), assign generation 0. Children get `max(gen(father), gen(mother)) + 1`. Spouses share the generation of their partner.

3. **Sort within each generation** — primary key: birth year. Secondary: group spouses adjacent to each other.

4. **X positioning (bottom-up)** — assign sequential X slots within each generation first (for leaf nodes). Then for each person with children, center them over their children. Spouses are placed immediately beside their partner.

5. **Overlap separation (forward pass)** — scan left-to-right within each generation; push nodes right if they overlap with minimum spacing (`H_GAP = 160px`).

6. **Center globally** — shift all X coordinates so the tree is centered around `x = 0`.

7. **Compute bounds** — `{ minX, minY, maxX, maxY }` for the SVG viewport.

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `NODE_W` | 80px | Node width |
| `NODE_H` | 80px | Node height |
| `H_GAP` | 160px | Minimum horizontal gap between nodes |
| `V_GAP` | 140px | Vertical gap between generations |

---

## Pet orbit placement

Pets are handled after the regular layout completes:

1. Filter pets out of the `persons` array before any generation logic runs.
2. Run the full layout for non-pets.
3. Build a `nodeById` map from the completed layout.
4. Group pets by owner (owner = `pet.fatherId ?? pet.motherId`).
5. For each owner's pets, assign angles from `ORBIT_ANGLES = [80, 35, 125, -35, 145, -80, 170]` degrees.
6. Compute orbit position:
   ```
   petX = ownerCenterX + ORBIT_R * cos(angleRad) - NODE_W / 2
   petY = ownerCenterY + ORBIT_R * sin(angleRad) - NODE_H / 2
   ```
   where `ORBIT_R = 110px`.
7. Push pet `LayoutNode` objects into the nodes array.
8. Populate `petLinks: PetLink[]` — used by `FamilyEdges` to draw dashed tether lines.

Pets with no valid owner are placed to the left of the tree at `y = 0` as orphans.

---

## Viewport virtualization

For families with many people, rendering all nodes degrades performance. `FamilyTree.tsx` tracks the current viewport (pan + zoom) and computes a `visibleIds` set on every pan/zoom event:

```typescript
const visibleIds = useMemo(() => {
  if (nodes.length < VIRTUALIZE_THRESHOLD) return null  // render all
  // expand viewport by BUFFER_PX on each side
  // return Set of node IDs whose bounding box intersects the expanded viewport
}, [nodes, viewBox, pan, zoom])
```

- `VIRTUALIZE_THRESHOLD = 80` nodes
- `BUFFER_PX = 320` — renders slightly beyond the visible area to avoid pop-in during fast pan
- Selected node and highlighted search result are always included regardless of position

`PersonNode` and `FamilyEdges` skip rendering when `visibleIds` is non-null and the node is not in the set.

---

## Content archive and locking

Each `Content` record has a `lockedAt` timestamp set to `createdAt + 10 days`. After that point, only ADMIN users can edit the record. This preserves the integrity of historical records added by family members.

The lock is enforced in the Server Actions (`src/app/actions/content.ts`) — not in the UI — so it cannot be bypassed by client manipulation.

---

## Media storage

Media files are stored in MinIO, an S3-compatible self-hosted object store. The `Media` model stores the MinIO object key and a public URL. In production, Nginx proxies `/media/` to MinIO's internal bucket, so the browser loads images from the same domain as the app (no CORS issues, no exposing MinIO ports).

Upload flow:
1. Client submits a multipart form to `POST /api/upload`.
2. The API route streams the file to MinIO using the AWS SDK.
3. A `Media` record is created in PostgreSQL with the key and public URL.
4. The response returns the media ID, which the client uses to attach the media to content or set it as a person's cover photo.
