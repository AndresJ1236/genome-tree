import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

export interface SessionPayload {
  userId: string
  familyId: string
  familySlug: string
  role: 'ADMIN' | 'MEMBER'
  scope: 'ADMIN' | 'FAMILY' | 'BRANCH'
  personId: string | null
  branchRootId: string | null
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
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

export async function createSession(data: Omit<SessionPayload, 'expiresAt'>) {
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

export async function createSessionToken(data: Omit<SessionPayload, 'expiresAt'>) {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000)
  const token = await encrypt({ ...data, expiresAt: expiresAt.toISOString() })
  return { token, expiresAt }
}

export async function deleteSession() {
  const cookieStore = await cookies()
  cookieStore.delete('session')
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  return decrypt(token)
}
