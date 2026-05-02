# Local Development

This guide walks through setting up Genome Tree for local development.

---

## Prerequisites

| Tool | Minimum version | Notes |
|------|----------------|-------|
| Node.js | 20 | LTS recommended |
| PostgreSQL | 16 | Running locally or via Docker |
| MinIO | any | Optional — see below |
| Git | any | — |

### Quick PostgreSQL setup with Docker

If you don't have PostgreSQL installed locally:

```bash
docker run -d \
  --name genome-pg \
  -e POSTGRES_USER=genome_tree \
  -e POSTGRES_PASSWORD=devpassword \
  -e POSTGRES_DB=genome_tree \
  -p 5432:5432 \
  postgres:16-alpine
```

### Quick MinIO setup with Docker

Media uploads require MinIO (or any S3-compatible storage). For local dev:

```bash
docker run -d \
  --name genome-minio \
  -p 9000:9000 \
  -p 9001:9001 \
  -e MINIO_ROOT_USER=admin \
  -e MINIO_ROOT_PASSWORD=devpassword \
  minio/minio server /data --console-address ":9001"
```

The MinIO console will be at `http://localhost:9001`. Create a bucket named `genome-tree` there before running the app.

If you skip MinIO, photo uploads will fail but the rest of the app works fine.

---

## Setup

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

Edit `.env`. The minimum required values for local development:

```bash
DATABASE_URL="postgresql://genome_tree:devpassword@localhost:5432/genome_tree"
SESSION_SECRET="any_random_string_at_least_32_chars"

# MinIO (only needed for photo uploads)
MINIO_ENDPOINT="localhost"
MINIO_PORT="9000"
MINIO_BUCKET="genome-tree"
MINIO_ROOT_USER="admin"
MINIO_ROOT_PASSWORD="devpassword"
MINIO_PUBLIC_URL=""   # empty = use http://localhost:9000 directly
```

See [`docs/configuration.md`](configuration.md) for all variables.

### 3. Push schema

```bash
npx prisma db push
```

This creates all tables in the database. No migration files are used — Prisma pushes the schema directly.

### 4. Seed demo data

```bash
npx prisma db seed
```

Creates "Familia Demo" with 13 people across 3 generations. Admin user: `admin` / `admin123`.

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You will be redirected to the login page.

---

## Common commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production (also type-checks) |
| `npm run lint` | Run ESLint |
| `npx prisma studio` | Open Prisma Studio (visual DB browser) |
| `npx prisma db push` | Push schema changes to the DB |
| `npx prisma db seed` | Re-run seed (safe to run multiple times — checks for existing data) |
| `npx prisma generate` | Regenerate Prisma client after schema changes |

---

## Project structure highlights

```
src/
├── app/
│   ├── actions/           # Server Actions — one file per domain
│   │   ├── auth.ts        # login(), logout(), inviteUser()
│   │   ├── people.ts      # createPerson(), updatePerson(), deletePerson()
│   │   ├── content.ts     # CRUD for all content types
│   │   ├── media.ts       # setFeatured(), deletePicture()
│   │   ├── proposals.ts   # submitProposal(), approveProposal()
│   │   └── ...
│   ├── api/
│   │   ├── upload/        # POST /api/upload — streams to MinIO
│   │   └── export/        # GET /api/export/relations
│   └── (protected)/
│       └── [familySlug]/
│           ├── tree/      # Main tree page
│           ├── person/    # Profile, edit, content CRUD
│           ├── admin/     # Admin panel
│           └── settings/  # User settings, proposals history
├── components/
│   ├── tree/
│   │   ├── FamilyTree.tsx    # Canvas: pan/zoom, virtualization
│   │   ├── FamilyEdges.tsx   # SVG branches and pet tethers
│   │   └── PersonNode.tsx    # Individual node (circle + name)
│   ├── profile/
│   │   └── PersonPage.tsx    # Full person profile with tabs
│   ├── forms/
│   │   └── PersonEditor.tsx  # Create/edit person or pet
│   └── ui/                  # Shared UI components
└── lib/
    ├── tree-layout.ts        # Layout algorithm
    ├── tree-types.ts         # Layout TypeScript types
    ├── session.ts            # JWT session management
    ├── prisma.ts             # PrismaClient singleton
    ├── content-types.ts      # Shared content TypeScript types
    └── family-config.ts      # Module feature flags
```

---

## Working with the database

### Prisma v7 — key differences

The datasource URL is **not** in `schema.prisma`. It lives in `prisma.config.ts`:

```typescript
// prisma.config.ts
import { defineConfig } from 'prisma/config'
import 'dotenv/config'

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL!,
  },
})
```

When you add a new field to the schema:
1. Edit `prisma/schema.prisma`
2. Run `npx prisma db push` (pushes the change directly — no migration file)
3. Run `npx prisma generate` to update the TypeScript client (or let it auto-generate on next `db push`)

### Viewing data

```bash
npx prisma studio
```

Opens a visual browser at `http://localhost:5555` where you can inspect and edit all tables.

---

## Environment notes

### Session secret

Any string works in development. For production, use `openssl rand -base64 32`.

### Media without MinIO

If you leave `MINIO_ENDPOINT` unconfigured or MinIO is not running, photo uploads will throw an error but the rest of the application works normally. You can develop all non-media features without MinIO.

### TypeScript

The project uses TypeScript strict mode. Run `npm run build` (not just `npm run dev`) to catch all type errors — the dev server is more lenient.
