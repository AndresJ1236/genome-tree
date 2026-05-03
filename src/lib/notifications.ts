import 'server-only'
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

// ── Content type labels for notification messages ──────────────────────────────

const CONTENT_LABELS: Record<string, string> = {
  STORY:     'historia',
  RECIPE:    'receta',
  DIARY:     'entrada de diario',
  INTERVIEW: 'entrevista',
  OBJECT:    'objeto',
  SOURCE:    'fuente',
}

// ── Fan-out from audit log ─────────────────────────────────────────────────────
// Called fire-and-forget from logAudit. Creates notification rows for relevant
// family members based on the action that was just recorded.

export async function fanOutNotificationsFromAudit(entry: {
  familyId: string
  actorId: string
  action: string
  entityId: string
  newValue: unknown
}): Promise<void> {
  try {
    // Determine notification params based on action
    let type: NotificationType | null = null
    let title = ''
    let body: string | null = null
    let href: string | null = null
    let audience: 'all' | 'admins_reps' = 'all'

    const nv = (entry.newValue ?? {}) as Record<string, string>

    // Look up family slug for hrefs
    const family = await prisma.family.findUnique({
      where: { id: entry.familyId },
      select: { slug: true },
    })
    const slug = family?.slug ?? ''

    switch (entry.action) {
      case 'CREATE_PERSON': {
        const person = await prisma.person.findUnique({
          where: { id: entry.entityId },
          select: { firstName: true, lastName: true },
        })
        if (!person) return
        type = 'NEW_PERSON_ADDED'
        title = `${person.firstName} ${person.lastName} fue añadido/a al árbol`
        href = `/${slug}/person/${entry.entityId}`
        break
      }
      case 'UPDATE_PERSON': {
        const person = await prisma.person.findUnique({
          where: { id: entry.entityId },
          select: { firstName: true, lastName: true },
        })
        if (!person) return
        type = 'PERSON_UPDATED'
        title = `Datos actualizados: ${person.firstName} ${person.lastName}`
        href = `/${slug}/person/${entry.entityId}`
        audience = 'admins_reps'
        break
      }
      case 'CREATE_CONTENT': {
        const personId = nv.personId
        const contentType = nv.type
        const contentTitle = nv.title
        if (!personId) return
        const person = await prisma.person.findUnique({
          where: { id: personId },
          select: { firstName: true, lastName: true },
        })
        if (!person) return
        const typeLabel = CONTENT_LABELS[contentType] ?? 'contenido'
        type = 'NEW_CONTENT_ADDED'
        title = `Nueva ${typeLabel} sobre ${person.firstName} ${person.lastName}`
        body = contentTitle ?? null
        href = `/${slug}/person/${personId}`
        break
      }
      default:
        return // No notification for admin/config actions
    }

    if (!type) return

    // Determine target users (exclude actor)
    const users = await prisma.user.findMany({
      where: audience === 'admins_reps'
        ? {
            familyId: entry.familyId,
            id: { not: entry.actorId },
            OR: [{ scope: 'ADMIN' }, { representativeManagedUnits: { some: {} } }],
          }
        : {
            familyId: entry.familyId,
            id: { not: entry.actorId },
            scope: { in: ['ADMIN', 'FAMILY'] },
          },
      select: { id: true },
    })

    if (users.length === 0) return

    await prisma.notification.createMany({
      data: users.map(u => ({
        userId:   u.id,
        familyId: entry.familyId,
        type:     type!,
        title,
        body,
        href,
      })),
    })
  } catch {
    // Best-effort — never crash the calling action
  }
}
