import 'server-only'
import { prisma } from '@/lib/prisma'
import { fanOutNotificationsFromAudit } from '@/lib/notifications'

export async function logAudit(params: {
  familyId: string
  userId: string
  action: string
  entityType: string
  entityId: string
  oldValue?: unknown
  newValue?: unknown
}) {
  await prisma.auditLog.create({
    data: {
      familyId: params.familyId,
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      oldValue: params.oldValue as object | undefined,
      newValue: params.newValue as object | undefined,
    },
  })
  void fanOutNotificationsFromAudit({
    familyId: params.familyId,
    actorId: params.userId,
    action: params.action,
    entityId: params.entityId,
    newValue: params.newValue ?? null,
  })
}
