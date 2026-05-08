# 09 — Gotchas

> Things that have bitten us. Read before changing routing, schema, or the tree algorithm.

## Next.js 16 breaking changes

The `AGENTS.md` in the repo root says: **"This is NOT the Next.js you know."** Specifically:

### `middleware.ts` is now `proxy.ts`

The file at `src/app/proxy.ts` exports a named `proxy` function (not a default `middleware`). Don't recreate `middleware.ts` — Next 16 ignores it.

### `params` is a Promise

In every page that has dynamic segments:

```tsx
export default async function Page({
  params,
}: {
  params: Promise<{ familySlug: string; personId: string }>
}) {
  const { familySlug, personId } = await params   // ← MUST await
  // ...
}
```

The same applies to `searchParams`. If you forget `await`, you get a runtime error and a hard-to-find React Server Components stack trace.

### `cookies()` and `headers()` are async

```tsx
import { cookies } from 'next/headers'
const cookieStore = await cookies()             // ← async
const token = cookieStore.get('session')?.value
```

### Turbopack caveats

Production builds use Turbopack by default. For some debugging scenarios it's worth using webpack:

```powershell
npm run build:local     # webpack production build
```

Hot reload behavior in dev mode (`npm run dev`) is occasionally flaky for server components — restart the dev server if you see "stale module" errors.

## Prisma & TypeScript

### Local `tsc` errors after schema change

When you add an enum value (e.g. `SIBLING`, `PERSON_UPDATED`), the LOCAL Prisma client doesn't know about it until you run `npx prisma generate`. Until then, `npx tsc --noEmit` shows errors like:

```
error TS2322: Type '"SIBLING"' is not assignable to type 'RelationshipType'.
```

**Fix:** run `npx prisma generate` locally. Or just deploy — the production build runs `prisma generate` automatically.

**DON'T** revert your changes thinking they're broken. Verify with `grep` that the schema and code are consistent.

### Schema change on production: `prisma db push` fails inside the app container

The app container has Prisma CLI but not the `effect` Node module. Running `npx prisma db push` from inside `genome-app-1` produces:

```
Error: Cannot find module 'effect'
Require stack:
- /app/node_modules/@prisma/config/dist/index.js
```

**Fix:** use a temporary `node:20-alpine` container that installs Prisma fresh. See [06-DEPLOYMENT.md](./06-DEPLOYMENT.md#applying-schema-changes) for the exact command.

This error ALSO appears in the app container startup logs every time, harmlessly — the entrypoint tries to push the schema but the failure is caught and ignored. **If you see only that error and `✓ Ready in 0ms` after, the app is fine.**

## Cloudflare + browser caching

After every deploy, the JS bundle hash changes, but Cloudflare and the browser may keep serving the old version for several seconds. **Always hard-refresh** (`Ctrl+Shift+R` / `Cmd+Shift+R`) when verifying a deploy.

If the user reports "I see no changes" right after a successful deploy:

1. Ask them to hard-refresh
2. Verify on the server: `ssh -i <KEY> root@<HOST> "grep -c '<unique string from your change>' <NAS_DEPLOY_PATH>/src/...`
3. Check the container created-at: `docker inspect genome-app-1 --format '{{.Created}}'`
4. If both confirm the new code is deployed, it's a browser cache issue

The Server Action error `Failed to find Server Action "<hash>"` in logs is usually a stale browser tab — harmless after refresh.

## Tree algorithm pitfalls

### Don't put disconnected people at a huge offset

A previous v2.0 attempt used `gen = tempDepth - 1000` for disconnected people, which after normalization put the connected family at gen ≈ 1000 → y ≈ 250,000 px → off-screen. **Use `gen = 0` for disconnected people** (top of canvas, alongside oldest ancestors).

### BFS-from-focus needs both parents on focus

If the focus user has only `fatherId` set (no `motherId`), the BFS only travels in the paternal direction and the entire visible graph ends up on the paternal side. The L/R split fails entirely.

**Fix in data:** make sure every Person who is a focus has both `fatherId` and `motherId` set, even if one points to a placeholder.
**Fix in algorithm:** there's a TODO to detect this case and use a registered SPOUSE of the known parent as a "fake" other parent for BFS purposes.

### Sibling relationships are NOT couples

When adding a `SIBLING` `Relationship` row, the code path in `tree-layout.ts` routes it to `explicitSiblings`, NOT to `inferredCouples` or `spousesOf`. A sibling MUST never be in `spousesOf` — that would make the layout treat them as a couple unit (drawn together with a couple arc, sharing children, etc.).

The branch in `createRelationship` action that auto-creates `ManagedFamilyUnit` is gated on `if (input.type === 'SIBLING') return early`.

### Pass 1 and Pass 2 are gone

Pre-v2.0, two alignment passes patched generation values for couples at different depths. They caused oscillation and edge cases. They've been **completely removed** in v2.0. Don't bring them back. BFS-from-focus handles all the cases they patched.

### Per-generation layout uses INDEX-based fallback

When a unit has no children (no `desiredCenter`), its x position comes from the side-bounded fallback, NOT from its score directly. An earlier v2.0 attempt tried to push scores apart numerically and it didn't translate to pixels because of this. The current `negUnits` / `zeroUnits` / `posUnits` partition is the right approach.

## Permissions

### `getVisiblePersonIds` returns null = "see all"

Return value `null` from `getVisiblePersonIds(session)` means "no filter" (admin/family scope). A non-null Set means filter to those IDs only (BRANCH scope or AccessRule-restricted).

When chaining queries:

```ts
const visibleIds = await getVisiblePersonIds(session)   // null | Set<string>

const persons = await prisma.person.findMany({
  where: {
    familyId: family.id,
    ...(visibleIds ? { id: { in: [...visibleIds] } } : {}),   // ← spread operator
  },
})
```

Don't `else` to an empty filter — that returns ALL rows, breaking BRANCH visibility.

### AccessRule overrides are post-filter

`AccessRule`-based DENY is applied AFTER the scope filter, in `access-rules.ts`. If you're querying outside `permissions.ts`, you might miss this. Prefer routing queries through `getVisiblePersonIds` rather than raw Prisma calls.

## Audit + notifications

### Don't await `logAudit`

It's fire-and-forget by design:

```ts
void logAudit({ ... })       // ✓ correct
await logAudit({ ... })      // ✗ blocks the response unnecessarily
```

The notification fan-out happens inside `logAudit` after the audit row is written. If you `await` it, you delay the user's response by the duration of the fan-out.

### Don't fan out notifications manually

Pre-v2.0 there was a `notifyFamilyMembers()` helper called from each action. This was deleted because it scattered the audience logic. Now ALL notifications come from `fanOutNotificationsFromAudit()`, called once inside `logAudit()`. Don't add new `notifyFamilyMembers` calls.

To add a new notification trigger, **emit an audit log entry with the right action name** and let the fan-out handle it.

## Database

### `familyId` is mandatory on every query

The schema is multi-tenant. Every row has `familyId`. Every query MUST filter by `session.familyId` to avoid leaking data across families. The current production has only one Family, but the schema is enforced.

### Unique constraint on Relationship by sorted IDs

`(person1Id, person2Id, type)` is unique. By convention, IDs are sorted ascending so the same couple isn't stored twice with the IDs swapped. The `createRelationship` action does this:

```ts
const [id1, id2] = [input.personId, input.partnerId].sort()
prisma.relationship.create({ data: { person1Id: id1, person2Id: id2, ... } })
```

If you bypass this, you can get duplicate rows.

## File transfer (robocopy)

### Always exclude `.env*`

```powershell
robocopy ... /XF .env *.log
```

Otherwise the local empty `.env` overwrites production secrets. This has happened.

### `/MIR` deletes files

`robocopy /MIR` mirrors — files in the destination but not in source are deleted. If you robocopy a single subfolder with `/MIR`, you're fine. If you robocopy the entire repo with `/MIR` and forget to exclude something important, you can lose data on the NAS.

Recommended: exclude `node_modules .next .git Final` always.

## CSP nonces

### Don't add a static CSP to `next.config.ts`

The `Content-Security-Policy` header is set per-request in `src/app/proxy.ts` using a unique 16-byte nonce. If you also add a CSP in `next.config.ts` → `headers()`, the static one will conflict with the per-request one (headers may both appear, or one overwrites the other depending on the browser). Keep CSP only in `proxy.ts`.

### `layout.tsx` must stay async

`src/app/layout.tsx` is `async` so it can call `await headers()` to read the `x-nonce` request header set by proxy.ts:

```tsx
const nonce = (await headers()).get('x-nonce') ?? ''
```

If you make it non-async (or forget the await), the nonce won't propagate and the browser will block inline scripts.

### `style-src` keeps `unsafe-inline`

Tailwind generates inline `<style>` tags at build time. Moving Tailwind styles to nonce-hashed form would require changes to the PostCSS pipeline. For now `style-src 'self' 'unsafe-inline'` is intentional. Don't remove it.

---

## Misc

### `Final/` folder

The early v1.0 release sat at `Final/Version 1.0/`. In v2.0 the `Final/` prefix was retired — use `Version X.Y/` at the repo root. The user asked for this explicitly so future versions don't have a "this is the last one" connotation.

### Spanish vs English

The user speaks Spanish primarily. UI strings, validation messages, and audit action names are mostly Spanish (e.g. `'No autenticado'`, `'Solo administradores...'`). Keep new strings in Spanish for consistency.

Internal code comments and docs (like this file) are in English so any Claude agent can read them.

### The user is also the focus

In screenshots, the focus person is the project owner ("Persona X"). When they say "mi papá" / "mi mamá" they mean their registered parents in the tree (placeholder: "Persona Y" / "Persona Z"). The maternal branch has many more relatives recorded than the paternal branch in the live data — that asymmetry is a property of the family, not a bug to fix.

---

## Lessons learned in v3.2

### Server actions: `'use server'` files can ONLY export async functions

In Next.js 16, a file with `'use server'` at the top can ONLY export async functions. Any other export (constants, types, interfaces, classes) will:

1. Cause the SSR module evaluation to fail with `Error: A "use server" file can only export async functions, found object.`
2. Cascade to break unrelated server actions in the same chunk — `Error: Failed to find Server Action <hash>`.

**This bit us in v3.1** — `export const REACTION_TYPES = [...]` in `src/app/actions/reactions.ts` broke the featured-photo toggle and other unrelated actions.

**Rule:** runtime constants and TS type/interface definitions go in plain `.ts` files (e.g. `src/lib/<feature>-types.ts`). Server actions import them.

Also: `export type { X }` from a `'use server'` file is also problematic — Turbopack sometimes treats it as a runtime export. Re-export from a separate `.ts` module instead.

### Pointer capture vs button clicks

The tree page's pan handler does `setPointerCapture` on `pointerdown` to enable smooth dragging. If you add a clickable element INSIDE the tree's transformed container (like the radial menu bubbles in v3.2), clicks on that element get hijacked:

```ts
const onPointerDown = useCallback((e: React.PointerEvent) => {
  if ((e.target as HTMLElement).closest('.person-node')) return  // exempt
  // ...
  e.currentTarget.setPointerCapture(e.pointerId)   // captures all subsequent events
}, [])
```

When the bubble is clicked: pointerdown bubbles up → tree captures pointer → button.onClick never fires.

**Fix:** add a stable className to the new clickable element AND add an exemption in the pan handler:

```ts
if (target.closest('.person-node')) return
if (target.closest('.quick-action-bubble')) return  // also exempt
```

### Tree-coords vs screen-coords for overlays

The tree's nodes are rendered inside a div with `transform: translate(...) scale(...)`. Two ways to render an overlay anchored to a node:

1. **Screen-space (`position: fixed`)** — calculate node's screen position with `getBoundingClientRect()` each time. Pro: simpler stacking context. Con: requires manual sync with zoom/pan.
2. **Tree-space (`position: absolute` inside the transformed div)** — render at the node's tree-coords (`node.x`, `node.y`). Pro: scales/translates automatically with the tree. Con: must be careful about pointer events (the parent has pan handlers).

The radial menu uses **option 2** since v3.2 because it gives perfectly consistent visual proportions at any zoom. See "Pointer capture vs button clicks" above for the tradeoff.

### CSS dark mode without a build-time refactor

The project has hundreds of inline styles with hardcoded hex colors. Doing dark mode "properly" would require refactoring all of them to CSS variables — too risky.

The v3.2 dark mode uses **attribute selectors** to target inline-style patterns, plus targeted class selectors for common elements:

```css
html[data-theme="dark"] [style*="background: #F5F0E8"] { background-color: #121925 !important; }
html[data-theme="dark"] .person-circle { background: #d4eef2 !important; }
```

**Pitfall:** attribute selectors only match if the inline style string contains the exact substring. React preserves the format you wrote (`'#F5F0E8'`), so consistency in code matters. If someone writes `background: #f5f0e8` (lowercase) the rule won't match.

**Pitfall avoided:** the original v3.2 attempt used a CSS `filter: invert + hue-rotate` on `<html>`. It produces a brown/sepia bg from the cream original AND descolors emojis (the bell turns blue, the cake changes). Rejected — current approach is more code but predictable.

### MarriageDate vs createdAt

`Relationship.createdAt` is the date the row was inserted, NOT the marriage date. Using it for the timeline gives absurd results (couples that separated in 2018 appearing to "marry" in 2026 because that's when someone added them to the system).

v3.2 introduced `Relationship.startDate` for the real date. `getTimelineEvents` skips the MARRIAGE event when `startDate` is null — better than fabricating a date.

When working with marriage events, ALWAYS use `startDate`. `createdAt` is only for audit/insertion order.

### OCR cost & permission

The OCR action calls Claude Vision — every call costs API credits. To prevent abuse:

- Permission gate: `assertCanManagePerson(media.personId, session, 'content')` — only admins or the person's representative can OCR.
- Uses `largeUrl` (1600px) when available instead of original 4K — sufficient for OCR, ~16x less data sent to API.
- `ANTHROPIC_API_KEY` must be in `.env.production`. If absent, returns user-friendly error string (no crash).
