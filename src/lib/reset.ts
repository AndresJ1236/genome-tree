import 'server-only'

import { SignJWT, jwtVerify } from 'jose'

export interface ResetPayload {
  typ: 'reset'
  userId: string
  familyId: string
  expiresAt: string
}

function getKey() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET no esta definido')
  return new TextEncoder().encode(secret + '-reset')
}

export async function signResetToken(userId: string, familyId: string, expiresInHours = 24) {
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
  const token = await new SignJWT({ userId, familyId, typ: 'reset', expiresAt: expiresAt.toISOString() })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${expiresInHours}h`)
    .sign(getKey())
  return { token, expiresAt: expiresAt.toISOString() }
}

export async function verifyResetToken(token: string): Promise<ResetPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getKey(), { algorithms: ['HS256'] })
    const p = payload as unknown as ResetPayload
    if (p.typ !== 'reset') return null
    return p
  } catch {
    return null
  }
}
