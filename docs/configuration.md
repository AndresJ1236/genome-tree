# Configuration

All configuration is done via environment variables in a `.env` file. Copy `.env.example` to get started:

```bash
cp .env.example .env
```

---

## Variables

### Database

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `POSTGRES_PASSWORD` | Yes (Docker) | Password for the `genome_tree` DB user. Used by the `db` Docker service to initialize the database and by the `app` service to construct `DATABASE_URL` at runtime. |

**Example:**
```bash
DATABASE_URL="postgresql://genome_tree:mypassword@localhost:5432/genome_tree"
POSTGRES_PASSWORD="mypassword"
```

In Docker Compose the app constructs `DATABASE_URL` from `POSTGRES_PASSWORD` automatically — you only need to set `POSTGRES_PASSWORD` in `.env`.

---

### Sessions

| Variable | Required | Description |
|----------|----------|-------------|
| `SESSION_SECRET` | Yes | Secret key used to sign JWT session tokens. Must be at least 32 characters. Generate with `openssl rand -base64 32`. |

Changing this value invalidates all existing sessions — all users will be logged out.

---

### Application

| Variable | Required | Description |
|----------|----------|-------------|
| `APP_HOSTNAME` | Yes (prod) | Public hostname where the app is served. Used to construct absolute URLs and set the `MINIO_PUBLIC_URL` in Docker. Example: `arbol.example.com` |

---

### MinIO (media storage)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MINIO_ROOT_USER` | Yes | — | MinIO admin username |
| `MINIO_ROOT_PASSWORD` | Yes | — | MinIO admin password |
| `MINIO_ENDPOINT` | Dev only | `minio` (Docker) | MinIO host. In Docker Compose the services communicate via the service name `minio`. For local dev outside Docker, use `localhost`. |
| `MINIO_PORT` | Dev only | `9000` | MinIO port |
| `MINIO_BUCKET` | No | `genome-tree` | Name of the MinIO bucket where media files are stored. The bucket must exist before uploading. |
| `MINIO_PUBLIC_URL` | Yes (prod) | — | Base URL the browser uses to load media files. In production: `https://${APP_HOSTNAME}/media`. Leave empty in development to use `http://localhost:9000` directly. |

---

### Cloudflare Tunnel

| Variable | Required | Description |
|----------|----------|-------------|
| `CLOUDFLARE_TUNNEL_TOKEN` | Prod only | Token for the Cloudflare Tunnel agent (`cloudflared`). Obtain from the Cloudflare Zero Trust dashboard under Networks → Tunnels. |

This variable is only read by the `cloudflared` Docker service. If you're not using Cloudflare Tunnel (e.g., you have your own reverse proxy), you can leave it empty and remove the `cloudflared` service from `docker-compose.yml`.

---

## Development vs production

### Development (`.env.local` or `.env`)

```bash
DATABASE_URL="postgresql://genome_tree:devpassword@localhost:5432/genome_tree"
SESSION_SECRET="dev_secret_does_not_need_to_be_strong"

MINIO_ROOT_USER="admin"
MINIO_ROOT_PASSWORD="devpassword"
MINIO_ENDPOINT="localhost"
MINIO_PORT="9000"
MINIO_BUCKET="genome-tree"
MINIO_PUBLIC_URL=""
```

### Production (`.env`)

```bash
POSTGRES_PASSWORD="strong_random_password"
SESSION_SECRET="output_of_openssl_rand_-base64_32"
APP_HOSTNAME="arbol.example.com"

MINIO_ROOT_USER="admin"
MINIO_ROOT_PASSWORD="another_strong_password"
# MINIO_ENDPOINT, MINIO_PORT, MINIO_BUCKET are set automatically by docker-compose.yml
MINIO_PUBLIC_URL="https://arbol.example.com/media"

CLOUDFLARE_TUNNEL_TOKEN="your_tunnel_token"
```

---

## Build-time variables

`APP_HOSTNAME` is also passed as a Docker build argument in `docker-compose.yml`:

```yaml
app:
  build:
    context: .
    args:
      APP_HOSTNAME: ${APP_HOSTNAME}
```

This bakes the hostname into the Next.js image for `remotePatterns` in `next.config.ts` (allows loading images from that domain). If you change `APP_HOSTNAME`, rebuild the image: `docker compose build app`.
