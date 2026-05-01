'use server'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { assertPersonAccess } from '@/lib/permissions'
import { logAudit } from '@/lib/audit'
import { signInviteToken } from '@/lib/invite'
import { hasCompatibleManagedUnitSurname } from '@/lib/managed-family-unit'
import { auditLogTouchesManagedScope } from '@/lib/managed-audit'
import { getPersonDisplayName } from '@/lib/person-name'
import { parseRelationsJsonPayload, planRelationsImport } from '@/lib/relations-json'
import { getManagedUnitPersonIdsFromPeople } from '@/lib/visibility-graph'
import type {
  AccessEffect,
  AccessPermission,
  ActionResult,
  AdminDashboardData,
  FamilyConfigData,
  ManagedFamilyUnitItem,
  ManagedFamilyUnitPreviewPerson,
  UserRole,
  UserScope,
} from '@/lib/content-types'
import { revalidatePath } from 'next/cache'

function ensureAdmin(session: NonNullable<Awaited<ReturnType<typeof getSession>>>) {
  if (session.role !== 'ADMIN') {
    throw new Error('Solo administradores')
  }
}

type FamilyPersonRecord = {
  id: string
  firstName: string
  middleName: string | null
  lastName: string
  birthSurname1: string | null
  birthSurname2: string | null
  fatherId: string | null
  motherId: string | null
  birthDate: Date | null
  deathDate: Date | null
}

type ManagedUnitDashboardRecord = {
  id: string
  label: string
  parentAId: string
  parentBId: string | null
  representativeUserId: string | null
  primarySurname: string | null
  secondarySurname: string | null
  canInviteUsers: boolean
  canEditPeople: boolean
  canManageContent: boolean
  canViewAudit: boolean
  parentA: { id: string; firstName: string; middleName: string | null; lastName: string }
  parentB: { id: string; firstName: string; middleName: string | null; lastName: string } | null
  representativeUser: { id: string; name: string; email: string } | null
}

async function getFamilyPeople(familyId: string) {
  return prisma.person.findMany({
    where: { familyId },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: {
      id: true,
      firstName: true,
      middleName: true,
      lastName: true,
      birthSurname1: true,
      birthSurname2: true,
      fatherId: true,
      motherId: true,
      birthDate: true,
      deathDate: true,
    },
  })
}

async function getManagedUnitsDashboardRecords(where: {
  familyId: string
  representativeUserId?: string
  canViewAudit?: boolean
}) {
  return prisma.managedFamilyUnit.findMany({
    where,
    orderBy: [{ label: 'asc' }, { createdAt: 'asc' }],
    include: {
      parentA: { select: { id: true, firstName: true, middleName: true, lastName: true } },
      parentB: { select: { id: true, firstName: true, middleName: true, lastName: true } },
      representativeUser: { select: { id: true, name: true, email: true } },
    },
  })
}

function toPreviewPerson(person: Pick<FamilyPersonRecord, 'id' | 'firstName' | 'middleName' | 'lastName'>): ManagedFamilyUnitPreviewPerson {
  return {
    id: person.id,
    firstName: person.firstName,
    middleName: person.middleName,
    lastName: person.lastName,
  }
}

function buildManagedPeoplePreview(
  people: readonly FamilyPersonRecord[],
  parentAId: string,
  parentBId: string | null
) {
  const ids = getManagedUnitPersonIdsFromPeople(people, parentAId, parentBId)

  return people
    .filter(person => ids.has(person.id))
    .map(person => toPreviewPerson(person))
}

function buildSuggestedManagedUnitLabel(
  parentA: Pick<FamilyPersonRecord, 'lastName'>,
  parentB: Pick<FamilyPersonRecord, 'lastName'> | null
) {
  if (parentB?.lastName && parentB.lastName !== parentA.lastName) {
    return `Familia ${parentA.lastName} ${parentB.lastName}`
  }

  return `Familia ${parentA.lastName}`
}

async function buildManagedUnitSummary(
  familyId: string,
  unit: ManagedUnitDashboardRecord,
  people?: readonly FamilyPersonRecord[]
): Promise<ManagedFamilyUnitItem> {
  const familyPeople = people ?? await getFamilyPeople(familyId)
  const managedPeople = buildManagedPeoplePreview(familyPeople, unit.parentAId, unit.parentBId)

  return {
    id: unit.id,
    label: unit.label,
    parentA: toPreviewPerson(unit.parentA),
    parentB: unit.parentB ? toPreviewPerson(unit.parentB) : null,
    representativeUserId: unit.representativeUserId,
    representativeUserName: unit.representativeUser?.name ?? null,
    representativeUserEmail: unit.representativeUser?.email ?? null,
    primarySurname: unit.primarySurname,
    secondarySurname: unit.secondarySurname,
    canInviteUsers: unit.canInviteUsers,
    canEditPeople: unit.canEditPeople,
    canManageContent: unit.canManageContent,
    canViewAudit: unit.canViewAudit,
    managedPeople,
  }
}

async function resolveManagedUnitInput(
  familyId: string,
  input: {
    label: string
    parentAId: string
    parentBId: string
    representativeUserId: string
    primarySurname: string
    secondarySurname: string
    canInviteUsers: boolean
    canEditPeople: boolean
    canManageContent: boolean
    canViewAudit: boolean
  }
) {
  const people = await getFamilyPeople(familyId)
  const parentA = people.find(person => person.id === input.parentAId)
  if (!parentA) throw new Error('Parent A no encontrado en esta familia.')

  const parentB = input.parentBId ? people.find(person => person.id === input.parentBId) ?? null : null
  if (input.parentBId && !parentB) throw new Error('Parent B no encontrado en esta familia.')

  const representativeUser = input.representativeUserId
    ? await prisma.user.findFirst({
        where: { id: input.representativeUserId, familyId },
        select: {
          id: true,
          name: true,
          email: true,
          personId: true,
          person: {
            select: {
              id: true,
              lastName: true,
              birthSurname1: true,
              birthSurname2: true,
            },
          },
        },
      })
    : null

  if (input.representativeUserId && !representativeUser) {
    throw new Error('Usuario representante no encontrado.')
  }

  if (representativeUser && !representativeUser.personId) {
    throw new Error('El usuario representante debe estar vinculado a una persona.')
  }

  const managedPeople = buildManagedPeoplePreview(people, parentA.id, parentB?.id ?? null)
  const managedPersonIds = new Set(managedPeople.map(person => person.id))

  if (representativeUser?.personId && !managedPersonIds.has(representativeUser.personId)) {
    throw new Error('El representante debe pertenecer a la unidad administrada.')
  }

  const primarySurname = input.primarySurname.trim() || parentA.lastName
  const secondarySurname = input.secondarySurname.trim() || parentB?.lastName || null

  if (
    representativeUser?.person &&
    !hasCompatibleManagedUnitSurname(
      representativeUser.person.lastName,
      primarySurname,
      secondarySurname,
      representativeUser.person.birthSurname1,
      representativeUser.person.birthSurname2
    )
  ) {
    throw new Error('El representante debe tener un apellido compatible con la unidad familiar.')
  }

  return {
    people,
    parentA,
    parentB,
    representativeUser,
    managedPeople,
    managedPersonIds,
    label: input.label.trim() || buildSuggestedManagedUnitLabel(parentA, parentB),
    primarySurname,
    secondarySurname,
    canInviteUsers: input.canInviteUsers,
    canEditPeople: input.canEditPeople,
    canManageContent: input.canManageContent,
    canViewAudit: input.canViewAudit,
  }
}

export async function getAdminDashboard(): Promise<ActionResult<AdminDashboardData>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  const isAdmin = session.role === 'ADMIN'
  const representedUnits = isAdmin
    ? []
    : await getManagedUnitsDashboardRecords({
        familyId: session.familyId,
        representativeUserId: session.userId,
        canViewAudit: true,
      })

  if (!isAdmin && representedUnits.length === 0) {
    return { ok: false, error: 'Solo administradores o representantes con auditoria pueden entrar aqui.' }
  }

  const [users, people, managedUnits, accessRules, config, auditLogs] = await Promise.all([
    prisma.user.findMany({
      where: { familyId: session.familyId },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    }),
    getFamilyPeople(session.familyId),
    isAdmin
      ? getManagedUnitsDashboardRecords({ familyId: session.familyId })
      : Promise.resolve(representedUnits),
    isAdmin
      ? prisma.accessRule.findMany({
          where: { familyId: session.familyId },
          orderBy: [{ createdAt: 'desc' }],
          include: {
            user: { select: { id: true, name: true } },
            targetPerson: { select: { id: true, firstName: true, middleName: true, lastName: true } },
          },
        })
      : Promise.resolve([]),
    prisma.familyConfig.findUnique({ where: { familyId: session.familyId } }),
    prisma.auditLog.findMany({
      where: { familyId: session.familyId },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: isAdmin ? 40 : 200,
    }),
  ])

  if (!config) return { ok: false, error: 'Configuracion de familia no encontrada.' }

  const managedUnitsSummary = await Promise.all(
    managedUnits.map(unit => buildManagedUnitSummary(session.familyId, unit, people))
  )

  const representedManagedPersonIds = new Set(
    managedUnitsSummary.flatMap(unit => unit.managedPeople.map(person => person.id))
  )
  const representedManagedUnitIds = new Set(managedUnitsSummary.map(unit => unit.id))

  const visiblePeople = isAdmin
    ? people
    : people.filter(person => representedManagedPersonIds.has(person.id))
  const visibleUsers = isAdmin
    ? users
    : users.filter(user => user.personId && representedManagedPersonIds.has(user.personId))

  return {
    ok: true,
    data: {
      familySlug: session.familySlug,
      viewerMode: isAdmin ? 'ADMIN' : 'REPRESENTATIVE',
      users: visibleUsers.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        scope: user.scope,
        branchRootId: user.branchRootId,
        personId: user.personId,
      })),
      people: visiblePeople.map(person => ({
        id: person.id,
        firstName: person.firstName,
        middleName: person.middleName,
        lastName: person.lastName,
        birthDate: person.birthDate ? person.birthDate.toISOString() : null,
        deathDate: person.deathDate ? person.deathDate.toISOString() : null,
      })),
      managedUnits: managedUnitsSummary,
      accessRules: accessRules.map(rule => ({
        id: rule.id,
        userId: rule.userId,
        userName: rule.user?.name ?? null,
        targetPersonId: rule.targetPersonId,
        targetPersonName: getPersonDisplayName(rule.targetPerson),
        effect: rule.effect,
        permission: rule.permission,
        reason: rule.reason,
        createdAt: rule.createdAt.toISOString(),
      })),
      config: {
        moduleStories: config.moduleStories,
        moduleDiary: config.moduleDiary,
        moduleRecipes: config.moduleRecipes,
        moduleMedia: config.moduleMedia,
        moduleObjects: config.moduleObjects,
        moduleLinks: config.moduleLinks,
        moduleAudioVideo: config.moduleAudioVideo,
        moduleExportImport: config.moduleExportImport,
        moduleSearch: config.moduleSearch,
      },
      auditLogs: auditLogs
        .filter(log => isAdmin || auditLogTouchesManagedScope(log, representedManagedPersonIds, representedManagedUnitIds))
        .slice(0, 40)
        .map(log => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        createdAt: log.createdAt.toISOString(),
        userName: log.user.name,
        oldValue: log.oldValue,
        newValue: log.newValue,
      })),
    },
  }
}

export async function createAccessRule(input: {
  userId: string
  targetPersonId: string
  effect: AccessEffect
  permission: AccessPermission
  reason: string
}): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    ensureAdmin(session)

    const userId = input.userId || null
    if (userId) {
      const user = await prisma.user.findFirst({
        where: { id: userId, familyId: session.familyId },
        select: { id: true },
      })
      if (!user) return { ok: false, error: 'Usuario no encontrado.' }
    }

    await assertPersonAccess(input.targetPersonId, session)

    const existing = await prisma.accessRule.findFirst({
      where: {
        familyId: session.familyId,
        userId,
        targetPersonId: input.targetPersonId,
        effect: input.effect,
        permission: input.permission,
      },
      select: { id: true },
    })

    if (existing) {
      return { ok: false, error: 'Ya existe una regla identica para este usuario y persona.' }
    }

    const rule = await prisma.accessRule.create({
      data: {
        familyId: session.familyId,
        userId,
        targetPersonId: input.targetPersonId,
        effect: input.effect,
        permission: input.permission,
        reason: input.reason.trim() || null,
        createdById: session.userId,
      },
    })

    await logAudit({
      familyId: session.familyId,
      userId: session.userId,
      action: 'CREATE_ACCESS_RULE',
      entityType: 'AccessRule',
      entityId: rule.id,
      newValue: {
        userId,
        targetPersonId: input.targetPersonId,
        effect: input.effect,
        permission: input.permission,
        reason: input.reason.trim() || null,
      },
    })

    revalidatePath(`/${session.familySlug}/admin`)
    return { ok: true, data: undefined }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}

export async function deleteAccessRule(ruleId: string): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    ensureAdmin(session)

    const rule = await prisma.accessRule.findFirst({
      where: { id: ruleId, familyId: session.familyId },
      select: {
        id: true,
        userId: true,
        targetPersonId: true,
        effect: true,
        permission: true,
        reason: true,
      },
    })

    if (!rule) return { ok: false, error: 'Regla no encontrada.' }

    await prisma.accessRule.delete({
      where: { id: rule.id },
    })

    await logAudit({
      familyId: session.familyId,
      userId: session.userId,
      action: 'DELETE_ACCESS_RULE',
      entityType: 'AccessRule',
      entityId: rule.id,
      oldValue: rule,
    })

    revalidatePath(`/${session.familySlug}/admin`)
    return { ok: true, data: undefined }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}

export async function previewManagedFamilyUnit(input: {
  label: string
  parentAId: string
  parentBId: string
  representativeUserId: string
  primarySurname: string
  secondarySurname: string
  canInviteUsers: boolean
  canEditPeople: boolean
  canManageContent: boolean
  canViewAudit: boolean
}): Promise<ActionResult<{ label: string; managedPeople: ManagedFamilyUnitPreviewPerson[] }>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    ensureAdmin(session)

    const resolved = await resolveManagedUnitInput(session.familyId, input)
    return {
      ok: true,
      data: {
        label: resolved.label,
        managedPeople: resolved.managedPeople,
      },
    }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}

export async function createManagedFamilyUnit(input: {
  label: string
  parentAId: string
  parentBId: string
  representativeUserId: string
  primarySurname: string
  secondarySurname: string
  canInviteUsers: boolean
  canEditPeople: boolean
  canManageContent: boolean
  canViewAudit: boolean
}): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    ensureAdmin(session)

    const resolved = await resolveManagedUnitInput(session.familyId, input)
    const unit = await prisma.managedFamilyUnit.create({
      data: {
        familyId: session.familyId,
        label: resolved.label,
        parentAId: resolved.parentA.id,
        parentBId: resolved.parentB?.id ?? null,
        representativeUserId: resolved.representativeUser?.id ?? null,
        primarySurname: resolved.primarySurname,
        secondarySurname: resolved.secondarySurname,
        canInviteUsers: resolved.canInviteUsers,
        canEditPeople: resolved.canEditPeople,
        canManageContent: resolved.canManageContent,
        canViewAudit: resolved.canViewAudit,
        createdById: session.userId,
      },
    })

    await logAudit({
      familyId: session.familyId,
      userId: session.userId,
      action: 'CREATE_MANAGED_FAMILY_UNIT',
      entityType: 'ManagedFamilyUnit',
      entityId: unit.id,
      newValue: {
        label: resolved.label,
        parentAId: resolved.parentA.id,
        parentBId: resolved.parentB?.id ?? null,
        representativeUserId: resolved.representativeUser?.id ?? null,
        managedPersonIds: Array.from(resolved.managedPersonIds),
        canInviteUsers: resolved.canInviteUsers,
        canEditPeople: resolved.canEditPeople,
        canManageContent: resolved.canManageContent,
        canViewAudit: resolved.canViewAudit,
      },
    })

    revalidatePath(`/${session.familySlug}/admin`)
    return { ok: true, data: undefined }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}

export async function updateManagedFamilyUnit(input: {
  unitId: string
  label: string
  representativeUserId: string
  primarySurname: string
  secondarySurname: string
  canInviteUsers: boolean
  canEditPeople: boolean
  canManageContent: boolean
  canViewAudit: boolean
}): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    const current = await prisma.managedFamilyUnit.findFirst({
      where: { id: input.unitId, familyId: session.familyId },
      include: {
        parentA: { select: { id: true, firstName: true, lastName: true } },
        parentB: { select: { id: true, firstName: true, lastName: true } },
      },
    })

    if (!current) return { ok: false, error: 'Unidad familiar no encontrada.' }

    const isAdmin = session.role === 'ADMIN'
    const isCurrentRepresentative = current.representativeUserId === session.userId

    if (!isAdmin && !isCurrentRepresentative) {
      return { ok: false, error: 'Solo el administrador o el representante actual pueden actualizar esta unidad.' }
    }

    if (!isAdmin) {
      const changedRestrictedFields =
        current.label !== input.label ||
        (current.primarySurname ?? '') !== input.primarySurname ||
        (current.secondarySurname ?? '') !== input.secondarySurname ||
        current.canInviteUsers !== input.canInviteUsers ||
        current.canEditPeople !== input.canEditPeople ||
        current.canManageContent !== input.canManageContent ||
        current.canViewAudit !== input.canViewAudit

      if (changedRestrictedFields) {
        return { ok: false, error: 'El representante actual solo puede transferir la representacion.' }
      }
    }

    const resolved = await resolveManagedUnitInput(session.familyId, {
      label: input.label,
      parentAId: current.parentAId,
      parentBId: current.parentBId ?? '',
      representativeUserId: input.representativeUserId,
      primarySurname: input.primarySurname,
      secondarySurname: input.secondarySurname,
      canInviteUsers: input.canInviteUsers,
      canEditPeople: input.canEditPeople,
      canManageContent: input.canManageContent,
      canViewAudit: input.canViewAudit,
    })

    const updated = await prisma.managedFamilyUnit.update({
      where: { id: current.id },
      data: {
        label: resolved.label,
        representativeUserId: resolved.representativeUser?.id ?? null,
        primarySurname: resolved.primarySurname,
        secondarySurname: resolved.secondarySurname,
        canInviteUsers: resolved.canInviteUsers,
        canEditPeople: resolved.canEditPeople,
        canManageContent: resolved.canManageContent,
        canViewAudit: resolved.canViewAudit,
      },
    })

    await logAudit({
      familyId: session.familyId,
      userId: session.userId,
      action: 'UPDATE_MANAGED_FAMILY_UNIT',
      entityType: 'ManagedFamilyUnit',
      entityId: updated.id,
      oldValue: {
        label: current.label,
        representativeUserId: current.representativeUserId,
        primarySurname: current.primarySurname,
        secondarySurname: current.secondarySurname,
        canInviteUsers: current.canInviteUsers,
        canEditPeople: current.canEditPeople,
        canManageContent: current.canManageContent,
        canViewAudit: current.canViewAudit,
      },
      newValue: {
        label: updated.label,
        representativeUserId: updated.representativeUserId,
        primarySurname: updated.primarySurname,
        secondarySurname: updated.secondarySurname,
        canInviteUsers: updated.canInviteUsers,
        canEditPeople: updated.canEditPeople,
        canManageContent: updated.canManageContent,
        canViewAudit: updated.canViewAudit,
      },
    })

    revalidatePath(`/${session.familySlug}/admin`)
    return { ok: true, data: undefined }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}

export async function updateUserAccess(input: {
  userId: string
  role: UserRole
  scope: UserScope
  branchRootId: string
  personId: string
}): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    ensureAdmin(session)

    const user = await prisma.user.findUnique({ where: { id: input.userId } })
    if (!user || user.familyId !== session.familyId) {
      return { ok: false, error: 'Usuario no encontrado.' }
    }

    const branchRootId = input.scope === 'BRANCH' ? (input.branchRootId || null) : null
    const personId = input.personId || null

    if (branchRootId) await assertPersonAccess(branchRootId, session)
    if (personId) await assertPersonAccess(personId, session)

    const updated = await prisma.user.update({
      where: { id: input.userId },
      data: {
        role: input.role,
        scope: input.scope,
        branchRootId,
        personId,
      },
    })

    await logAudit({
      familyId: session.familyId,
      userId: session.userId,
      action: 'UPDATE_USER_ACCESS',
      entityType: 'User',
      entityId: updated.id,
      oldValue: {
        role: user.role,
        scope: user.scope,
        branchRootId: user.branchRootId,
        personId: user.personId,
      },
      newValue: {
        role: updated.role,
        scope: updated.scope,
        branchRootId: updated.branchRootId,
        personId: updated.personId,
      },
    })

    revalidatePath(`/${session.familySlug}/admin`)
    return { ok: true, data: undefined }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}

export async function updateFamilyConfig(input: FamilyConfigData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    ensureAdmin(session)

    const current = await prisma.familyConfig.findUnique({ where: { familyId: session.familyId } })
    if (!current) return { ok: false, error: 'Configuracion no encontrada.' }

    const updated = await prisma.familyConfig.update({
      where: { familyId: session.familyId },
      data: input,
    })

    await logAudit({
      familyId: session.familyId,
      userId: session.userId,
      action: 'UPDATE_FAMILY_CONFIG',
      entityType: 'FamilyConfig',
      entityId: updated.id,
      oldValue: current,
      newValue: input,
    })

    revalidatePath(`/${session.familySlug}/admin`)
    return { ok: true, data: undefined }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}

export async function createInviteLink(input: {
  role: UserRole
  scope: UserScope
  branchRootId: string
}): Promise<ActionResult<{ url: string }>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    ensureAdmin(session)

    const branchRootId = input.scope === 'BRANCH' ? (input.branchRootId || null) : null
    if (branchRootId) await assertPersonAccess(branchRootId, session)

    const { token } = await signInviteToken({
      familyId: session.familyId,
      familySlug: session.familySlug,
      role: input.role,
      scope: input.scope,
      branchRootId,
    })

    await logAudit({
      familyId: session.familyId,
      userId: session.userId,
      action: 'CREATE_INVITE_LINK',
      entityType: 'Invite',
      entityId: token.slice(0, 12),
      newValue: {
        role: input.role,
        scope: input.scope,
        branchRootId,
      },
    })

    return { ok: true, data: { url: `/invite/${token}` } }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}

export async function importRelationsJson(input: {
  jsonText: string
}): Promise<ActionResult<{ updatedPeople: number }>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    ensureAdmin(session)

    const jsonText = input.jsonText.trim()
    if (!jsonText) {
      return { ok: false, error: 'Pega el JSON o carga un archivo antes de importar.' }
    }

    const payload = parseRelationsJsonPayload(jsonText)
    if (payload.familySlug !== session.familySlug) {
      return { ok: false, error: 'El JSON pertenece a otra familia.' }
    }

    const people = await prisma.person.findMany({
      where: { familyId: session.familyId },
      select: {
        id: true,
        fatherId: true,
        motherId: true,
      },
    })

    const existingIds = new Set(people.map(person => person.id))
    const plan = planRelationsImport(payload, existingIds)

    if (plan.duplicateIds.length > 0) {
      return { ok: false, error: `El JSON repite personas: ${plan.duplicateIds.slice(0, 5).join(', ')}` }
    }
    if (plan.missingPersonIds.length > 0) {
      return { ok: false, error: `Estas personas no existen en la familia actual: ${plan.missingPersonIds.slice(0, 5).join(', ')}` }
    }
    if (plan.missingReferenceIds.length > 0) {
      return { ok: false, error: `Hay referencias de padre o madre que no existen en la familia actual: ${plan.missingReferenceIds.slice(0, 5).join(', ')}` }
    }
    if (plan.selfReferenceIds.length > 0) {
      return { ok: false, error: `Una persona no puede ser su propio padre o madre: ${plan.selfReferenceIds.slice(0, 5).join(', ')}` }
    }

    const currentById = new Map(people.map(person => [person.id, person]))
    const changedUpdates = plan.updates.filter(update => {
      const current = currentById.get(update.id)
      return current && (current.fatherId !== update.fatherId || current.motherId !== update.motherId)
    })

    if (changedUpdates.length === 0) {
      return { ok: true, data: { updatedPeople: 0 } }
    }

    await prisma.$transaction(
      changedUpdates.map(update =>
        prisma.person.update({
          where: { id: update.id },
          data: {
            fatherId: update.fatherId,
            motherId: update.motherId,
          },
        })
      )
    )

    await logAudit({
      familyId: session.familyId,
      userId: session.userId,
      action: 'IMPORT_RELATIONS_JSON',
      entityType: 'Family',
      entityId: session.familyId,
      oldValue: changedUpdates.map(update => ({
        id: update.id,
        fatherId: currentById.get(update.id)?.fatherId ?? null,
        motherId: currentById.get(update.id)?.motherId ?? null,
      })),
      newValue: changedUpdates,
    })

    revalidatePath(`/${session.familySlug}/tree`)
    revalidatePath(`/${session.familySlug}/admin`)
    for (const update of changedUpdates) {
      revalidatePath(`/${session.familySlug}/person/${update.id}`)
      revalidatePath(`/${session.familySlug}/person/${update.id}/edit`)
    }

    return { ok: true, data: { updatedPeople: changedUpdates.length } }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}
