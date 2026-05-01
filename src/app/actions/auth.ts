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
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Completa todos los campos' }
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { family: true },
  })

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: 'Correo o contraseña incorrectos' }
  }

  await createSession({
    userId: user.id,
    familyId: user.familyId,
    familySlug: user.family.slug,
    role: user.role,
    scope: user.scope,
    personId: user.personId ?? null,
    branchRootId: user.branchRootId ?? null,
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
