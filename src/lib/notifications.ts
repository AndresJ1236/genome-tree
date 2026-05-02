import { prisma } from '@/lib/prisma'
import type { NotificationType } from '@prisma/client'

interface NotifyParams {
  familyId: string
  type: NotificationType
  title: string
  body?: string
  href?: string
}

export async function notifyUser(userId: string, params: NotifyParams) {
  await prisma.notification.create({
    data: {
      userId,
      familyId: params.familyId,
      type:     params.type,
      title:    params.title,
      body:     params.body ?? null,
      href:     params.href ?? null,
    },
  })
}

export async function notifyFamilyMembers(params: NotifyParams) {
  const users = await prisma.user.findMany({
    where: { familyId: params.familyId, scope: { in: ['FAMILY', 'ADMIN'] } },
    select: { id: true },
  })
  if (users.length === 0) return
  await prisma.notification.createMany({
    data: users.map(u => ({
      userId:   u.id,
      familyId: params.familyId,
      type:     params.type,
      title:    params.title,
      body:     params.body ?? null,
      href:     params.href ?? null,
    })),
  })
}

export async function notifyAdminsAndRepresentatives(params: NotifyParams) {
  const users = await prisma.user.findMany({
    where: {
      familyId: params.familyId,
      OR: [
        { scope: 'ADMIN' },
        { representativeManagedUnits: { some: {} } },
      ],
    },
    select: { id: true },
  })
  if (users.length === 0) return
  await prisma.notification.createMany({
    data: users.map(u => ({
      userId:   u.id,
      familyId: params.familyId,
      type:     params.type,
      title:    params.title,
      body:     params.body ?? null,
      href:     params.href ?? null,
    })),
  })
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, read: false } })
}
