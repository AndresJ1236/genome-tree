'use server'

import { prisma } from '@/lib/prisma'
import { createSession, deleteSession } from '@/lib/session'
import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'

export type LoginState =
  | { error: string }
  | { success: true; redirectTo: string }
  | undefined

export async function login(
  _state: LoginState,
  formData: FormData
): Promise<LoginState> {
  const username = formData.get('username') as string
  const password = formData.get('password') as string

  if (!username || !password) {
    return { error: 'Completa todos los campos' }
  }

  const user = await prisma.user.findUnique({
    where: { username },
    include: { family: true },
  })

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: 'Usuario o contraseña incorrectos' }
  }

  await createSession({
    userId: user.id,
    familyId: user.familyId,
    familySlug: user.family.slug,
    role: user.role,
    scope: user.scope,
    personId: user.personId ?? null,
    branchRootId: user.branchRootId ?? null,
    sessionVersion: user.sessionVersion,
  })

  return {
    success: true,
    redirectTo: `/${user.family.slug}/tree`,
  }
}

export async function logout() {
  await deleteSession()
  redirect('/login')
}

export async function changeOwnPassword(input: {
  currentPassword: string
  newPassword: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { getSession } = await import('@/lib/session')
  const { logAudit } = await import('@/lib/audit')
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  if (input.newPassword.length < 6) {
    return { ok: false, error: 'La nueva contraseña debe tener al menos 6 caracteres.' }
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } })
  if (!user) return { ok: false, error: 'Usuario no encontrado.' }

  const match = await bcrypt.compare(input.currentPassword, user.passwordHash)
  if (!match) return { ok: false, error: 'La contraseña actual es incorrecta.' }

  const passwordHash = await bcrypt.hash(input.newPassword, 12)
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } })

  await logAudit({
    familyId: session.familyId,
    userId: session.userId,
    action: 'CHANGE_OWN_PASSWORD',
    entityType: 'User',
    entityId: session.userId,
    newValue: { username: user.username },
  })

  return { ok: true }
}
