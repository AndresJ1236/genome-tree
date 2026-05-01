# ManagedFamilyUnit Block 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin UI and actions to create, inspect, and update managed family units, including representative assignment and a preview of managed people.

**Architecture:** Keep the block isolated inside the admin surface. The backend computes previews from the same pure visibility helpers already used by permissions, and the dashboard renders those server-derived unit summaries plus a create form and lightweight edit forms.

**Tech Stack:** Next.js App Router, Server Actions, Prisma, React client forms, existing runner/runtime verification scripts.

---

### Task 1: Extend admin dashboard data

**Files:**
- Modify: `LOCAL_REPO_PATH\src\lib\content-types.ts`
- Modify: `LOCAL_REPO_PATH\src\app\actions\admin.ts`

- [ ] Add managed-unit item types to the shared admin payload.
- [ ] Make `getAdminDashboard()` include existing managed units, candidate representatives, and computed previews.

### Task 2: Add admin actions for managed units

**Files:**
- Modify: `LOCAL_REPO_PATH\src\app\actions\admin.ts`
- Test: `LOCAL_REPO_PATH\tests\managed-family-unit.test.ts`

- [ ] Add a pure/unit-level test for shared-children managed-unit membership.
- [ ] Add `previewManagedFamilyUnit()`, `createManagedFamilyUnit()`, and `updateManagedFamilyUnit()`.
- [ ] Validate family ownership, representative membership inside the managed set, and audit logging.

### Task 3: Add admin UI

**Files:**
- Modify: `LOCAL_REPO_PATH\src\components\admin\AdminDashboard.tsx`

- [ ] Add a creation form for managed units.
- [ ] Add a preview action for unsaved units.
- [ ] Render current managed units with representative reassignment, capability toggles, and managed-people preview.

### Task 4: Verify and document

**Files:**
- Modify: `LOCAL_REPO_PATH\docs\estado-actual.md`
- Modify: `LOCAL_REPO_PATH\docs\fases.md`
- Modify: `LOCAL_REPO_PATH\docs\reconstruccion.md`

- [ ] Run `npx tsx tests/managed-family-unit.test.ts`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `.\scripts\start-runner.ps1`.
- [ ] Run `.\scripts\verify-runtime.ps1`.
- [ ] Confirm `/familia-demo/admin` renders and shows the managed-unit section.
- [ ] Update docs and create a new snapshot only if everything passes.
