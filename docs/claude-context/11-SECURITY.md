# 11 — Security layer

> Added in May 2026 (session git tag: `ed72c97` through `d968905`).
> This file documents every security control in production. Read before touching auth, uploads, rate limiting, or CSP.

## Overview

The security controls break into six areas:

| Area | Key files |
|------|-----------|
| Authentication & rate limiting | `src/app/auth/login/route.ts`, `src/lib/rate-limit.ts` |
| Session management | `src/lib/session.ts`, `src/app/proxy.ts` |
| Password reset tokens | `src/lib/reset.ts`, `src/app/actions/reset.ts` |
| Content Security Policy | `src/app/proxy.ts`, `src/app/layout.tsx` |
| File upload validation | `src/app/actions/media.ts` |
| Storage access | MinIO bucket policy (infrastructure) |

---

## 1. Login hardening

### IP + per-username rate limiting

`src/lib/rate-limit.ts` maintains two independent in-memory `Map` stores:

- **`ipStore`** — keyed on client IP. Blocks the IP after 5 failures in 15 min for 15 min.
- **`usernameStore`** — keyed on `username.toLowerCase()`. Same thresholds. Blocks credential stuffing attacks that rotate IPs but target the same account.

Both stores are evicted by a 30-min interval to prevent unbounded memory growth.

Login route calls them in order:
1. Check IP rate limit (fast, before parsing body)
2. Parse form data
3. Check per-username rate limit
4. Verify password
5. On any failure: `recordFailure(ip)` + `recordUsernameFailure(username)` (returns `{ justBlocked }`)
6. On username-block: fire `notifyLoginBlock(username)` fire-and-forget

On success: `recordSuccess(ip)` and `recordUsernameSuccess(username)` clear both stores (reset the window).

**Don't add more global state to this module.** It's intentionally simple because the app runs in a single container. Multi-container deployments would need Redis.

### Timing-attack normalization

When a username is NOT found in the DB, the login route still calls `bcrypt.compare()` against a dummy hash:

```ts
const DUMMY_HASH = '$2b$12$invalidhashfortimingprotection0000000000000000000000'
const passwordValid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)
```

Without this, "user not found" returns ~0 ms while a real bcrypt compare takes ~100 ms — measurable by an attacker doing username enumeration.

### Login block notifications

When `recordUsernameFailure()` returns `{ justBlocked: true }`, the route calls `notifyLoginBlock(username)` (in `src/lib/notifications.ts`). This looks up all ADMINs in the user's family and creates `SECURITY_ALERT` notification rows for them. It's fire-and-forget (`.catch(() => {})`) and never throws.

The `SECURITY_ALERT` notification type was added to the `NotificationType` enum — see [03-DATABASE.md](./03-DATABASE.md).

### Open redirect prevention

The login form accepts a `?from=` query parameter (set by `proxy.ts` when redirecting an unauthenticated request). The login page passes it as a hidden field, and the route handler validates it strictly before using it:

```ts
const rawFrom = String(formData.get('from') ?? '')
const redirectTo = rawFrom.startsWith('/') && !rawFrom.startsWith('//') ? rawFrom : `/${user.family.slug}/tree`
```

`//evil.com` (protocol-relative) is rejected by the double-slash check. Anything not starting with `/` falls back to the tree. The same validation lives in `login/page.tsx` (`isSafeRedirect()`) to filter it at render time.

---

## 2. Session management

### JWT claims

Every session token (`src/lib/session.ts`) includes:

| Claim | Type | Purpose |
|-------|------|---------|
| `typ` | `'session'` | Token type guard — ensures a reset token can't be used as a session cookie |
| `sessionVersion` | `number` | Must match `user.sessionVersion`; increment to invalidate all active sessions for a user |
| `userId`, `familyId`, `familySlug`, `role`, `scope`, `personId`, `branchRootId` | various | Authorization claims |
| `exp` | standard JWT | 7-day expiry |

`proxy.ts` verifies the `typ` claim on every request. A token without `typ: 'session'` is rejected (this prevents cross-type token confusion — e.g., using a reset link as a session cookie).

### Session versioning (forced logout)

`User.sessionVersion` (integer, default 0) is embedded in the JWT at login time. On every request, `proxy.ts` decodes the JWT and compares `payload.sessionVersion` against the current DB value. If they differ, the session is invalidated.

To force-logout a user: increment `sessionVersion` in the DB:

```sql
UPDATE "User" SET "sessionVersion" = "sessionVersion" + 1 WHERE username = '...';
```

This is the mechanism for "revoke all sessions" without needing a server-side session store.

**Gotcha:** this adds one DB query per request (the `sessionVersion` check). It runs in `proxy.ts` before the page handler. If you add more per-request DB work to proxy.ts, measure latency carefully.

### Rolling session renewal

`proxy.ts` renews the JWT when less than 3 days remain of the 7-day window:

```
expiresAt - now < 3 days  →  issue a new token with a fresh 7-day expiry
```

The new token is set as a `Set-Cookie` header on the response. This means active users never get logged out as long as they visit at least once every 4 days. Idle users (>7 days) are logged out.

---

## 3. Password reset tokens

### Single-use enforcement

Reset tokens now include a `jti` (JWT ID) UUID. When the token is consumed (`src/app/actions/reset.ts`):

1. Decode and verify the JWT
2. Check that `payload.typ === 'reset'` (type guard)
3. Check that `user.resetTokenJti !== payload.jti` — if they match, the token was already used → reject
4. Update the password hash AND set `user.resetTokenJti = payload.jti`

This prevents replay: if an attacker intercepts a reset link and uses it, the second use is rejected because `resetTokenJti` already holds the jti.

`resetTokenJti` is a `String? @unique` field on `User` — see [03-DATABASE.md](./03-DATABASE.md).

### Reset token issuance

`src/lib/reset.ts` generates the token:

```ts
const jti = randomUUID()   // from 'crypto'
const token = await new SignJWT({ userId, familyId, typ: 'reset', jti, expiresAt })
  .setJti(jti)             // also sets the standard JWT 'jti' claim
  .sign(getKey())
```

The key is derived from `SESSION_SECRET + '-reset'` — separate from the session key so reset tokens can't be used as sessions even if the `typ` check were bypassed.

---

## 4. Content Security Policy (CSP)

### Architecture: proxy.ts sets CSP per request

CSP was moved **out of `next.config.ts`** and into `src/app/proxy.ts`. This is necessary because nonces must be unique per request — static `headers()` in `next.config.ts` are set at build time and can't change per request.

`proxy.ts` calls `generateNonce()` using `globalThis.crypto.getRandomValues` (Web Crypto API, available in the Edge runtime):

```ts
function generateNonce(): string {
  const arr = new Uint8Array(16)
  globalThis.crypto.getRandomValues(arr)
  return btoa(String.fromCharCode(...Array.from(arr)))
}
```

The nonce is placed in the `x-nonce` request header (which Next.js propagates to Server Components via `headers()`) and in the `Content-Security-Policy` response header.

### CSP directives

```
default-src 'self';
script-src 'nonce-{nonce}' 'strict-dynamic';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: <production-hostname or minio>;
font-src 'self';
connect-src 'self';
media-src 'self';
object-src 'none';
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

`strict-dynamic` trusts scripts loaded by a nonced script. `unsafe-inline` for styles is required because Tailwind generates inline styles. No `unsafe-eval` anywhere.

`img-src` is environment-aware: in production it includes `https://${APP_HOSTNAME}` for nginx-proxied media; in development it includes `http://${MINIO_ENDPOINT}:${MINIO_PORT}` for direct MinIO access.

### Reading the nonce in layout.tsx

`src/app/layout.tsx` is async so it can read the nonce:

```tsx
import { headers } from 'next/headers'

export default async function RootLayout({ children }) {
  const nonce = (await headers()).get('x-nonce') ?? ''
  return (
    <html lang="es" className="h-full">
      <body className="h-full" {...(nonce ? { 'data-nonce': nonce } : {})}>
        {children}
      </body>
    </html>
  )
}
```

The nonce is stored in `data-nonce` on `<body>` so client components that need it (e.g., dynamic script tags) can read it from the DOM.

### next.config.ts no longer sets CSP

`next.config.ts` only sets non-CSP security headers (applied statically to all routes):

```ts
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]
```

Don't add `Content-Security-Policy` here — it would create a static CSP that conflicts with the per-request nonce version set in proxy.ts.

---

## 5. File upload validation

`src/app/actions/media.ts` validates uploaded images by checking the first 12 bytes of the file against known magic byte signatures before writing to MinIO:

```ts
async function validateMagicBytes(file: File): Promise<boolean> {
  const buf = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  // JPEG:  FF D8 FF
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true
  // PNG:   89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true
  // GIF:   47 49 46 38
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true
  // WebP:  52 49 46 46 ?? ?? ?? ?? 57 45 42 50
  if (buf[0]===0x52 && buf[1]===0x49 && buf[2]===0x46 && buf[3]===0x46
   && buf[8]===0x57 && buf[9]===0x45 && buf[10]===0x42 && buf[11]===0x50) return true
  return false
}
```

This prevents MIME-type spoofing (attacker renames a script as `photo.jpg`). It runs BEFORE the MinIO `putObject` call. Accepted formats: JPEG, PNG, GIF, WebP. Anything else returns `{ ok: false, error: 'Tipo de archivo no permitido...' }`.

The server-side action body limit is 15 MB (`next.config.ts` → `serverActions.bodySizeLimit`).

---

## 6. MinIO storage access

The MinIO bucket `genome-tree` must have **no public anonymous read policy**. This was discovered during the security audit — the bucket had been created with `mc anonymous set download`.

To verify and fix on the production server:

```bash
docker exec genome-minio-1 mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
docker exec genome-minio-1 mc anonymous get local/genome-tree
# Should output: "No anonymous policy found."
# If it says "download" or "public":
docker exec genome-minio-1 mc anonymous set none local/genome-tree
```

Media URLs are signed server-side by `src/lib/storage.ts` using `presignedGetObject()` with short-lived expiry. Never expose raw MinIO URLs directly to the client.

---

## 7. Dependency management

`.github/dependabot.yml` is configured for monthly npm dependency updates, limited to 5 open PRs at a time. Next.js major upgrades are excluded (require manual review).

Run `npm audit` locally after major dependency changes. During the security audit, `next-auth` was discovered as an unused dependency with known CVEs — it was removed from `package.json` entirely.

---

## 8. Docker non-root user

The `Dockerfile` runner stage creates and switches to a non-root user:

```dockerfile
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
USER nextjs
```

The app process runs as UID 1001. If a container escape occurred, the attacker would have no root privileges on the NAS. Volume mounts must grant read access to UID 1001 (the entrypoint script handles `chown` where needed).

---

## Audit logging coverage

All mutations that modify data should call `void logAudit({...})` (fire-and-forget). The following actions were added during the security audit to fill gaps:

| Action string | Where called |
|---------------|-------------|
| `DELETE_MEDIA` | `src/app/actions/media.ts` — `deleteMedia()` |
| `UPDATE_CONTENT` | `src/app/actions/content.ts` — `updateContent()` |
| `DELETE_CONTENT` | `src/app/actions/content.ts` — `deleteContent()` |
| `DELETE_IMPORTANT_LINK` | `src/app/actions/content.ts` — `deleteImportantLink()` |

The fan-out in `src/lib/notifications.ts` currently only generates notification rows for `CREATE_PERSON`, `UPDATE_PERSON`, and `CREATE_CONTENT`. The new `DELETE_*` actions write audit rows but produce no notifications (they fall through the `default: return` in `fanOutNotificationsFromAudit`).

---

## SESSION_SECRET rotation

See [08-PROCEDURES.md — Rotate SESSION_SECRET](./08-PROCEDURES.md#rotate-session_secret) for the full procedure.

The secret is used to derive three separate HMAC keys:
- `SESSION_SECRET` — session JWT signing
- `SESSION_SECRET + '-reset'` — reset token signing
- `SESSION_SECRET + '-invite'` — invite token signing

Rotating the secret invalidates all three simultaneously.
