'use server'

import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { verifyInviteToken } from '@/lib/invite'
import { createSession } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import type { ActionResult } from '@/lib/content-types'

export async function acceptInvite(input: {
  token: string
  name: string
  username: string
  password: string
}): Promise<ActionResult> {
  const payload = await verifyInviteToken(input.token)
  if (!payload) return { ok: false, error: 'La invitacion no es valida o ya expiro.' }

  const name = input.name.trim()
  const username = input.username.trim().toLowerCase()
  const password = input.password

  if (!name || !username || password.length < 6) {
    return { ok: false, error: 'Completa todos los campos y usa una contrasena de al menos 6 caracteres.' }
  }

  const family = await prisma.family.findUnique({ where: { id: payload.familyId } })
  if (!family || family.slug !== payload.familySlug) {
    return { ok: false, error: 'La familia asociada a la invitacion no existe.' }
  }

  const existing = await prisma.user.findUnique({ where: { username } })
  if (existing) {
    return { ok: false, error: 'Ya existe una cuenta con ese usuario.' }
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: {
      username,
      name,
      passwordHash,
      familyId: payload.familyId,
      role: payload.role,
      scope: payload.scope,
      branchRootId: payload.branchRootId,
    },
  })

  await logAudit({
    familyId: payload.familyId,
    userId: user.id,
    action: 'ACCEPT_INVITE',
    entityType: 'User',
    entityId: user.id,
    newValue: {
      username: user.username,
      role: user.role,
      scope: user.scope,
      branchRootId: user.branchRootId,
    },
  })

  await createSession({
    userId: user.id,
    familyId: user.familyId,
    familySlug: payload.familySlug,
    role: user.role,
    scope: user.scope,
    personId: user.personId ?? null,
    branchRootId: user.branchRootId ?? null,
  })

  return { ok: true, data: undefined }
}
