'use server'

import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'

type SetupResult = { error: string } | null

export async function setupFamily(_prev: SetupResult, formData: FormData): Promise<SetupResult> {
  const count = await prisma.family.count()
  if (count > 0) redirect('/login')

  const familyName = (formData.get('familyName') as string ?? '').trim()
  const familySlug = (formData.get('familySlug') as string ?? '').trim()
  const adminName  = (formData.get('adminName')  as string ?? '').trim()
  const adminUsername = (formData.get('adminUsername') as string ?? '').trim().toLowerCase()
  const password      = (formData.get('password')      as string ?? '')
  const confirm       = (formData.get('confirm')       as string ?? '')

  if (!familyName || !familySlug || !adminName || !adminUsername || !password) {
    return { error: 'Todos los campos son obligatorios.' }
  }
  if (!/^[a-z0-9-]+$/.test(familySlug)) {
    return { error: 'El slug solo puede tener letras minúsculas, números y guiones.' }
  }
  if (password.length < 8) {
    return { error: 'La contraseña debe tener al menos 8 caracteres.' }
  }
  if (password !== confirm) {
    return { error: 'Las contraseñas no coinciden.' }
  }

  const slugExists = await prisma.family.findUnique({ where: { slug: familySlug } })
  if (slugExists) {
    return { error: 'Ese slug ya está en uso.' }
  }

  const passwordHash = await bcrypt.hash(password, 12)

  await prisma.family.create({
    data: {
      name: familyName,
      slug: familySlug,
      config: { create: {} },
      users: {
        create: {
          name:         adminName,
          username:     adminUsername,
          passwordHash,
          role:         'ADMIN',
          scope:        'ADMIN',
        },
      },
    },
  })

  redirect('/login')
}
