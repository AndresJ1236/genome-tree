import 'server-only'

import { SignJWT, jwtVerify } from 'jose'
import { randomUUID } from 'crypto'
import type { UserRole, UserScope } from '@/lib/content-types'

export interface InvitePayload {
  typ: 'invite'
  jti: string       // unique token ID — used for single-use enforcement
  familyId: string
  familySlug: string
  role: UserRole
  scope: UserScope
  branchRootId: string | null
  personId: string | null
  expiresAt: string
}

function getKey() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET no esta definido')
  return new TextEncoder().encode(secret)
}

export async function signInviteToken(payload: Omit<InvitePayload, 'expiresAt' | 'jti' | 'typ'>, expiresInDays = 7) {
  const jti       = randomUUID()
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
  const token = await new SignJWT({ ...payload, typ: 'invite', jti, expiresAt: expiresAt.toISOString() })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setJti(jti)
    .setExpirationTime(`${expiresInDays}d`)
    .sign(getKey())

  return { token, expiresAt: expiresAt.toISOString() }
}

export async function verifyInviteToken(token: string): Promise<InvitePayload | null> {
  try {
    const { payload } = await jwtVerify(token, getKey(), { algorithms: ['HS256'] })
    const p = payload as unknown as InvitePayload
    if (p.typ !== 'invite') return null
    return p
  } catch {
    return null
  }
}
