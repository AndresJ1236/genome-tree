import 'server-only'

// In-memory rate limiter for login attempts (single-container deployment).
// Tracks failed attempts per IP and per username independently.
// Blocks after MAX_FAILURES failures in WINDOW_MS.

const MAX_FAILURES = 5
const WINDOW_MS    = 15 * 60 * 1000  // 15 minutes
const BLOCK_MS     = 15 * 60 * 1000  // block duration

interface Entry {
  failures:     number
  windowStart:  number
  blockedUntil: number | null
}

const ipStore       = new Map<string, Entry>()
const usernameStore = new Map<string, Entry>()

function evict(store: Map<string, Entry>) {
  const now = Date.now()
  for (const [key, entry] of store) {
    const blocked        = entry.blockedUntil !== null && entry.blockedUntil > now
    const recentActivity = now - entry.windowStart < WINDOW_MS * 2
    if (!blocked && !recentActivity) store.delete(key)
  }
}

setInterval(() => {
  evict(ipStore)
  evict(usernameStore)
}, 30 * 60 * 1000)

function getEntry(store: Map<string, Entry>, key: string): Entry {
  let entry = store.get(key)
  if (!entry) {
    entry = { failures: 0, windowStart: Date.now(), blockedUntil: null }
    store.set(key, entry)
  }
  return entry
}

function checkEntry(store: Map<string, Entry>, key: string): { allowed: boolean; retryAfterMs?: number } {
  const entry = getEntry(store, key)
  const now   = Date.now()

  if (entry.blockedUntil !== null && entry.blockedUntil > now) {
    return { allowed: false, retryAfterMs: entry.blockedUntil - now }
  }

  if (now - entry.windowStart > WINDOW_MS) {
    entry.failures     = 0
    entry.windowStart  = now
    entry.blockedUntil = null
  }

  return { allowed: true }
}

function recordEntryFailure(store: Map<string, Entry>, key: string): void {
  const entry = getEntry(store, key)
  const now   = Date.now()

  if (now - entry.windowStart > WINDOW_MS) {
    entry.failures     = 0
    entry.windowStart  = now
    entry.blockedUntil = null
  }

  entry.failures++

  if (entry.failures >= MAX_FAILURES) {
    entry.blockedUntil = now + BLOCK_MS
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterMs?: number } {
  return checkEntry(ipStore, ip)
}

export function checkUsernameRateLimit(username: string): { allowed: boolean; retryAfterMs?: number } {
  return checkEntry(usernameStore, username.toLowerCase())
}

export function recordFailure(ip: string): void {
  recordEntryFailure(ipStore, ip)
}

export function recordUsernameFailure(username: string): void {
  recordEntryFailure(usernameStore, username.toLowerCase())
}

export function recordSuccess(ip: string): void {
  ipStore.delete(ip)
}

export function recordUsernameSuccess(username: string): void {
  usernameStore.delete(username.toLowerCase())
}
