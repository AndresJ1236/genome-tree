'use server'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import type { ActionResult, NotificationItem } from '@/lib/content-types'

export async function getMyNotifications(): Promise<ActionResult<NotificationItem[]>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  const items = await prisma.notification.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
    take: 6,
    select: { id: true, type: true, title: true, body: true, href: true, read: true, createdAt: true },
  })

  return {
    ok: true,
    data: items.map(n => ({
      id:        n.id,
      type:      n.type,
      title:     n.title,
      body:      n.body,
      href:      n.href,
      read:      n.read,
      createdAt: n.createdAt.toISOString(),
    })),
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  const session = await getSession()
  if (!session) return
  await prisma.notification.updateMany({
    where: { userId: session.userId, read: false },
    data: { read: true },
  })
}

export async function getMyUnreadCount(): Promise<number> {
  const session = await getSession()
  if (!session) return 0
  return prisma.notification.count({ where: { userId: session.userId, read: false } })
}
