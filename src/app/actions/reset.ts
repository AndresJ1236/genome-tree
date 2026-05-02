'use server'

import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { verifyResetToken } from '@/lib/reset'
import { createSession } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import type { ActionResult } from '@/lib/content-types'

export async function applyPasswordReset(input: {
  token: string
  newPassword: string
}): Promise<ActionResult<{ familySlug: string }>> {
  const payload = await verifyResetToken(input.token)
  if (!payload) return { ok: false, error: 'El link no es valido o ya expiro.' }

  if (input.newPassword.length < 6) {
    return { ok: false, error: 'La contrasena debe tener al menos 6 caracteres.' }
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
    data: { passwordHash },
  })

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
  })

  return { ok: true, data: { familySlug: family.slug } }
}
