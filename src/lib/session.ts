import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { prisma } from '@/lib/prisma'

export interface SessionPayload {
  typ: 'session'
  userId: string
  familyId: string
  familySlug: string
  role: 'ADMIN' | 'MEMBER'
  scope: 'ADMIN' | 'FAMILY' | 'BRANCH'
  personId: string | null
  branchRootId: string | null
  sessionVersion: number
  expiresAt: string
}

const SESSION_DURATION_DAYS = 7

export function shouldUseSecureCookies() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? ''
  const host = process.env.HOSTNAME ?? ''
  if (
    appUrl.startsWith('http://localhost') ||
    appUrl.startsWith('http://127.0.0.1') ||
    host === 'localhost' ||
    host === '127.0.0.1'
  ) {
    return false
  }
  return process.env.NODE_ENV === 'production'
}

function getKey() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET no está definido')
  return new TextEncoder().encode(secret)
}

export async function encrypt(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_DAYS}d`)
    .sign(getKey())
}

export async function decrypt(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getKey(), { algorithms: ['HS256'] })
    const p = payload as unknown as SessionPayload
    if (p.typ !== 'session') return null
    return p
  } catch {
    return null
  }
}

export async function createSession(data: Omit<SessionPayload, 'expiresAt' | 'typ'>) {
  const { token, expiresAt } = await createSessionToken(data)

  const cookieStore = await cookies()
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    expires: expiresAt,
    sameSite: 'lax',
    path: '/',
  })
}

export async function createSessionToken(data: Omit<SessionPayload, 'expiresAt' | 'typ'>) {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000)
  const token = await encrypt({ ...data, typ: 'session', expiresAt: expiresAt.toISOString() })
  return { token, expiresAt }
}

export async function deleteSession() {
  const cookieStore = await cookies()
  cookieStore.delete('session')
}

// cache() deduplicates calls within a single server render (React request scope).
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  const payload = await decrypt(token)
  if (!payload) return null

  // Verify the session version against the DB — allows instant session revocation.
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { sessionVersion: true },
  })
  if (!user || user.sessionVersion !== payload.sessionVersion) return null

  return payload
})
