# Database Schema

Genome Tree uses PostgreSQL via Prisma ORM. The schema is defined in `prisma/schema.prisma`.

---

## Table of Contents

1. [Enums](#enums)
2. [Family](#family)
3. [Person](#person)
4. [Relationship](#relationship)
5. [User](#user)
6. [ManagedFamilyUnit](#managedfamilyunit)
7. [AccessRule](#accessrule)
8. [FamilyConfig](#familyconfig)
9. [Content](#content)
10. [Media](#media)
11. [ContentMedia](#contentmedia)
12. [ImportantLink](#importantlink)
13. [PersonUpdateProposal](#personupdateproposal)
14. [Notification](#notification)
15. [AuditLog](#auditlog)
16. [Entity-relationship diagram](#entity-relationship-diagram)

---

## Enums

### `Gender`
`MALE` | `FEMALE` | `OTHER` | `UNKNOWN`

Used on `Person.gender`. Drives label inference in the UI ("Father"/"Mother", "Son"/"Daughter", "Owner").

### `PersonKind`
`PERSON` | `PET`

Determines how a record is displayed and which content modules are available. Pets have no spouse relationship, and their archive is limited to Stories and Objects.

### `RelationshipType`
`SPOUSE` | `PARTNER`

The `Relationship` table stores only explicit couple bonds — parent-child relationships are stored directly on `Person` via `fatherId`/`motherId`.

### `UserRole`
`ADMIN` | `MEMBER`

High-level role. ADMINs can approve proposals, manage users, and edit any record.

### `UserScope`
`ADMIN` | `FAMILY` | `BRANCH`

Controls what portion of the tree a user can see and edit. See [`docs/access-control.md`](access-control.md) for details.

### `ContentType`
`STORY` | `RECIPE` | `OBJECT` | `DIARY` | `INTERVIEW` | `SOURCE`

All content types share the `Content` table with type-specific nullable columns.

### `Visibility`
`BRANCH` | `FAMILY` | `ADMIN`

Controls who can see a content record. Enforced server-side — never rely on client-side hiding.

### `ConfidenceLevel`
`HIGH` | `MEDIUM` | `LOW`

Indicates the reliability of a story or important link:
- `HIGH` — official document, dated photo, registry record
- `MEDIUM` — direct testimony
- `LOW` — secondhand recollection or incomplete memory

### `AccessEffect`
`ALLOW` | `DENY`

Used by `AccessRule` to explicitly grant or revoke a specific permission for a user on a specific person.

### `AccessPermission`
`VIEW_PERSON` | `EDIT_PERSON` | `VIEW_MEDIA` | `VIEW_PRIVATE` | `VIEW_CONTENT`

Granular permissions that can be granted or denied per person per user via `AccessRule`.

### `ProposalStatus`
`PENDING` | `APPROVED` | `REJECTED`

Lifecycle state of a `PersonUpdateProposal`.

### `ClaimedRelation`
`SIBLING` | `HALF_SIBLING` | `UNCLE_AUNT` | `GREAT_UNCLE_AUNT` | `COUSIN` | `NEPHEW_NIECE` | `ANCESTOR` | `EXTENDED_FAMILY`

When a person's parents are unknown, they can be affiliated with a `ManagedFamilyUnit` and their claimed relationship to a key person recorded here.

### `NotificationType`
`PROPOSAL_SUBMITTED` | `PROPOSAL_APPROVED` | `PROPOSAL_REJECTED` | `NEW_PERSON_ADDED` | `NEW_CONTENT_ADDED`

---

## Family

Root tenant record. Every other record belongs to a `Family`.

| Column | Type | Description |
|--------|------|-------------|
| `id` | CUID | Primary key |
| `name` | String | Display name (e.g., "Familia Martínez") |
| `slug` | String (unique) | URL-safe identifier (e.g., `martinez`). Appears in every route: `/martinez/tree` |
| `createdAt` | DateTime | — |

---

## Person

A node in the family tree. Represents either a person (`nodeKind = PERSON`) or a pet (`nodeKind = PET`).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | CUID | — | Primary key |
| `familyId` | String | — | Tenant scope |
| `firstName` | String | — | — |
| `middleName` | String | Yes | — |
| `lastName` | String | — | Empty string allowed for pets |
| `birthSurname1` | String | Yes | First birth surname (maiden name etc.) |
| `birthSurname2` | String | Yes | Second birth surname |
| `birthDate` | DateTime | Yes | — |
| `deathDate` | DateTime | Yes | — |
| `birthPlace` | String | Yes | — |
| `gender` | Gender | — | Default: `UNKNOWN` |
| `nodeKind` | PersonKind | — | Default: `PERSON` |
| `bio` | String | Yes | Free-text biography |
| `coverPhoto` | String | Yes | URL of the cover photo |
| `fatherId` | String | Yes | Parent (biological father or pet owner) |
| `motherId` | String | Yes | Parent (biological mother) — not used for pets |
| `isCore` | Boolean | — | Default: `false`. Only ADMIN can edit core persons |
| `unitAffiliationId` | String | Yes | ID of a `ManagedFamilyUnit` this person is affiliated with |
| `claimedRelation` | ClaimedRelation | Yes | Their claimed relationship within the affiliated unit |
| `claimedRelationOfId` | String | Yes | The person they claim to be related to |
| `createdAt` | DateTime | — | — |
| `updatedAt` | DateTime | — | Auto-updated |

**Key design notes:**
- Parent-child relationships are encoded directly as `fatherId`/`motherId` — not in a separate join table. This simplifies tree traversal.
- Couple relationships (SPOUSE/PARTNER) are stored in the `Relationship` table.
- For pets, `fatherId` is used as the canonical owner field. `motherId` is unused.
- `isCore = true` protects a person from deletion and restricts editing to ADMIN users.

---

## Relationship

Explicit couple bonds. Parent-child links live on `Person` directly.

| Column | Type | Description |
|--------|------|-------------|
| `id` | CUID | — |
| `familyId` | String | Tenant scope |
| `person1Id` | String | — |
| `person2Id` | String | — |
| `type` | RelationshipType | `SPOUSE` or `PARTNER` |
| `endDate` | DateTime? | Optional end date (separation, death of spouse) |
| `createdAt` | DateTime | — |

Unique constraint: `(person1Id, person2Id, type)` — prevents duplicate relationships.

---

## User

An account that can log in to a family's space.

| Column | Type | Description |
|--------|------|-------------|
| `id` | CUID | — |
| `username` | String (unique) | Login credential |
| `passwordHash` | String | bcrypt hash |
| `name` | String | Display name |
| `familyId` | String | Which family this user belongs to |
| `personId` | String? (unique) | The `Person` record that represents this user in the tree |
| `role` | UserRole | `ADMIN` or `MEMBER` |
| `scope` | UserScope | `ADMIN`, `FAMILY`, or `BRANCH` |
| `branchRootId` | String? | For `BRANCH` scope: root person of their subtree |
| `createdAt` | DateTime | — |
| `updatedAt` | DateTime | — |

---

## ManagedFamilyUnit

An optional delegation layer that organizes the tree into nuclear family groups. A unit is centered on one or two parents and has a designated representative user.

| Column | Type | Description |
|--------|------|-------------|
| `id` | CUID | — |
| `familyId` | String | Tenant scope |
| `label` | String | Display name (e.g., "Familia Martínez-López") |
| `parentAId` | String | Primary parent of this unit |
| `parentBId` | String? | Secondary parent (optional) |
| `primarySurname` | String? | — |
| `secondarySurname` | String? | — |
| `representativeUserId` | String? | User who manages this unit |
| `canInviteUsers` | Boolean | Default: `true` |
| `canEditPeople` | Boolean | Default: `true` |
| `canManageContent` | Boolean | Default: `true` |
| `canViewAudit` | Boolean | Default: `true` |
| `createdAt` | DateTime | — |

---

## AccessRule

Per-person, per-user permission overrides. Allows granting or denying specific permissions that the user's role/scope wouldn't normally provide.

| Column | Type | Description |
|--------|------|-------------|
| `id` | CUID | — |
| `familyId` | String | Tenant scope |
| `userId` | String? | If null, applies to all users |
| `targetPersonId` | String | The person this rule applies to |
| `effect` | AccessEffect | `ALLOW` or `DENY` |
| `permission` | AccessPermission | Which permission to grant or revoke |
| `reason` | String? | Admin note explaining the rule |
| `createdAt` | DateTime | — |

Indexed on `(familyId, userId, permission)` and `(familyId, targetPersonId, permission)` for fast lookups.

---

## FamilyConfig

One record per family. Stores feature flags and limits.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `maxMediaPerPerson` | Int | 100 | Max photos per person |
| `maxFeaturedMedia` | Int | 9 | Max featured (highlighted) photos |
| `maxStories` | Int | 30 | Max stories per person |
| `maxStoryChars` | Int | 10000 | Max total characters across stories |
| `maxRecipeMedia` | Int | 3 | Max photos per recipe |
| `moduleStories` | Boolean | true | Enable Stories module |
| `moduleDiary` | Boolean | true | Enable Diary module |
| `moduleRecipes` | Boolean | true | Enable Recipes module |
| `moduleMedia` | Boolean | true | Enable Media/Photos module |
| `moduleObjects` | Boolean | true | Enable Objects module |
| `moduleLinks` | Boolean | true | Enable Important Links module |
| `moduleAudioVideo` | Boolean | false | Enable audio/video (not yet implemented) |
| `moduleExportImport` | Boolean | false | Enable full export/import |
| `moduleSearch` | Boolean | true | Enable full-text search |

---

## Content

All person-attached content in a single polymorphic table. The `type` field determines which columns are populated.

| Column | Type | Applicable to | Description |
|--------|------|--------------|-------------|
| `id` | CUID | all | — |
| `personId` | String | all | Owning person |
| `familyId` | String | all | Tenant scope |
| `type` | ContentType | all | Discriminator |
| `title` | String | all | — |
| `body` | Text | all | Main text content |
| `visibility` | Visibility | all | Default: `FAMILY` |
| `createdById` | String | all | Author user |
| `createdAt` | DateTime | all | — |
| `lockedAt` | DateTime | all | Set to `createdAt + 10 days`. After this date only ADMIN can edit. |
| `updatedAt` | DateTime | all | — |
| `source` | String | all | Optional reference |
| `confidence` | ConfidenceLevel | STORY, SOURCE | Reliability indicator |
| `approximateDate` | String | STORY | Free-text date ("Summer 1960") |
| `authorName` | String | STORY | Name of the person who told/wrote the story |
| `ingredients` | Json | RECIPE | Array of ingredient strings |
| `steps` | Json | RECIPE | Array of step strings |
| `notes` | Text | RECIPE | Additional notes |
| `entryDate` | DateTime | DIARY | Journal entry date |
| `question` | Text | INTERVIEW | The question asked |

---

## Media

A file stored in MinIO.

| Column | Type | Description |
|--------|------|-------------|
| `id` | CUID | — |
| `personId` | String | Person this photo belongs to |
| `familyId` | String | Tenant scope |
| `url` | String | Full public URL (via `MINIO_PUBLIC_URL`) |
| `key` | String | MinIO object key |
| `mimeType` | String | e.g., `image/jpeg` |
| `alt` | String? | Accessibility text |
| `caption` | String? | Display caption |
| `featured` | Boolean | Whether this photo is in the featured gallery |
| `order` | Int | Display order within featured gallery |
| `uploadedById` | String | User who uploaded |
| `createdAt` | DateTime | — |

---

## ContentMedia

Pivot table linking content records to their attached media files.

| Column | Type |
|--------|------|
| `contentId` | String |
| `mediaId` | String |
| `order` | Int (default 0) |

Composite PK: `(contentId, mediaId)`.

---

## ImportantLink

A named relationship to another person in the tree or to an external figure (not in the tree).

| Column | Type | Description |
|--------|------|-------------|
| `id` | CUID | — |
| `personId` | String | Person who has this link |
| `familyId` | String | Tenant scope |
| `relatedPersonId` | String? | Target person in the tree (nullable if external) |
| `externalName` | String? | Name of external figure (if not in tree) |
| `label` | String | Description of the relationship |
| `notes` | Text? | — |
| `source` | String? | — |
| `confidence` | ConfidenceLevel? | — |
| `visibility` | Visibility | Default: `FAMILY` |
| `createdById` | String | — |
| `lockedAt` | DateTime | `createdAt + 10 days` |
| `createdAt` | DateTime | — |
| `updatedAt` | DateTime | — |

---

## PersonUpdateProposal

A proposed change to a person's fields, submitted by a non-admin user and pending admin review.

| Column | Type | Description |
|--------|------|-------------|
| `id` | CUID | — |
| `familyId` | String | — |
| `personId` | String | Person to be changed |
| `proposedById` | String | User who submitted |
| `status` | ProposalStatus | `PENDING` → `APPROVED` or `REJECTED` |
| `reviewedById` | String? | Admin who reviewed |
| `reviewedAt` | DateTime? | — |
| `rejectionReason` | String? | Reason if rejected |
| `firstName` | String? | Proposed new value (null = no change) |
| `middleName` | String? | — |
| `lastName` | String? | — |
| `gender` | Gender? | — |
| `birthDate` | DateTime? | — |
| `deathDate` | DateTime? | — |
| `birthPlace` | String? | — |
| `bio` | String? | — |
| `currentValues` | Json | Snapshot of the person's values at submission time |
| `createdAt` | DateTime | — |

---

## Notification

In-app notification for a user.

| Column | Type | Description |
|--------|------|-------------|
| `id` | CUID | — |
| `userId` | String | Recipient |
| `familyId` | String | — |
| `type` | NotificationType | — |
| `title` | String | Short title shown in the bell dropdown |
| `body` | String? | Optional longer description |
| `href` | String? | Link to the relevant page |
| `read` | Boolean | Default: `false` |
| `createdAt` | DateTime | — |

Cascades on user/family delete.

---

## AuditLog

Immutable record of every significant change.

| Column | Type | Description |
|--------|------|-------------|
| `id` | CUID | — |
| `familyId` | String | — |
| `userId` | String | Who made the change |
| `action` | String | e.g., `CREATE_PERSON`, `EDIT_PERSON`, `UPLOAD_MEDIA` |
| `entityType` | String | e.g., `Person`, `Content`, `Media` |
| `entityId` | String | ID of the affected record |
| `oldValue` | Json? | Previous state (partial) |
| `newValue` | Json? | New state (partial) |
| `createdAt` | DateTime | — |

---

## Entity-relationship diagram

```
Family
  ├── Person (fatherId → Person, motherId → Person)
  │     ├── Relationship ↔ Person   (SPOUSE/PARTNER)
  │     ├── Content
  │     │     └── ContentMedia → Media
  │     ├── Media
  │     └── ImportantLink → Person? (relatedPerson)
  ├── User
  │     ├── Content (createdBy)
  │     ├── ImportantLink (createdBy)
  │     ├── AuditLog
  │     ├── PersonUpdateProposal (proposedBy / reviewedBy)
  │     └── Notification
  ├── ManagedFamilyUnit
  │     ├── Person (parentA, parentB)
  │     ├── User (representative)
  │     └── Person[] (affiliatedPersons)
  ├── AccessRule → Person + User
  ├── FamilyConfig (1:1)
  └── AuditLog
```
