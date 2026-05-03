import 'server-only'

// In-memory rate limiter for login attempts (single-container deployment).
// Tracks failed attempts per IP; blocks after MAX_FAILURES in WINDOW_MS.

const MAX_FAILURES = 5
const WINDOW_MS    = 15 * 60 * 1000  // 15 minutes
const BLOCK_MS     = 15 * 60 * 1000  // block duration

interface Entry {
  failures:     number
  windowStart:  number
  blockedUntil: number | null
}

const store = new Map<string, Entry>()

// Periodically evict stale entries to avoid unbounded memory growth.
// Runs every 30 minutes; entries older than WINDOW_MS with no block are removed.
setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of store) {
    const blocked   = entry.blockedUntil !== null && entry.blockedUntil > now
    const recentActivity = now - entry.windowStart < WINDOW_MS * 2
    if (!blocked && !recentActivity) store.delete(ip)
  }
}, 30 * 60 * 1000)

function getEntry(ip: string): Entry {
  let entry = store.get(ip)
  if (!entry) {
    entry = { failures: 0, windowStart: Date.now(), blockedUntil: null }
    store.set(ip, entry)
  }
  return entry
}

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterMs?: number } {
  const entry = getEntry(ip)
  const now   = Date.now()

  if (entry.blockedUntil !== null && entry.blockedUntil > now) {
    return { allowed: false, retryAfterMs: entry.blockedUntil - now }
  }

  // Reset window if it has expired
  if (now - entry.windowStart > WINDOW_MS) {
    entry.failures    = 0
    entry.windowStart = now
    entry.blockedUntil = null
  }

  return { allowed: true }
}

export function recordFailure(ip: string): void {
  const entry = getEntry(ip)
  const now   = Date.now()

  // Reset window if expired before incrementing
  if (now - entry.windowStart > WINDOW_MS) {
    entry.failures    = 0
    entry.windowStart = now
    entry.blockedUntil = null
  }

  entry.failures++

  if (entry.failures >= MAX_FAILURES) {
    entry.blockedUntil = now + BLOCK_MS
  }
}

export function recordSuccess(ip: string): void {
  store.delete(ip)
}
