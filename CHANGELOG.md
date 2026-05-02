# Changelog

All notable changes to Genome Tree are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [1.0.0] — 2026-05-02

First public release of Genome Tree.

### Added

**Tree canvas**
- Interactive pan/zoom canvas with SVG organic branches (cubic Bézier curves)
- Custom layout algorithm: generation-based BFS, couple grouping, overlap separation
- Viewport virtualization — only renders nodes visible in the current viewport (threshold: 80 nodes)
- Pet nodes orbit their owner at a fixed radius with a dashed tether line
- Animated branch growth on first render (`pathLength` + `strokeDashoffset`)
- Escape key closes the side panel

**People & pets**
- Full biographical data: names (first, middle, last, birth surnames), birth/death dates, birthplace, gender, bio
- `nodeKind: PERSON | PET` — pet profiles share the same model with simplified UI (no spouse, no recipes/diary/interviews)
- `isCore` flag protects founding ancestors from accidental deletion
- Cover photo and featured photo gallery (up to 9 highlighted)
- Smart relationship labels inferred from gender: Father/Mother, Son/Daughter, Owner

**Content archive**
- Stories — freeform narratives with author, approximate date, confidence level (HIGH/MEDIUM/LOW), source
- Recipes — ingredients, steps, notes, up to 3 photos
- Diary — private journal entries by date
- Interviews — Q&A format conversations
- Objects — heirlooms and artifacts with photos
- Sources — documentary references and footnotes
- Important Links — named relationships to other people in the tree or external figures

**Collaboration**
- Role system: `ADMIN` / `MEMBER` with three scopes: `ADMIN`, `FAMILY`, `BRANCH`
- Managed Family Units — delegate nuclear families with a representative user and per-unit permissions
- Change proposals — non-admin users propose edits; admins approve or reject with a reason
- In-app notification bell for proposals, new content, and new people
- Invitation system — admins invite users by email with a one-time link

**Administration**
- Full audit log: who changed what and when
- Configurable modules per family (enable/disable stories, diary, recipes, search, etc.)
- Per-person access rules (ALLOW/DENY for VIEW_PERSON, EDIT_PERSON, VIEW_MEDIA, VIEW_PRIVATE, VIEW_CONTENT)
- Relations import/export (JSON)
- User management: roles, scopes, branch roots

**Search & UI**
- Full-text search across people and content (scope-aware — only returns what the user can see)
- First-use onboarding overlay
- Help tooltips throughout the interface
- Contextual help panel from the header

**Infrastructure**
- Docker Compose stack: Next.js app + PostgreSQL + MinIO + Nginx + Cloudflare Tunnel
- Auto-migration on container startup via `entrypoint.sh`
- Next.js standalone output for minimal image size
- Stateless JWT sessions with `jose` (7-day expiry, httpOnly cookie)
- S3-compatible media storage via MinIO

---

[1.0.0]: https://github.com/your-org/genome-tree/releases/tag/v1.0.0
