# 03 — Database

> Single source of truth: [`prisma/schema.prisma`](../../prisma/schema.prisma)

## Models at a glance

| Model | Purpose |
|-------|---------|
| `Family` | Tenant root — every other row has `familyId` |
| `Person` | Person OR pet in the tree |
| `Relationship` | Spouse / partner / sibling links |
| `User` | Login account, optionally tied to a Person |
| `ManagedFamilyUnit` | Delegated nuclear family unit with a representative user |
| `AccessRule` | Per-person ALLOW/DENY override |
| `FamilyConfig` | Per-family limits and module flags |
| `AuditLog` | Append-only log of all mutations |
| `Content` | Story/recipe/diary/interview/object/source — attached to a Person |
| `Media` | Photo/file in MinIO + metadata |
| `ContentMedia` | Many-to-many between Content and Media |
| `ImportantLink` | Named relationships from one Person to another (or to a free-text figure) |
| `PersonUpdateProposal` | MEMBER-proposed edit to an existing Person |
| `PersonCreationProposal` | MEMBER-proposed new Person |
| `Notification` | In-app notification row |

## Enums

```prisma
enum Gender         { MALE FEMALE OTHER UNKNOWN }
enum PersonKind     { PERSON PET }
enum RelationshipType { SPOUSE PARTNER SIBLING }   // SIBLING added v2.0
enum UserRole       { ADMIN MEMBER }
enum UserScope      { ADMIN FAMILY BRANCH }
enum ContentType    { STORY RECIPE OBJECT DIARY INTERVIEW SOURCE }
enum Visibility     { BRANCH FAMILY ADMIN }        // visibility of a Content item
enum ConfidenceLevel { HIGH MEDIUM LOW }
enum AccessEffect   { ALLOW DENY }
enum AccessPermission { VIEW_PERSON EDIT_PERSON VIEW_MEDIA VIEW_PRIVATE VIEW_CONTENT }
enum ProposalStatus { PENDING APPROVED REJECTED }
enum ClaimedRelation { SIBLING HALF_SIBLING UNCLE_AUNT GREAT_UNCLE_AUNT
                       COUSIN NEPHEW_NIECE ANCESTOR EXTENDED_FAMILY }
enum NotificationType { PROPOSAL_SUBMITTED PROPOSAL_APPROVED PROPOSAL_REJECTED
                        NEW_PERSON_ADDED NEW_CONTENT_ADDED PERSON_UPDATED
                        SECURITY_ALERT }   // added May 2026 — login block alerts
```

## Person — the central model

```prisma
model Person {
  id            String    @id @default(cuid())
  familyId      String

  firstName     String
  middleName    String?
  lastName      String
  birthSurname1 String?       // optional birth surnames (cultures with two)
  birthSurname2 String?

  birthDate     DateTime?
  deathDate     DateTime?
  birthPlace    String?
  gender        Gender     @default(UNKNOWN)
  nodeKind      PersonKind @default(PERSON)
  bio           String?
  coverPhoto    String?       // S3/MinIO key

  fatherId      String?       // self-referential
  motherId      String?       // self-referential

  isCore        Boolean    @default(false)   // protect founders from accidental delete

  // Affiliation when parents are unknown
  unitAffiliationId   String?
  claimedRelation     ClaimedRelation?
  claimedRelationOfId String?
}
```

**Key invariants:**

- `fatherId` and `motherId` are nullable — a Person can have 0, 1, or 2 known parents.
- The genealogical structure lives ENTIRELY in `fatherId`/`motherId`. The `Relationship` table is for SPOUSE/PARTNER/SIBLING links only — it does NOT encode parent-child relationships (those would be `PARENT_CHILD` in some schemas; here they're direct FKs).
- `nodeKind === 'PET'` excludes the row from the generation grid in the tree layout. Pets orbit their owner instead.
- `isCore` makes the row delete-protected via UI; admins must remove the flag first.

## Relationship

```prisma
model Relationship {
  id        String           @id @default(cuid())
  familyId  String
  person1Id String
  person2Id String
  type      RelationshipType  // SPOUSE | PARTNER | SIBLING
  endDate   DateTime?         // for SPOUSE: divorce/end. SIBLING ignores this.

  @@unique([person1Id, person2Id, type])
}
```

- For SPOUSE/PARTNER: `endDate` non-null means "ex-couple" — affects the tree visualization (the couple arc is hidden for ex-couples).
- For SIBLING: `endDate` is unused. SIBLING rows let you mark people as siblings even when their shared parents aren't recorded yet (typical for the topmost row of a tree).
- `(person1Id, person2Id, type)` is unique. By convention IDs are stored sorted ascending so `(A, B, SPOUSE)` and `(B, A, SPOUSE)` collapse to the same row.

## User & permissions

```prisma
model User {
  id              String    @id @default(cuid())
  username        String    @unique
  passwordHash    String
  name            String
  familyId        String
  personId        String?   @unique     // optional link to their own Person row
  role            UserRole  @default(MEMBER)
  scope           UserScope @default(FAMILY)
  branchRootId    String?               // BRANCH-scoped users: root of their visible subtree
  sessionVersion  Int       @default(0) // increment to invalidate all active sessions
  resetTokenJti   String?   @unique     // jti of the last consumed reset token (prevents replay)
}
```

The combination of `role`, `scope`, and `branchRootId` determines what a user can see/edit. See [02-ARCHITECTURE.md](./02-ARCHITECTURE.md#permissions-model) for the resolution order.

**`sessionVersion`** — embedded in the JWT at login time. `proxy.ts` compares the JWT claim against the DB value on every request; a mismatch invalidates the session. Increment to force-logout a user without needing a session store. See [11-SECURITY.md](./11-SECURITY.md#session-versioning-forced-logout).

**`resetTokenJti`** — the `jti` UUID of the last password reset token that was successfully consumed. A reset token is rejected if its `jti` matches this field, making reset links single-use. See [11-SECURITY.md](./11-SECURITY.md#single-use-enforcement).

## ManagedFamilyUnit

A delegation layer on top of the tree. Each unit has:

- A `parentA` (typically the male parent for couples; alphabetical fallback) and optional `parentB`
- An optional `representativeUser` who can edit/invite within the unit
- Per-capability flags (`canInviteUsers`, `canEditPeople`, `canManageContent`, `canViewAudit`)
- Affiliated Persons (via `unitAffiliationId` on Person)

Units are auto-created on couple creation (see `createRelationship` in `actions/people.ts`) and can be bulk-detected from existing data ("↻ Auto-crear desde parejas" in the admin núcleos tab).

## Content + Media

```prisma
model Content {
  id          String      @id @default(cuid())
  familyId    String
  personId    String              // owner — content is always attached to a Person
  type        ContentType         // STORY | RECIPE | DIARY | etc.
  title       String
  body        String?             // markdown / plain text
  occurredAt  DateTime?           // for DIARY / INTERVIEW dates
  visibility  Visibility @default(FAMILY)
  confidence  ConfidenceLevel?
  ingredients String?             // RECIPE only
  steps       String?             // RECIPE only
  notes       String?
  authorName  String?             // free-text "told by"
  lockedAt    DateTime?           // 10-day edit window — auto-set on first save
  createdById String

  media       ContentMedia[]
  createdBy   User @relation(fields: [createdById], references: [id])
}

model Media {
  id        String   @id @default(cuid())
  familyId  String
  personId  String?           // person photos (cover, gallery)
  storageKey String           // MinIO object key
  contentType String          // MIME type
  caption   String?
  isFeatured Boolean @default(false)
  createdAt DateTime @default(now())

  contents ContentMedia[]     // many-to-many with Content
}
```

**Content lock:** after 10 days, content rows become read-only via the `lockedAt` timestamp. Admins can override via direct DB edit; there's no UI unlock yet.

## Proposals

Two types — both follow the same pattern:

```prisma
model PersonUpdateProposal {
  id           String   @id @default(cuid())
  familyId     String
  personId     String           // who is being edited
  proposedById String           // who proposed
  fieldChanges Json             // { fieldName: { old, new } } map
  reason       String?
  status       ProposalStatus @default(PENDING)
  reviewedById String?
  reviewedAt   DateTime?
  rejectReason String?
}

model PersonCreationProposal {
  id              String   @id @default(cuid())
  familyId        String
  proposedById    String
  firstName       String
  // ... all the basic Person fields
  fatherId        String?           // proposed father (existing Person)
  motherId        String?
  reason          String?
  status          ProposalStatus @default(PENDING)
  reviewedById    String?
  reviewedAt      DateTime?
  rejectReason    String?
}
```

When approved:
- `PersonUpdateProposal` → applies the fieldChanges to the Person, sets `status=APPROVED`
- `PersonCreationProposal` → creates a new Person with the proposed data

Notifications fire on submit (admins see new proposal), approve, and reject.

## AuditLog

Append-only:

```prisma
model AuditLog {
  id         String   @id @default(cuid())
  familyId   String
  userId     String
  action     String          // free-form: "CREATE_PERSON", "UPDATE_PERSON", "CREATE_CONTENT", ...
  entityType String          // "Person" | "Content" | "Media" | ...
  entityId   String
  oldValue   Json?
  newValue   Json?
  createdAt  DateTime @default(now())
}
```

Every mutation should call `logAudit({...})` from `src/lib/audit.ts`. After writing the row, `logAudit` calls `fanOutNotificationsFromAudit()` fire-and-forget — that derives `Notification` rows based on `action` type:

| Action | Notification produced | Audience |
|--------|----------------------|----------|
| `CREATE_PERSON` | `NEW_PERSON_ADDED` | FAMILY+ADMIN scope (excluding actor) |
| `UPDATE_PERSON` | `PERSON_UPDATED` | Admins + reps only |
| `CREATE_CONTENT` | `NEW_CONTENT_ADDED` | FAMILY+ADMIN scope (excluding actor) |
| `*_PROPOSAL` | `PROPOSAL_*` | Admins (submit) or proposer (approve/reject) |

## Notifications

```prisma
model Notification {
  id         String   @id @default(cuid())
  userId     String           // recipient
  familyId   String
  type       NotificationType
  title      String
  body       String?
  href       String?           // e.g. /jacome/person/abc123
  read       Boolean  @default(false)
  createdAt  DateTime @default(now())
}
```

The `NotificationBell` component in the header polls `getMyUnreadCount()` every 30 seconds and shows a red badge with the count.

## Indexes

Most tables have only the implicit primary key index. Heavy-traffic indexes:

- `AccessRule.@@index([familyId, userId, permission])` — for permission lookup
- `AccessRule.@@index([familyId, targetPersonId, permission])` — for "who can see person X"
- `Relationship.@@unique([person1Id, person2Id, type])` — prevents duplicates

If you add new query patterns, add matching indexes. Common gotcha: large `findMany` queries on Person without an index on `familyId` are slow once the dataset grows.

## Schema change procedure

See [06-DEPLOYMENT.md](./06-DEPLOYMENT.md#applying-schema-changes) for the full procedure. TL;DR:

```bash
# 1. Edit prisma/schema.prisma locally
# 2. Commit + deploy code
# 3. SSH into TrueNAS and run prisma db push from a TEMP node container:
ssh root@192.168.100.58 'docker run --rm --network genome_genome_net \
  -v /mnt/vault/Tresure/Genome/prisma:/app/prisma \
  node:20-alpine sh -c "
    npm install -g prisma@7.8.0 &&
    npx prisma db push --schema /app/prisma/schema.prisma --url \"$DB_URL\"
  "'
```

Why a temp container? The runtime app container has Prisma CLI but not the `effect` module that `@prisma/config` requires for `prisma db push`. The temp container installs Prisma fresh and works.
