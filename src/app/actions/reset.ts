'use server'

import bcrypt from 'bcryptjs'
import { headers } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyResetToken } from '@/lib/reset'
import { createSession } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { checkRateLimit, recordFailure, recordSuccess } from '@/lib/rate-limit'
import type { ActionResult } from '@/lib/content-types'

async function getClientIp(): Promise<string> {
  const h = await headers()
  return (
    h.get('x-real-ip') ??
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  )
}

export async function applyPasswordReset(input: {
  token: string
  newPassword: string
}): Promise<ActionResult<{ familySlug: string }>> {
  const ip = await getClientIp()
  const { allowed, retryAfterMs } = checkRateLimit(ip)
  if (!allowed) {
    const minutes = Math.ceil((retryAfterMs ?? 0) / 60000)
    return { ok: false, error: `Demasiados intentos. Intenta de nuevo en ${minutes} minuto${minutes !== 1 ? 's' : ''}.` }
  }

  const payload = await verifyResetToken(input.token)
  if (!payload) {
    recordFailure(ip)
    return { ok: false, error: 'El link no es valido o ya expiro.' }
  }

  if (input.newPassword.length < 6) {
    return { ok: false, error: 'La contrasena debe tener al menos 6 caracteres.' }
  }

  // Single-use enforcement
  if (payload.jti) {
    const alreadyUsed = await prisma.user.findUnique({ where: { resetTokenJti: payload.jti } })
    if (alreadyUsed) {
      recordFailure(ip)
      return { ok: false, error: 'Este link de recuperacion ya fue utilizado.' }
    }
  }

  const user = await prisma.user.findFirst({
    where: { id: payload.userId, familyId: payload.familyId },
  })
  if (!user) return { ok: false, error: 'Usuario no encontrado.' }

  const family = await prisma.family.findUnique({ where: { id: payload.familyId } })
  if (!family) return { ok: false, error: 'Familia no encontrada.' }

  const passwordHash = await bcrypt.hash(input.newPassword, 12)
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      resetTokenJti: payload.jti ?? null,
    },
  })

  recordSuccess(ip)

  await logAudit({
    familyId: payload.familyId,
    userId: user.id,
    action: 'RESET_PASSWORD',
    entityType: 'User',
    entityId: user.id,
    newValue: { username: user.username },
  })

  await createSession({
    userId: user.id,
    familyId: user.familyId,
    familySlug: family.slug,
    role: user.role,
    scope: user.scope,
    personId: user.personId ?? null,
    branchRootId: user.branchRootId ?? null,
    sessionVersion: user.sessionVersion,
  })

  return { ok: true, data: { familySlug: family.slug } }
}
