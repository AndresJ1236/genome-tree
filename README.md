# Genome Tree

> A self-hosted family tree application built for real families — multi-tenant, private by design, rich in content.

Genome Tree lets families build and explore their genealogy together. Each family gets its own private space, complete with a visual interactive tree, biographical profiles, stories, recipes, photos, diaries, and more.

---

## Features

### Tree & Relationships
- **Interactive canvas** — pan, zoom, and navigate a dynamically laid-out family tree
- **Automatic layout** — custom algorithm places people by generation, groups couples, resolves overlaps
- **Pet nodes** — pets appear as small satellite nodes orbiting their owner
- **Smart labels** — "Father", "Mother", "Son", "Daughter" inferred automatically from gender
- **Viewport virtualization** — trees with 80+ people only render visible nodes

### People & Profiles
- Full biographical data: names, birth/death dates, birthplace, gender, bio
- Cover photo and featured photo gallery (up to 9 highlighted)
- `isCore` flag protects founding ancestors from accidental deletion
- Pet profiles with simplified fields (name, owner, dates, bio)

### Content Archive
Each person has a personal archive with:
| Module | Description |
|--------|-------------|
| **Stories** | Freeform narratives with author, date, confidence level |
| **Recipes** | Ingredients, steps, notes, and photos |
| **Diary** | Private journal entries by date |
| **Interviews** | Q&A format — preserve conversations |
| **Objects** | Heirlooms and artifacts with photos |
| **Sources** | Documentary references and footnotes |
| **Important Links** | Named relationships to other people or external figures |

### Collaboration
- **Role system** — `ADMIN`, `FAMILY`, `BRANCH` scopes control what each user can see and edit
- **Managed Family Units** — organize the tree into delegated nuclear families with a representative user
- **Change proposals** — non-admin users propose edits; admins approve or reject with a reason
- **Notifications** — in-app alerts for proposals, new content, and new people
- **Invitation system** — admins invite users by email with a one-time link

### Administration
- Full audit log (who changed what and when)
- Configurable modules per family (enable/disable recipes, diary, search, etc.)
- Access rules (per-person ALLOW/DENY for specific permissions)
- Relations import/export (JSON)
- User management (roles, scopes, branch roots)

### Other
- **Search** — full-text across people and content
- **First-use onboarding** overlay
- **Help tooltips** throughout the interface
- **Contextual help panel** from the header
- **Escape key** closes the side panel

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.2.4 |
| Runtime | React | 19.2.4 |
| Styling | Tailwind CSS v4 | — |
| ORM | Prisma | 7.8.0 |
| DB driver | `@prisma/adapter-pg` + `pg` | — |
| Database | PostgreSQL | 16+ |
| Auth | `jose` (stateless JWT) | 6.x |
| Storage | MinIO (S3-compatible) | — |
| Container | Docker + Nginx | — |
| Language | TypeScript | 5.x |

> **Note on Next.js 16:** this version contains breaking changes vs. 14/15. `middleware.ts` → `proxy.ts` with a named export. `params` in pages is now `Promise<…>` and must be awaited. See [`AGENTS.md`](AGENTS.md) for details.

---

## Screenshots

> _Screenshots coming soon._

---

## Quick Start — Local Development

### Prerequisites
- Node.js 20+
- PostgreSQL 16+ running locally
- A MinIO instance (or any S3-compatible storage) for media uploads

### 1. Clone and install

```bash
git clone https://github.com/your-org/genome-tree.git
cd genome-tree
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` — see [`docs/configuration.md`](docs/configuration.md) for all variables.

### 3. Push schema and seed

```bash
npx prisma db push
npx prisma db seed
```

The seed creates a demo family ("Familia Demo") with 13 people across 3 generations, plus one admin user: `admin` / `admin123`.

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You will be redirected to the login page.

---

## Docker Deployment

See the full guide at [`docs/deployment.md`](docs/deployment.md).

**Quick version:**

```bash
cp .env.production .env          # set your real secrets
docker compose up -d --build
```

The `docker/entrypoint.sh` runs `prisma db push` automatically on every startup to apply schema changes before the server starts.

---

## Project Structure

```
genome-tree/
├── prisma/
│   ├── schema.prisma          # Full data model
│   └── seed.ts                # Demo data — 13 people, 3 generations
├── prisma.config.ts           # Prisma v7 datasource config
├── src/
│   ├── app/
│   │   ├── actions/           # Server Actions (auth, people, content, media, proposals…)
│   │   ├── api/               # API routes (search, media upload, relations export)
│   │   ├── (protected)/       # All authenticated pages
│   │   │   ├── layout.tsx     # App shell: header, nav, notifications
│   │   │   └── [familySlug]/
│   │   │       ├── tree/      # Main tree view
│   │   │       ├── person/    # Person profile, edit, content CRUD
│   │   │       ├── admin/     # Administration panel
│   │   │       └── settings/  # User settings and proposals history
│   │   └── login/, setup/
│   ├── components/
│   │   ├── tree/              # FamilyTree, FamilyEdges, PersonNode, PersonPanel
│   │   ├── profile/           # PersonPage (full profile)
│   │   ├── forms/             # PersonEditor, ContentEditor, InviteForm…
│   │   └── ui/                # HelpTooltip, HelpPanel, NotificationBell…
│   └── lib/
│       ├── tree-layout.ts     # Custom tree layout algorithm
│       ├── tree-types.ts      # Layout types (PersonData, LayoutNode, FamilyUnit, PetLink…)
│       ├── content-types.ts   # Shared TypeScript types for all content
│       ├── session.ts         # JWT session management
│       ├── prisma.ts          # PrismaClient singleton
│       ├── person-name.ts     # Display name formatting
│       └── family-config.ts   # Module feature flags
├── docker/
│   └── entrypoint.sh          # Auto-migration + server start
├── docker-compose.yml         # App + PostgreSQL + MinIO + Nginx + Cloudflare tunnel
├── nginx/                     # Nginx config
├── docs/                      # Technical documentation
├── Final/                     # Release archives
└── Beta/                      # Previous development scripts
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [`docs/architecture.md`](docs/architecture.md) | System design, key decisions, layout algorithm |
| [`docs/database-schema.md`](docs/database-schema.md) | Full data model with field-level explanations |
| [`docs/deployment.md`](docs/deployment.md) | Docker, Nginx, Cloudflare Tunnel setup |
| [`docs/development.md`](docs/development.md) | Local dev setup, tooling, test runner |
| [`docs/configuration.md`](docs/configuration.md) | All environment variables |
| [`docs/access-control.md`](docs/access-control.md) | Role and permission system |

---

## Contributing

We welcome contributions! Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull request.

---

## License

[Source Available](LICENSE) — free for personal, educational, and non-commercial use. For commercial distribution or paid hosting, contact via GitHub: [AndresJ1236](https://github.com/AndresJ1236).
