'use server'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { assertPersonAccess } from '@/lib/permissions'
import { logAudit } from '@/lib/audit'
import { signInviteToken } from '@/lib/invite'
import { signResetToken } from '@/lib/reset'
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
  PersonCreationProposalItem,
  PersonProposalItem,
  RelationsImportPreview,
  UserRole,
  UserScope,
} from '@/lib/content-types'

const PROPOSAL_FIELD_LABELS: Record<string, string> = {
  firstName: 'Nombre',
  middleName: 'Segundo nombre',
  lastName: 'Apellido',
  gender: 'Género',
  birthDate: 'Fecha de nacimiento',
  deathDate: 'Fecha de fallecimiento',
  birthPlace: 'Lugar de nacimiento',
  bio: 'Biografía',
}

const PROPOSAL_GENDER_LABELS: Record<string, string> = {
  MALE: 'Masculino', FEMALE: 'Femenino', OTHER: 'Otro', UNKNOWN: 'Desconocido',
}

function formatProposalFieldValue(key: string, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (key === 'gender') return PROPOSAL_GENDER_LABELS[value as string] ?? String(value)
  if ((key === 'birthDate' || key === 'deathDate') && typeof value === 'string') {
    try { return new Date(value).toLocaleDateString('es') } catch { return String(value) }
  }
  if (value instanceof Date) return value.toLocaleDateString('es')
  return String(value)
}
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
  gender: import('@prisma/client').Gender
  nodeKind: import('@prisma/client').PersonKind
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
  representativeUser: { id: string; name: string; username: string } | null
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
      gender: true,
      nodeKind: true,
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
      representativeUser: { select: { id: true, name: true, username: true } },
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
  parentA: Pick<FamilyPersonRecord, 'lastName' | 'gender'>,
  parentB: Pick<FamilyPersonRecord, 'lastName' | 'gender'> | null
) {
  // Order: male surname first, female second; unknown → keep as-is (parentA first)
  let first = parentA
  let second = parentB
  if (parentB && parentA.gender !== 'MALE' && parentB.gender === 'MALE') {
    first = parentB
    second = parentA
  }
  const surnameA = first.lastName.split(' ')[0]
  const surnameB = second?.lastName.split(' ')[0]
  if (surnameB && surnameB !== surnameA) {
    return `Familia ${surnameA} ${surnameB}`
  }
  return `Familia ${surnameA}`
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
    representativeUserUsername: unit.representativeUser?.username ?? null,
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
          username: true,
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

  const [proposalsRaw, creationProposalsRaw] = await Promise.all([
    prisma.personUpdateProposal.findMany({
      where: {
        familyId: session.familyId,
        status: 'PENDING',
        ...(isAdmin ? {} : { personId: { in: [...representedManagedPersonIds] } }),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, personId: true, status: true,
        createdAt: true, reviewedAt: true, rejectionReason: true,
        firstName: true, middleName: true, lastName: true,
        gender: true, birthDate: true, deathDate: true,
        birthPlace: true, bio: true, currentValues: true,
        person:     { select: { firstName: true, middleName: true, lastName: true } },
        proposedBy: { select: { name: true } },
      },
    }),
    isAdmin ? prisma.personCreationProposal.findMany({
      where: { familyId: session.familyId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, status: true, createdAt: true, reviewedAt: true, rejectionReason: true,
        firstName: true, lastName: true, middleName: true, gender: true,
        birthDate: true, nodeKind: true, notes: true,
        proposedBy: { select: { name: true } },
        father: { select: { firstName: true, middleName: true, lastName: true } },
        mother: { select: { firstName: true, middleName: true, lastName: true } },
      },
    }) : Promise.resolve([]),
  ])

  const proposals: PersonProposalItem[] = proposalsRaw.map(p => {
    const current = p.currentValues as Record<string, unknown>
    const proposed: Record<string, unknown> = {
      firstName: p.firstName,  middleName: p.middleName, lastName: p.lastName,
      gender: p.gender,
      birthDate: p.birthDate?.toISOString() ?? null,
      deathDate: p.deathDate?.toISOString() ?? null,
      birthPlace: p.birthPlace, bio: p.bio,
    }
    const fields = Object.entries(PROPOSAL_FIELD_LABELS)
      .filter(([key]) => proposed[key] !== null)
      .map(([key, label]) => ({
        key, label,
        currentValue:  formatProposalFieldValue(key, current[key]),
        proposedValue: formatProposalFieldValue(key, proposed[key]),
      }))
    return {
      id: p.id,
      personId: p.personId,
      personName: getPersonDisplayName(p.person),
      proposedByName: p.proposedBy.name,
      status: p.status as 'PENDING',
      createdAt: p.createdAt.toISOString(),
      reviewedAt: p.reviewedAt?.toISOString() ?? null,
      rejectionReason: p.rejectionReason,
      fields,
    }
  })

  return {
    ok: true,
    data: {
      familySlug: session.familySlug,
      viewerMode: isAdmin ? 'ADMIN' : 'REPRESENTATIVE',
      users: visibleUsers.map(user => ({
        id: user.id,
        name: user.name,
        username: user.username,
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
        gender: person.gender,
        fatherId: person.fatherId ?? null,
        motherId: person.motherId ?? null,
        nodeKind: person.nodeKind,
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
      proposals,
      creationProposals: creationProposalsRaw.map(p => ({
        id: p.id,
        proposedByName: p.proposedBy.name,
        status: p.status as 'PENDING',
        createdAt: p.createdAt.toISOString(),
        reviewedAt: p.reviewedAt?.toISOString() ?? null,
        rejectionReason: p.rejectionReason,
        firstName: p.firstName,
        lastName: p.lastName,
        middleName: p.middleName,
        gender: p.gender as string | null,
        birthDate: p.birthDate?.toISOString() ?? null,
        nodeKind: p.nodeKind as 'PERSON' | 'PET',
        notes: p.notes,
        fatherName: p.father ? getPersonDisplayName(p.father) : null,
        motherName: p.mother ? getPersonDisplayName(p.mother) : null,
      })) satisfies PersonCreationProposalItem[],
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
  personId?: string
}): Promise<ActionResult<{ url: string }>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    ensureAdmin(session)

    const branchRootId = input.scope === 'BRANCH' ? (input.branchRootId || null) : null
    if (branchRootId) await assertPersonAccess(branchRootId, session)

    const personId = input.personId || null
    if (personId) await assertPersonAccess(personId, session)

    const { token } = await signInviteToken({
      familyId: session.familyId,
      familySlug: session.familySlug,
      role: input.role,
      scope: input.scope,
      branchRootId,
      personId,
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
        personId: personId ?? undefined,
      },
    })

    const host = process.env.APP_HOSTNAME
      ? `https://${process.env.APP_HOSTNAME}`
      : 'http://localhost:3000'
    return { ok: true, data: { url: `${host}/invite/${token}` } }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}

export async function createPasswordResetLink(userId: string): Promise<ActionResult<{ url: string; username: string }>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    ensureAdmin(session)

    const user = await prisma.user.findFirst({
      where: { id: userId, familyId: session.familyId },
      select: { id: true, username: true, name: true },
    })
    if (!user) return { ok: false, error: 'Usuario no encontrado.' }

    const { token } = await signResetToken(user.id, session.familyId)

    await logAudit({
      familyId: session.familyId,
      userId: session.userId,
      action: 'CREATE_PASSWORD_RESET_LINK',
      entityType: 'User',
      entityId: user.id,
      newValue: { targetUsername: user.username },
    })

    const host = process.env.APP_HOSTNAME
      ? `https://${process.env.APP_HOSTNAME}`
      : 'http://localhost:3000'
    return { ok: true, data: { url: `${host}/reset/${token}`, username: user.username } }
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

export async function bulkCreatePeopleJson(input: {
  jsonText: string
}): Promise<ActionResult<{ created: number; updated: number }>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    ensureAdmin(session)

    const jsonText = input.jsonText.trim()
    if (!jsonText) return { ok: false, error: 'El JSON está vacío.' }

    let raw: unknown
    try { raw = JSON.parse(jsonText) } catch { return { ok: false, error: 'JSON inválido.' } }

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: 'El JSON debe ser un objeto.' }
    }

    const payload = raw as Record<string, unknown>
    if (typeof payload.familySlug !== 'string' || payload.familySlug.trim() !== session.familySlug) {
      return { ok: false, error: `El JSON dice familySlug="${payload.familySlug}" pero esta familia es "${session.familySlug}".` }
    }

    if (!Array.isArray(payload.people)) {
      return { ok: false, error: 'Falta el array "people" en el JSON.' }
    }

    const jsonPeople = payload.people as Record<string, unknown>[]
    for (const p of jsonPeople) {
      if (!p || typeof p.id !== 'string' || !p.id.trim()) {
        return { ok: false, error: 'Cada persona debe tener un campo "id" no vacío.' }
      }
    }

    const jsonIds = jsonPeople.map(p => (p.id as string).trim())
    const seen = new Set<string>()
    for (const id of jsonIds) {
      if (seen.has(id)) return { ok: false, error: `ID duplicado en el JSON: ${id}` }
      seen.add(id)
    }

    const existingPeople = await prisma.person.findMany({
      where: { familyId: session.familyId },
      select: { id: true },
    })
    const existingIds = new Set(existingPeople.map(p => p.id))

    // Build mapping: jsonId → real DB id
    const idMap = new Map<string, string>()
    for (const jsonId of jsonIds) {
      idMap.set(jsonId, existingIds.has(jsonId) ? jsonId : crypto.randomUUID().replace(/-/g, ''))
    }

    const resolveRef = (val: unknown): string | null => {
      if (!val || typeof val !== 'string' || !val.trim()) return null
      return idMap.get(val.trim()) ?? null
    }

    const trim = (val: unknown): string | null => {
      if (typeof val !== 'string') return null
      return val.trim() || null
    }

    const VALID_GENDERS   = new Set(['MALE', 'FEMALE', 'OTHER', 'UNKNOWN'])
    const VALID_NODEKINDS = new Set(['PERSON', 'PET'])

    const toParseDate = (val: unknown): Date | null => {
      if (!val || typeof val !== 'string' || !val.trim()) return null
      const d = new Date(val.trim())
      return isNaN(d.getTime()) ? null : d
    }

    type CreateData = {
      id: string
      firstName: string; lastName: string; middleName: string | null
      birthSurname1: string | null; birthSurname2: string | null
      gender: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN'
      nodeKind: 'PERSON' | 'PET'
      birthDate: Date | null; deathDate: Date | null; birthPlace: string | null
    }
    type RelUpdate = { id: string; fatherId: string | null; motherId: string | null }

    const toCreate: CreateData[] = []
    const allRelUpdates: RelUpdate[] = []

    for (const p of jsonPeople) {
      const jsonId = (p.id as string).trim()
      const realId = idMap.get(jsonId)!
      const isNew = !existingIds.has(jsonId)

      if (isNew) {
        const rawGender   = typeof p.gender   === 'string' ? p.gender.trim().toUpperCase()   : ''
        const rawNodeKind = typeof p.nodeKind === 'string' ? p.nodeKind.trim().toUpperCase() : ''
        toCreate.push({
          id:           realId,
          firstName:    typeof p.firstName === 'string' ? p.firstName.trim() : '',
          lastName:     typeof p.lastName  === 'string' ? p.lastName.trim()  : '',
          middleName:   trim(p.middleName),
          birthSurname1: trim(p.birthSurname1),
          birthSurname2: trim(p.birthSurname2),
          gender:       (VALID_GENDERS.has(rawGender)     ? rawGender   : 'UNKNOWN') as 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN',
          nodeKind:     (VALID_NODEKINDS.has(rawNodeKind) ? rawNodeKind : 'PERSON')  as 'PERSON' | 'PET',
          birthDate:    toParseDate(p.birthDate),
          deathDate:    toParseDate(p.deathDate),
          birthPlace:   trim(p.birthPlace),
        })
      }
      allRelUpdates.push({ id: realId, fatherId: resolveRef(p.fatherId), motherId: resolveRef(p.motherId) })
    }

    await prisma.$transaction([
      ...toCreate.map(person =>
        prisma.person.create({
          data: {
            id:           person.id,
            familyId:     session.familyId,
            firstName:    person.firstName,
            lastName:     person.lastName,
            middleName:   person.middleName,
            birthSurname1: person.birthSurname1,
            birthSurname2: person.birthSurname2,
            gender:       person.gender,
            nodeKind:     person.nodeKind,
            birthDate:    person.birthDate,
            deathDate:    person.deathDate,
            birthPlace:   person.birthPlace,
          },
        })
      ),
      ...allRelUpdates.map(u =>
        prisma.person.update({ where: { id: u.id }, data: { fatherId: u.fatherId, motherId: u.motherId } })
      ),
    ])

    const updatedExisting = allRelUpdates.length - toCreate.length

    await logAudit({
      familyId: session.familyId,
      userId: session.userId,
      action: 'BULK_CREATE_PEOPLE_JSON',
      entityType: 'Family',
      entityId: session.familyId,
      newValue: { created: toCreate.length, updated: updatedExisting },
    })

    revalidatePath(`/${session.familySlug}/tree`)
    revalidatePath(`/${session.familySlug}/admin`)

    return { ok: true, data: { created: toCreate.length, updated: updatedExisting } }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}

export async function previewRelationsImport(input: {
  jsonText: string
}): Promise<ActionResult<RelationsImportPreview>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    ensureAdmin(session)

    const jsonText = input.jsonText.trim()
    if (!jsonText) {
      return { ok: false, error: 'Pega el JSON o carga un archivo antes de previsualizar.' }
    }

    const payload = parseRelationsJsonPayload(jsonText)
    if (payload.familySlug !== session.familySlug) {
      return { ok: false, error: 'El JSON pertenece a otra familia.' }
    }

    const people = await prisma.person.findMany({
      where: { familyId: session.familyId },
      select: { id: true, firstName: true, middleName: true, lastName: true, fatherId: true, motherId: true },
    })

    const existingIds = new Set(people.map(p => p.id))
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

    const byId = new Map(people.map(p => [p.id, p]))
    const resolveName = (id: string | null): string | null => {
      if (!id) return null
      const p = byId.get(id)
      return p ? getPersonDisplayName(p) : null
    }

    const changes = plan.updates
      .filter(update => {
        const current = byId.get(update.id)
        return current && (current.fatherId !== update.fatherId || current.motherId !== update.motherId)
      })
      .map(update => {
        const current = byId.get(update.id)!
        return {
          personId: update.id,
          personName: getPersonDisplayName(current),
          currentFatherId: current.fatherId,
          currentFatherName: resolveName(current.fatherId),
          newFatherId: update.fatherId,
          newFatherName: resolveName(update.fatherId),
          currentMotherId: current.motherId,
          currentMotherName: resolveName(current.motherId),
          newMotherId: update.motherId,
          newMotherName: resolveName(update.motherId),
        }
      })

    return {
      ok: true,
      data: {
        totalInFile: payload.people.length,
        changesCount: changes.length,
        changes,
      },
    }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}

// ── Auto-create ManagedFamilyUnit for all existing couples without one ─────────

export async function bulkAutoCreateFamilyUnits(): Promise<ActionResult<{ created: number }>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }
  try {
    ensureAdmin(session)

    // Fetch all relationships for this family with person gender + lastName
    const relationships = await prisma.relationship.findMany({
      where: { person1: { familyId: session.familyId } },
      select: {
        person1Id: true,
        person2Id: true,
        person1: { select: { id: true, firstName: true, lastName: true, gender: true } },
        person2: { select: { id: true, firstName: true, lastName: true, gender: true } },
      },
    })

    // Fetch all existing units so we can skip already-covered pairs
    const existingUnits = await prisma.managedFamilyUnit.findMany({
      where: { familyId: session.familyId },
      select: { parentAId: true, parentBId: true },
    })
    const covered = new Set(
      existingUnits.map(u => [u.parentAId, u.parentBId].sort().join('|'))
    )

    let created = 0
    for (const rel of relationships) {
      const key = [rel.person1Id, rel.person2Id].sort().join('|')
      if (covered.has(key)) continue

      const p1 = rel.person1
      const p2 = rel.person2
      const male   = p1.gender === 'MALE'   ? p1 : p2.gender === 'MALE'   ? p2 : null
      const female = p1.gender === 'FEMALE' ? p1 : p2.gender === 'FEMALE' ? p2 : null
      const parentA = male ?? (p1.lastName <= p2.lastName ? p1 : p2)
      const parentB = parentA.id === p1.id ? p2 : p1

      const surnameA = parentA.lastName.split(' ')[0]
      const surnameB = parentB.lastName.split(' ')[0]
      const label = surnameB && surnameB !== surnameA
        ? `Familia ${surnameA} ${surnameB}`
        : `Familia ${surnameA}`

      await prisma.managedFamilyUnit.create({
        data: {
          familyId: session.familyId,
          label,
          parentAId: parentA.id,
          parentBId: parentB.id,
          canInviteUsers: true,
          canEditPeople: true,
          canManageContent: true,
          canViewAudit: false,
        },
      })
      covered.add(key)
      created++
    }

    return { ok: true, data: { created } }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}
