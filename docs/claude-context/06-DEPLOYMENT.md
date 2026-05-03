# 06 — Deployment

> **Sensitive details (server IP, SSH key path, exact host commands) live in the user's local `DEPLOY.md`, which is gitignored. This file describes the procedure WITHOUT those details — substitute placeholders with what the user provides during the session.**

## Production target

| | |
|---|---|
| Host OS | TrueNAS SCALE (Electric Eel 24.10+) |
| Hostname | `<TRUENAS_HOST>` (private LAN, not a public DNS name) |
| Public URL | `https://arbol.example.com` |
| Public exposure | Cloudflare Tunnel (no port forwarding) |
| Deploy path on host | `NAS_DEPLOY_PATH` (vault is a symlink to `NAS_PATH`) |
| File transfer | SMB share `\\<TRUENAS_HOST>\Tresure\Genome\` accessible from Windows |
| SSH user | `root` |
| SSH key | `<USER_LOCAL_PATH>\.ssh\SSH_KEY` (passphrase-less, on the dev machine only) |

## Stack: 5 services in `docker-compose.yml`

| Service | Image | Role |
|---------|-------|------|
| `db` | postgres:16-alpine | PostgreSQL data store |
| `minio` | minio/minio | Object storage for photos |
| `app` | built locally from `Dockerfile` | Next.js standalone server |
| `nginx` | nginx:alpine | Reverse proxy: `/media/*` → MinIO, everything else → app |
| `cloudflared` | cloudflare/cloudflared | Tunnel client; receives traffic from Cloudflare edge |

All services share the `genome_genome_net` Docker network.

## Standard deploy procedure (code-only changes)

For changes that DO NOT modify `prisma/schema.prisma`:

### 1. Edit code locally on Windows

Make changes in the source tree at `LOCAL_REPO_PATH`.

### 2. Commit (don't push yet if you want to test first)

```powershell
git add <files>
git commit -m "<message>"
```

### 3. Sync to the NAS via SMB

```powershell
robocopy "LOCAL_REPO_PATH" `
         "\\<TRUENAS_HOST>\Tresure\Genome" `
         /MIR /XD node_modules .next .git Final /XF .env *.log
```

`/MIR` mirrors (will delete files on the NAS that don't exist locally — use carefully). `/XD` excludes directories. `/XF` excludes files. **Always exclude `.env*`** so production secrets aren't overwritten.

For a single file:

```powershell
robocopy "LOCAL_REPO_PATH\src\lib" `
         "\\<TRUENAS_HOST>\Tresure\Genome\src\lib" tree-layout.ts
```

### 4. Rebuild the app container on the NAS

```bash
ssh -i <SSH_KEY_PATH> root@<TRUENAS_HOST> \
  "cd NAS_DEPLOY_PATH && docker compose up -d --build"
```

The build takes 1–2 minutes (cache hits make it faster on small changes). The `--build` flag rebuilds the image; `up -d` recreates affected containers in detached mode.

### 5. Verify

```bash
ssh -i <SSH_KEY_PATH> root@<TRUENAS_HOST> "docker logs genome-app-1 --tail 10"
```

Look for `✓ Ready in 0ms` from Next.js. The known harmless `Cannot find module 'effect'` line above it is the entrypoint trying to run `prisma db push` — that fails by design here (see schema-change procedure below).

### 6. Browser test

Hard refresh (`Ctrl+Shift+R`) on `https://arbol.example.com`. Cloudflare aggressively caches the JS bundle.

### 7. Push to GitHub (optional but recommended)

```powershell
git push origin main
```

## Applying schema changes

For changes that DO modify `prisma/schema.prisma`:

After steps 1–4 above, run `prisma db push` against the production database from a temporary `node:20-alpine` container:

```bash
ssh -i <SSH_KEY_PATH> root@<TRUENAS_HOST> \
  'DB_URL=$(grep DATABASE_URL NAS_DEPLOY_PATH/.env.production | cut -d= -f2- | tr -d "\"")
   docker run --rm --network genome_genome_net \
     -v NAS_DEPLOY_PATH/prisma:/app/prisma \
     -e DB_URL="$DB_URL" \
     node:20-alpine sh -c "
       npm install -g prisma@7.8.0 2>&1 | tail -1 &&
       npx prisma db push --schema /app/prisma/schema.prisma --url \"\$DB_URL\" 2>&1 | tail -10
     "'
```

**Why a temp container?** The runtime app container has the Prisma CLI but is missing the `effect` Node module that `@prisma/config` requires for `prisma db push`. The temp container installs Prisma fresh and works.

**Notes:**
- `prisma db push` is non-destructive for additive changes (new fields, new enum values, new tables)
- For column drops or destructive renames, use `prisma migrate` workflow instead — but those are rare
- Always read the output. If Prisma says "schema is already in sync", the change was already applied

## Configuring Cloudflare Tunnel (one-time setup)

Already done in production. If reproducing on a new host:

1. Cloudflare Zero Trust → Networks → Tunnels → Create new tunnel
2. Save the token in `.env.production` as `CLOUDFLARE_TUNNEL_TOKEN`
3. Public Hostnames tab → Add hostname:
   - Subdomain: `arbol`
   - Domain: `example.com`
   - Service: `http://nginx:80` ← service name, not localhost!

The tunnel runs in the `cloudflared` Docker container and connects to the nginx service over the internal Docker network.

## Common errors and fixes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Permission denied` on `entrypoint.sh` after build | Windows line endings | Already handled in Dockerfile: `RUN sed -i 's/\r//' /entrypoint.sh && chmod 755 /entrypoint.sh` |
| `Invalid tunnel secret` | Cloudflared started before env was loaded | `docker compose up -d --force-recreate` |
| Cloudflare 502 after app restart | nginx hasn't picked up the new app container | `docker exec genome-nginx-1 nginx -s reload` |
| Prisma `MODULE_NOT_FOUND` for `postgres-array` etc. | Standalone tracing missed pg deps | Already handled in Dockerfile: explicit `COPY` of those modules |
| Setup page redirects to login | `/setup` not in `PUBLIC_PATHS` | Already in `proxy.ts` |
| SMB path with spaces fails | `NAS_PATH` has a space | Already handled — symlink `NAS_PATH → NAS_PATH` exists on the NAS |
| TypeScript errors locally about `SIBLING` or `PERSON_UPDATED` | Local Prisma client out of date | Run `npx prisma generate` locally, OR ignore — production rebuild fixes it |
| User reports "I see no people" after deploy | Algorithm bug in tree-layout produced off-screen y values | **Revert immediately** with `git revert HEAD && deploy`. Diagnose offline. |

## Rollback procedure

If a deploy breaks something:

```bash
# Locally
git revert HEAD --no-edit         # creates a revert commit
# Then re-run steps 3-6 above to deploy the revert
```

For schema rollbacks: edit the schema to remove the new addition and `prisma db push` again. PostgreSQL handles enum value removal IF no row uses the value yet.

## Backups

PostgreSQL data lives in the `postgres_data` Docker volume. MinIO data lives in `minio_data`. Both are on the NAS.

There's no automated backup pipeline yet. To take a manual snapshot:

```bash
ssh -i <SSH_KEY_PATH> root@<TRUENAS_HOST> \
  "docker exec genome-db-1 pg_dump -U genome_tree genome_tree > NAS_PATH/backups/genome-$(date +%F).sql"
```

TrueNAS itself does dataset-level snapshots — that covers the underlying volumes too.

## Initial setup (greenfield)

If deploying to a NEW machine:

1. Install Docker (TrueNAS SCALE 24.10+ has native Docker)
2. Create the directory `NAS_DEPLOY_PATH`
3. Robocopy the entire repo
4. Copy `.env.example` → `.env.production`, fill in real values:
   - `POSTGRES_PASSWORD` (random)
   - `SESSION_SECRET` (`openssl rand -base64 32`)
   - `MINIO_ROOT_PASSWORD` (random)
   - `APP_HOSTNAME` (e.g. `arbol.example.com`)
   - `CLOUDFLARE_TUNNEL_TOKEN` (from Cloudflare dashboard)
5. `docker compose up -d --build`
6. Apply the schema: `prisma db push` via temp container (above)
7. Visit `https://<APP_HOSTNAME>/setup` to create the first family + admin

## What ISN'T in version control

- `.env`, `.env.production`, `.env.local`
- `DEPLOY.md` (host-specific commands)
- `deploy-server.sh` (server-side helper script)
- `node_modules/`, `.next/`, build artifacts
- `Beta/`, `Final/`, `Genome Tree/` (legacy local folders)

The user keeps these locally; if a different machine needs to deploy, the user provides them out-of-band.
