# 08 — Procedures

> Step-by-step recipes for common tasks. Each one tells you which files to touch and in what order.

## Add a new field to Person

1. **Edit `prisma/schema.prisma`** — add the field in the `Person` model:
   ```prisma
   model Person {
     // ...
     myNewField String?
   }
   ```
2. **Run locally** `npx prisma generate` (regenerates the client)
3. **Run locally** `npx prisma db push` (applies to local DB)
4. **Update the editor** in `src/components/forms/PersonEditor.tsx` — add an input field and wire it to the form state
5. **Update the server action** in `src/app/actions/people.ts` — accept and persist the new field in `createPerson` / `updatePerson`
6. **Update the read view** in `src/components/profile/PersonPage.tsx` — display the new field
7. **Update the type** in `src/lib/content-types.ts` if the field appears in the editor payload
8. **Update the audit logging** — include the new field in `oldValue` / `newValue` JSON snapshots if it's a tracked change
9. **If the field affects the tree layout** — update `PersonData` in `src/lib/tree-types.ts` and the layout function
10. **Commit + deploy** following [06-DEPLOYMENT.md](./06-DEPLOYMENT.md)
11. **Apply schema in production**: run `prisma db push` via temp container

## Add a new content module (e.g. RECIPE → POEM)

1. **Edit `prisma/schema.prisma`** — add `POEM` to `enum ContentType`
2. **Update `src/lib/content-types.ts`** — extend the `ContentType` union and the editor field schema
3. **Update `src/components/forms/ContentEditor.tsx`** — add the new module's UI (fields specific to POEM)
4. **Update `src/components/profile/PersonPage.tsx`** — render POEM items in the profile
5. **Update `src/app/actions/content.ts`** — server action `createPoem`, `updatePoem`, etc.
6. **Update `getFamilyModules`** in `src/lib/family-config.ts` — add `modulePoems` if you want a per-family flag
7. **Update `prisma/schema.prisma`** `FamilyConfig` — add `modulePoems Boolean @default(true)`
8. **Add audit + notification fanout**: `logAudit({ action: 'CREATE_CONTENT', newValue: { type: 'POEM', ... } })`. The fan-out logic in `src/lib/notifications.ts` should already handle generic `CREATE_CONTENT` actions.
9. **Deploy + push schema**

## Add a new notification type

1. **Edit `prisma/schema.prisma`** — add the value to `enum NotificationType`
2. **Update `src/lib/notifications.ts`** — add a branch in `fanOutNotificationsFromAudit` that emits the new type for the appropriate audit action
3. **Update `src/components/notifications/NotificationBell.tsx`** — add the type to the icon map (`TYPE_ICON`)
4. **Deploy + push schema**

## Add a new server action

1. **Pick a file** in `src/app/actions/` based on the entity (people.ts, content.ts, admin.ts, etc.)
2. **Add the function** with `'use server'` at the top of the file:
   ```ts
   export async function myAction(input: { ... }): Promise<ActionResult<...>> {
     const session = await getSession()
     if (!session) return { ok: false, error: 'No autenticado' }

     // permission check
     if (session.role !== 'ADMIN') return { ok: false, error: 'No autorizado' }

     try {
       const result = await prisma.something.create({ data: { ... } })

       // audit
       void logAudit({
         familyId: session.familyId,
         userId: session.userId,
         action: 'MY_ACTION',
         entityType: 'Something',
         entityId: result.id,
         newValue: { ... },
       })

       revalidatePath(`/${session.familySlug}/...`)
       return { ok: true, data: result }
     } catch (err) {
       return { ok: false, error: (err as Error).message }
     }
   }
   ```
3. **Call from a client component** with `startTransition(() => myAction(input))`
4. The `void logAudit(...)` call automatically triggers notifications — no extra wiring needed

## Debug a tree layout issue

1. **Capture the user's screenshot** and identify the symptom: missing person, wrong row, wrong side, overlapping nodes
2. **Read [04-TREE-ALGORITHM.md](./04-TREE-ALGORITHM.md)** end-to-end if not familiar
3. **Inspect the relevant data**:
   ```bash
   ssh -i <KEY> root@<HOST> 'docker exec genome-db-1 psql -U genome_tree -d genome_tree -c "
     SELECT a.\"firstName\", a.\"lastName\",
            f.\"firstName\" as father, m.\"firstName\" as mother
     FROM \"Person\" a
     LEFT JOIN \"Person\" f ON a.\"fatherId\" = f.id
     LEFT JOIN \"Person\" m ON a.\"motherId\" = m.id
     WHERE a.\"firstName\" = '\''PersonaPadre'\'';
   "'
   ```
4. **Add tracing** locally — edit `tree-layout.ts` to `console.log` intermediate values for the affected person, run the dev server, reproduce
5. **Form a hypothesis** — common ones:
   - Focus has only one parent set → BFS travels in one direction only
   - Couple has age difference > 60 years → not in `inferredCouples`
   - Person is disconnected → ends up at gen 0 (top), score 0 (center)
   - `H_GAP` enforcement is shifting nodes (if multiple units want the same x)
6. **Test the fix** locally before deploying. Don't trust your reasoning alone for layout changes — the algorithm has bitten us multiple times.

## Debug an auth/permissions issue

1. **What does the user see?** A 404? A login redirect? A page rendered but with missing data?
2. **Inspect the session**: add `console.log(session)` in the server action / page that's failing
3. **Check the user's row** in the DB:
   ```sql
   SELECT id, username, role, scope, "branchRootId", "personId" FROM "User" WHERE username = '...';
   ```
4. **Check `getVisiblePersonIds`** in `src/lib/permissions.ts` — does it return the expected set for this user?
5. **Check `AccessRule` rows** for explicit DENY:
   ```sql
   SELECT * FROM "AccessRule" WHERE "familyId" = '...' AND ("userId" = '...' OR "targetPersonId" = '...');
   ```
6. **Check `FamilyConfig`** if a module-level toggle is involved (e.g. `moduleSearch=false` hides the search bar)

## Run a one-off DB query in production

```bash
ssh -i <KEY> root@<HOST> "docker exec -it genome-db-1 psql -U genome_tree -d genome_tree"
```

Or non-interactive:

```bash
ssh -i <KEY> root@<HOST> "docker exec genome-db-1 psql -U genome_tree -d genome_tree -c \"SELECT count(*) FROM \\\"Person\\\";\""
```

For complex multi-line queries, write the SQL to a local file and pipe it:

```bash
type query.sql | ssh -i <KEY> root@<HOST> "docker exec -i genome-db-1 psql -U genome_tree -d genome_tree"
```

## Add a new page

1. **Pick the route** under `src/app/(protected)/[familySlug]/`
2. **Create the folder + `page.tsx`**:
   ```tsx
   export default async function MyPage({
     params,
   }: {
     params: Promise<{ familySlug: string }>
   }) {
     const { familySlug } = await params       // Next.js 16: must await
     const session = await getSession()
     // ... fetch data, render
   }
   ```
3. **Authentication is already handled** by the `(protected)` layout
4. **Module gates** — if the page should be hidden when a module is off:
   ```tsx
   const modules = await getFamilyModules(session.familyId)
   if (!modules.moduleStories) notFound()
   ```
5. **Add a link** in the header / nav (look in the appropriate layout)

## Bulk auto-create managed family units

This is a button in the admin dashboard. Useful after importing data or fixing implicit pairs:

1. Admin → "Núcleos" tab → "↻ Auto-crear desde parejas"
2. Server action `bulkAutoCreateFamilyUnits` in `src/app/actions/admin.ts` runs:
   - **Phase 1 — corrections**: scans existing units; if `parentA` is FEMALE and `parentB` is MALE, swaps them and regenerates the label. Increments a `fixed` counter.
   - **Phase 2 — creations**: scans all couples (explicit Relationships + implicit pairs from shared children) and creates a unit for any pair without one
3. Returns `{ created, fixed }`; UI shows a confirmation toast

## Reset / delete a family (DESTRUCTIVE)

There's no UI for this. Only do it for testing in a dev DB:

```sql
-- Inside the dev DB
DELETE FROM "Notification" WHERE "familyId" = '...';
DELETE FROM "AuditLog" WHERE "familyId" = '...';
DELETE FROM "ContentMedia" WHERE "contentId" IN (SELECT id FROM "Content" WHERE "familyId" = '...');
DELETE FROM "Content" WHERE "familyId" = '...';
DELETE FROM "Media" WHERE "familyId" = '...';
DELETE FROM "ImportantLink" WHERE "familyId" = '...';
DELETE FROM "AccessRule" WHERE "familyId" = '...';
DELETE FROM "ManagedFamilyUnit" WHERE "familyId" = '...';
DELETE FROM "Relationship" WHERE "familyId" = '...';
DELETE FROM "PersonUpdateProposal" WHERE "familyId" = '...';
DELETE FROM "PersonCreationProposal" WHERE "familyId" = '...';
DELETE FROM "User" WHERE "familyId" = '...';
DELETE FROM "Person" WHERE "familyId" = '...';
DELETE FROM "FamilyConfig" WHERE "familyId" = '...';
DELETE FROM "Family" WHERE id = '...';
```

The order matters because of foreign keys.

## Tag a new version

After a meaningful set of changes:

1. **Update the version folder structure** — create `Version X.Y/` with `VERSION` (one line: `X.Y.Z`) and `RELEASE_NOTES.md`
2. **Update `package.json`** version field
3. **Commit**: `git commit -m "release: vX.Y.Z"`
4. **Tag**: `git tag -a vX.Y.Z -m "..."`
5. **Push**: `git push origin main && git push origin vX.Y.Z`

## Recover from a broken deploy

If a deploy makes the site unusable:

1. **`git revert HEAD --no-edit`** — creates a revert commit
2. **Re-deploy** following the standard procedure (robocopy + rebuild)
3. **Verify** the site is back
4. **Diagnose offline** — read logs, reproduce locally
5. **Fix and re-deploy** the fixed version (don't push the original broken commit again)

If the schema was changed and the rollback also requires schema changes:

1. Edit the schema to remove the new addition
2. `prisma db push` again — for additive changes, removal is also non-destructive UNLESS rows reference the removed value/column

---

## Rotate SESSION_SECRET

**When to rotate:** if the secret is leaked, appears in logs, or was committed to git.

**Effect:** all active sessions are immediately invalidated — every user must log in again. Reset and invite tokens also stop working (their keys are derived from SESSION_SECRET). Warn users before rotating if possible.

### Steps

1. **Generate a new secret** (run locally):
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

2. **Update `.env.production`** on the server:
   ```bash
   ssh -i USER_HOME/.ssh/SSH_KEY root@NAS_HOST
   nano "NAS_DEPLOY_PATH/.env.production"
   # Change SESSION_SECRET="..." to the new value
   ```

3. **Restart the app container** (no rebuild needed):
   ```bash
   cd "NAS_DEPLOY_PATH"
   docker compose up -d --force-recreate app
   ```

4. **Verify** the app starts cleanly:
   ```bash
   docker logs genome-app-1 --tail 10
   ```

> **Note:** the old secret is used for three separate keys internally: raw (session tokens), `+'-reset'` (reset tokens), `+'-invite'` (invite tokens). All three are invalidated when the secret changes.
