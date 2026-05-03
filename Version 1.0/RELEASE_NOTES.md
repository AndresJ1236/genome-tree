# Genome Tree v1.0.0 — Release Notes

**Release date:** 2026-05-02

---

## Overview

Genome Tree v1.0 is the first stable release. It ships a complete, self-hosted family tree application: interactive canvas, biographical profiles, a rich content archive, multi-user collaboration, and a full Docker deployment stack.

This release targets families who want to preserve their history privately, on their own infrastructure, with tools designed for real multi-generational use.

---

## Highlights

### Interactive family tree

The canvas uses a custom layout engine (no third-party graph library) that places people by generation, groups couples together, and resolves overlaps automatically. Branches are drawn as SVG Bézier curves that animate in on first render. Pan and zoom with mouse or touch. The viewport is virtualized — only visible nodes are rendered, so trees with 80+ people stay fast.

**Pet nodes** are a first-class feature: pets appear as small satellite nodes orbiting their owner at a fixed radius, connected by a dashed tether line, and excluded from the generation grid entirely.

### Content archive

Every person in the tree has a personal archive with seven content types: Stories, Recipes, Diary, Interviews, Objects, Sources, and Important Links. Each item has configurable visibility (BRANCH, FAMILY, or ADMIN only) and locks after 10 days so history stays intact.

### Collaboration model

Three scopes control what each user can see and edit:

- **ADMIN scope** — full access, approves change proposals, manages users
- **FAMILY scope** — can see and edit the whole tree; proposals go through admin
- **BRANCH scope** — sees only their subtree (plus up to 3 degrees of blood relations); can edit only within their branch

Non-admin users propose edits via the change proposal system; admins review and approve or reject with a reason. Admins invite new users by email with a one-time link.

### Administration

Admins can enable or disable content modules per family (e.g., disable Recipes if the family doesn't want them). Configurable limits control max photos per person, max featured photos, max stories, and more. A full audit log records every significant change with user, timestamp, old value, and new value.

### Managed Family Units

An optional delegation layer that organizes the tree into nuclear family units. Each unit has a representative user who can invite members and manage content within that unit. Useful for large trees where one admin can't oversee everything.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Runtime | React 19 |
| Styling | Tailwind CSS v4 |
| ORM | Prisma 7 |
| Database | PostgreSQL 16+ |
| Auth | `jose` stateless JWT |
| Storage | MinIO (S3-compatible) |
| Container | Docker + Nginx + Cloudflare Tunnel |

---

## Known limitations

- Audio/video content module is present in the schema but disabled by default — the upload pipeline is not yet implemented.
- Export/import JSON works for relations; full archive export (including media) is not yet implemented.
- No email delivery — invitation links are generated in the admin panel and must be copied manually.
- No mobile-native layout; the tree canvas works on tablet/desktop. Profile and content pages are responsive.

---

## Upgrading

This is the initial release — no upgrade path from a previous version.

For first-time setup, see [`docs/deployment.md`](../../docs/deployment.md).
