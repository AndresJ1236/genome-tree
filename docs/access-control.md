# Access Control

Genome Tree has a two-axis permission model: **role** (what you can do) and **scope** (what you can see).

---

## Table of Contents

1. [Roles](#roles)
2. [Scopes](#scopes)
3. [Role × Scope matrix](#role--scope-matrix)
4. [Scope: BRANCH visibility rules](#scope-branch-visibility-rules)
5. [isCore protection](#iscore-protection)
6. [Content visibility](#content-visibility)
7. [Access rules (per-person overrides)](#access-rules-per-person-overrides)
8. [Content lock (10-day rule)](#content-lock-10-day-rule)
9. [Change proposals](#change-proposals)
10. [Managed Family Units](#managed-family-units)

---

## Roles

| Role | Description |
|------|-------------|
| `ADMIN` | Full control over the family space. Can approve proposals, manage users, edit any record including `isCore` persons, and override the content lock. |
| `MEMBER` | Regular family member. What they can see and edit is controlled by their scope. |

---

## Scopes

| Scope | Who | What they can see |
|-------|-----|------------------|
| `ADMIN` | Family administrator | Everything |
| `FAMILY` | Full family member | The entire tree and all non-private content |
| `BRANCH` | Branch family member | Their own subtree plus up to 3 degrees of blood relations |

A user's `role` and `scope` are set independently. Common combinations:

| Role | Scope | Typical use |
|------|-------|-------------|
| ADMIN | ADMIN | Family administrator |
| MEMBER | FAMILY | Spouse, sibling, in-law who should see everything |
| MEMBER | BRANCH | A family branch with limited visibility |

---

## Role × Scope matrix

| Action | ADMIN+ADMIN | MEMBER+FAMILY | MEMBER+BRANCH |
|--------|-------------|---------------|---------------|
| View all people | ✓ | ✓ | Subtree + blood≤3 only |
| Edit any person | ✓ | ✓ (non-isCore) | Subtree only |
| Edit `isCore` person | ✓ | ✗ | ✗ |
| Delete person | ✓ (non-isCore) | ✗ | ✗ |
| Add person | ✓ | ✓ | Within subtree only |
| View content | ✓ | By visibility | By visibility + scope |
| Create content | ✓ | ✓ | Within subtree only |
| Edit own content | ✓ | Within lock | Within lock + subtree |
| Edit others' content | ✓ | ✗ | ✗ |
| Approve proposals | ✓ | ✗ | ✗ |
| Manage users | ✓ | ✗ | ✗ |
| View audit log | ✓ | ✗ | ✗ |
| Configure modules | ✓ | ✗ | ✗ |

---

## Scope: BRANCH visibility rules

A BRANCH user's visible set includes:

1. **Their subtree** — all descendants of their `branchRootId`, recursively, with no depth limit.
2. **Blood context up to distance 3** — persons reachable from `branchRootId` by walking parent-child edges (in any direction) in at most 3 steps:
   - Distance 1: parents, children
   - Distance 2: grandparents, siblings, grandchildren
   - Distance 3: great-grandparents, uncles/aunts, nephews/nieces, great-grandchildren

**Not visible:** cousins, second-degree cousins, or any chain longer than 3 hops from the branch root.

**Connector nodes:** if showing a partial tree would create a visual gap, minimal connector nodes (name and initials only) may be shown to preserve tree readability. These are read-only.

**Editing:** BRANCH users can edit only persons within their own subtree. Persons visible via blood context (outside the subtree) are read-only.

---

## isCore protection

`isCore = true` marks a person as a protected ancestor.

- Only ADMIN users can set or clear `isCore`.
- Only ADMIN users can edit a person where `isCore = true`.
- BRANCH and FAMILY users cannot edit or delete `isCore` persons.
- `isCore` persons cannot be deleted by anyone except ADMIN.
- The flag is designed to protect the founding ancestors of the tree who serve as the root of all branches.

---

## Content visibility

Every content record (`Content`, `ImportantLink`, `Media`) has a `visibility` field:

| Value | Who can see it |
|-------|---------------|
| `FAMILY` | All authenticated users of the family (default) |
| `BRANCH` | Only users whose scope grants access to the owning person's subtree |
| `ADMIN` | Only ADMIN users |

**Enforcement is server-side.** The backend filters content before returning it. Client-side hiding is never relied upon for security.

---

## Access rules (per-person overrides)

Admins can create `AccessRule` records to grant or deny specific permissions for a specific user on a specific person. This allows fine-grained exceptions to the default role/scope logic.

Each rule has:
- `userId` — the user it applies to (null = applies to all users of the family)
- `targetPersonId` — the person it applies to
- `effect` — `ALLOW` or `DENY`
- `permission` — one of:

| Permission | Controls |
|------------|---------|
| `VIEW_PERSON` | Can the user see this person in the tree at all |
| `EDIT_PERSON` | Can the user edit this person's fields |
| `VIEW_MEDIA` | Can the user see this person's photos |
| `VIEW_PRIVATE` | Can the user see private (ADMIN-visibility) content |
| `VIEW_CONTENT` | Can the user see this person's content archive |

Rules are evaluated after role/scope checks. A DENY rule overrides the user's normal access; an ALLOW rule grants access beyond what the scope would normally permit.

---

## Content lock (10-day rule)

Every `Content` and `ImportantLink` record has a `lockedAt` timestamp set to `createdAt + 10 days`.

After `lockedAt` has passed:
- The record is read-only for all non-ADMIN users, including the author.
- Only ADMIN users can edit locked content.

This preserves the integrity of historical records. A diary entry written 2 years ago shouldn't be silently corrected by a family member.

The lock is enforced in Server Actions, not in the UI. Client-side "edit" buttons may be hidden for locked records, but the server always re-checks.

---

## Change proposals

Non-admin users who want to correct a person's biographical data (name, birth date, etc.) cannot edit directly. Instead they submit a **change proposal**.

**Flow:**
1. MEMBER user opens a person's profile and clicks "Proponer cambio".
2. They fill in the fields they want to change and submit.
3. A `PersonUpdateProposal` is created with `status = PENDING`.
4. ADMIN users receive a notification.
5. The admin reviews the proposal — seeing the current values and proposed values side-by-side.
6. The admin approves (changes are applied) or rejects (with an optional reason).
7. The proposing user receives a notification with the outcome.

**Who can propose:** any authenticated user for any person they can view.

**Who can approve:** only ADMIN users.

**Notes:**
- Proposals cover only biographical fields (name, dates, birthplace, gender, bio). They do not cover parent relationships, photos, or content.
- A rejected proposal includes an optional reason shown to the proposing user.
- Multiple proposals for the same person can be pending simultaneously.

---

## Managed Family Units

Managed Family Units are an optional delegation mechanism. An admin can define a nuclear family unit (parentA + optional parentB) and assign a representative user. The representative can invite new users and manage content within their unit, according to the permissions configured on the unit:

| Permission flag | Default | Controls |
|-----------------|---------|---------|
| `canInviteUsers` | true | Representative can generate invitation links |
| `canEditPeople` | true | Representative can edit persons in their subtree |
| `canManageContent` | true | Representative can create/edit content |
| `canViewAudit` | true | Representative can view the audit log for their unit |

Unit permissions never exceed the representative user's role/scope. They can only delegate what the representative already has.
