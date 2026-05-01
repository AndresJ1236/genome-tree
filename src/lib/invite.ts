import 'server-only'

import { SignJWT, jwtVerify } from 'jose'
import type { UserRole, UserScope } from '@/lib/content-types'

export interface InvitePayload {
  familyId: string
  familySlug: string
  role: UserRole
  scope: UserScope
  branchRootId: string | null
  expiresAt: string
}

function getKey() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET no esta definido')
  return new TextEncoder().encode(secret)
}

export async function signInviteToken(payload: Omit<InvitePayload, 'expiresAt'>, expiresInDays = 7) {
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
  const token = await new SignJWT({ ...payload, expiresAt: expiresAt.toISOString() })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${expiresInDays}d`)
    .sign(getKey())

  return { token, expiresAt: expiresAt.toISOString() }
}

export async function verifyInviteToken(token: string): Promise<InvitePayload | null> {
  try {
    const { payload } = await jwtVerify(token, getKey(), { algorithms: ['HS256'] })
    return payload as unknown as InvitePayload
  } catch {
    return null
  }
}
