# Deployment Guide

This guide covers deploying Genome Tree to a self-hosted server using Docker Compose, Nginx as a reverse proxy, and Cloudflare Tunnel for HTTPS access without opening inbound ports.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Stack overview](#stack-overview)
3. [Server setup](#server-setup)
4. [Configure environment](#configure-environment)
5. [Build and start](#build-and-start)
6. [Cloudflare Tunnel setup](#cloudflare-tunnel-setup)
7. [First run](#first-run)
8. [Updates](#updates)
9. [Backups](#backups)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- A Linux server (Ubuntu 22.04+ or similar) with Docker and Docker Compose v2 installed
- A domain name managed by Cloudflare (free plan works)
- At least 1 GB RAM, 10 GB disk

---

## Stack overview

The `docker-compose.yml` defines five services:

| Service | Image | Role |
|---------|-------|------|
| `db` | `postgres:16-alpine` | PostgreSQL database |
| `minio` | `minio/minio` | S3-compatible media storage |
| `app` | Built from `Dockerfile` | Next.js application |
| `nginx` | `nginx:alpine` | Reverse proxy (app + media) |
| `cloudflared` | `cloudflare/cloudflared` | Cloudflare Tunnel agent |

Nginx listens on `127.0.0.1:8080` (not exposed to the internet). `cloudflared` connects outbound to Cloudflare's edge and forwards traffic to Nginx. No inbound ports need to be opened on the server firewall.

---

## Server setup

Install Docker if not already present:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# log out and back in
```

Clone the repository:

```bash
git clone https://github.com/your-org/genome-tree.git
cd genome-tree
```

---

## Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in all required values. See [`docs/configuration.md`](configuration.md) for a full description of every variable. At minimum you need:

```bash
POSTGRES_PASSWORD="a_strong_random_password"
SESSION_SECRET="output_of_openssl_rand_-base64_32"
APP_HOSTNAME="your.domain.com"
MINIO_ROOT_USER="admin"
MINIO_ROOT_PASSWORD="another_strong_password"
```

Generate the session secret:

```bash
openssl rand -base64 32
```

---

## Build and start

```bash
docker compose up -d --build
```

This will:
1. Build the Next.js app into a standalone Docker image.
2. Start all five services.
3. The `app` entrypoint runs `prisma db push` to apply the schema before the server starts.

Check that all services are running:

```bash
docker compose ps
```

View app logs:

```bash
docker compose logs -f app
```

---

## Cloudflare Tunnel setup

### Create the tunnel

1. Log in to the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/).
2. Go to **Networks → Tunnels → Create a tunnel**.
3. Name it (e.g., `genome-tree`).
4. Copy the **tunnel token** shown in the setup screen.
5. Set it in `.env`:
   ```bash
   CLOUDFLARE_TUNNEL_TOKEN="your_token_here"
   ```
6. Restart the cloudflared service:
   ```bash
   docker compose restart cloudflared
   ```

### Configure the public route

In the Cloudflare Zero Trust dashboard, go to your tunnel → **Public Hostname** → **Add a public hostname**:

| Field | Value |
|-------|-------|
| Subdomain | (e.g., `arbol`) |
| Domain | your Cloudflare domain |
| Type | HTTP |
| URL | `nginx:80` |

Cloudflare will provision a TLS certificate automatically.

---

## First run

After the stack is up, create the first admin user by seeding the database:

```bash
docker compose exec app npx prisma db seed
```

This creates a demo family ("Familia Demo") with 13 people and an admin user:

- **Username:** `admin`
- **Password:** `admin123`

**Change this password immediately** after first login via the user settings page.

To create a fresh family without demo data, use the setup page at `/setup` (only available when no families exist in the database).

---

## Updates

To deploy a new version:

```bash
git pull
docker compose up -d --build app
```

The entrypoint automatically runs `prisma db push` on startup, so schema changes are applied before the app starts accepting requests. No manual migration step is needed for patch/minor updates.

For major version upgrades, check the [CHANGELOG](../CHANGELOG.md) for breaking changes before updating.

---

## Backups

### Database

```bash
docker compose exec db pg_dump -U genome_tree genome_tree > backup_$(date +%Y%m%d).sql
```

Restore:

```bash
cat backup_20260502.sql | docker compose exec -T db psql -U genome_tree genome_tree
```

### Media files

MinIO data is stored in the `minio_data` Docker volume. To export:

```bash
docker run --rm \
  -v genome-tree_minio_data:/data \
  -v $(pwd)/backup:/backup \
  alpine tar czf /backup/minio_$(date +%Y%m%d).tar.gz /data
```

---

## Troubleshooting

### App fails to start — "Can't reach database server"

The app depends on the `db` service being healthy. The `healthcheck` in `docker-compose.yml` retries up to 5 times. If it keeps failing:

```bash
docker compose logs db
```

Check that `POSTGRES_PASSWORD` in `.env` matches the value used when the volume was first created. If you changed the password, you may need to drop and recreate the volume:

```bash
docker compose down -v   # WARNING: destroys all data
docker compose up -d --build
```

### Prisma WASM error on startup

The Dockerfile copies Prisma's WASM binaries to the correct location for the standalone build. If you see a WASM-related error, rebuild the image from scratch:

```bash
docker compose build --no-cache app
docker compose up -d
```

### MinIO console access

The MinIO web console is available at `http://localhost:9001` on the server (not exposed externally). To access it from your local machine:

```bash
ssh -L 9001:localhost:9001 user@your-server
```

Then open `http://localhost:9001` in your browser.

### Images not loading

Check that `MINIO_PUBLIC_URL` is set to `https://${APP_HOSTNAME}/media` in production. The Nginx config proxies `/media/` to MinIO's internal bucket. If images return 404, verify the bucket name (`genome-tree`) matches `MINIO_BUCKET` in `.env`.
