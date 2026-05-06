'use server'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import {
  assertCanEditPerson,
  assertCanManagePerson,
  assertPersonAccess,
  canChangeRelationships,
  canCreatePerson,
  getVisiblePersonIds,
} from '@/lib/permissions'
import { logAudit } from '@/lib/audit'
import { getPersonDisplayName } from '@/lib/person-name'
import { CLAIMED_RELATION_REQUIRES_REF } from '@/lib/content-types'
import type {
  ActionResult,
  ClaimedRelation,
  ManagedUnitOption,
  MediaItem,
  PersonEditorPayload,
  PersonFormData,
  PersonKind,
  PersonOption,
  RelationshipItem,
  Gender,
} from '@/lib/content-types'
import { revalidatePath } from 'next/cache'

function serializeDate(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : ''
}

function serializeOption(p: {
  id: string
  firstName: string
  middleName: string | null
  lastName: string
  birthDate: Date | null
  deathDate: Date | null
  gender: Gender
  fatherId: string | null
  motherId: string | null
  nodeKind: PersonKind
}): PersonOption {
  return {
    id: p.id,
    firstName: p.firstName,
    middleName: p.middleName,
    lastName: p.lastName,
    birthDate: p.birthDate ? p.birthDate.toISOString() : null,
    deathDate: p.deathDate ? p.deathDate.toISOString() : null,
    gender: p.gender,
    fatherId: p.fatherId,
    motherId: p.motherId,
    nodeKind: p.nodeKind,
  }
}

function serializeMedia(m: {
  id: string
  url: string
  alt: string | null
  caption: string | null
  featured: boolean
  order: number
  mimeType: string
}): MediaItem {
  return {
    id: m.id,
    url: m.url,
    alt: m.alt,
    caption: m.caption,
    featured: m.featured,
    order: m.order,
    mimeType: m.mimeType,
  }
}

function normalizeText(value: string | undefined): string {
  return value?.trim() ?? ''
}

function parseGender(value: string | undefined): Gender {
  if (value === 'MALE' || value === 'FEMALE' || value === 'OTHER') return value
  return 'UNKNOWN'
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

async function getVisiblePeopleForEditor(session: NonNullable<Awaited<ReturnType<typeof getSession>>>) {
  const visibleIds = await getVisiblePersonIds(session)
  return prisma.person.findMany({
    where: {
      familyId: session.familyId,
      deletedAt: null,        // soft delete: ocultas en el selector
      ...(visibleIds ? { id: { in: [...visibleIds] } } : {}),
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: {
      id: true,
      firstName: true,
      middleName: true,
      lastName: true,
      birthDate: true,
      deathDate: true,
      gender: true,
      fatherId: true,
      motherId: true,
      nodeKind: true,
    },
  })
}

async function validateParent(
  parentId: string | undefined,
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
  currentPersonId?: string
) {
  if (!parentId) return null
  if (parentId === currentPersonId) throw new Error('Una persona no puede ser su propio padre o madre.')
  await assertPersonAccess(parentId, session)
  return parentId
}

function validateDates(birthDate: Date | null, deathDate: Date | null): string | null {
  if (birthDate && deathDate && deathDate < birthDate) {
    return 'La fecha de fallecimiento no puede ser anterior a la fecha de nacimiento.'
  }
  return null
}

async function assertNoCycle(
  childId: string,
  fatherId: string | null,
  motherId: string | null,
  familyId: string
): Promise<void> {
  if (!fatherId && !motherId) return

  const allPersons = await prisma.person.findMany({
    where: { familyId },
    select: { id: true, fatherId: true, motherId: true },
  })

  const childrenOf = new Map<string, Set<string>>()
  for (const p of allPersons) {
    for (const pid of [p.fatherId, p.motherId]) {
      if (!pid) continue
      if (!childrenOf.has(pid)) childrenOf.set(pid, new Set())
      childrenOf.get(pid)!.add(p.id)
    }
  }

  const isDescendant = (start: string, target: string): boolean => {
    const visited = new Set<string>()
    const queue = [start]
    while (queue.length > 0) {
      const current = queue.shift()!
      if (current === target) return true
      if (visited.has(current)) continue
      visited.add(current)
      for (const c of childrenOf.get(current) ?? []) queue.push(c)
    }
    return false
  }

  if (fatherId && isDescendant(childId, fatherId)) {
    throw new Error('No se puede asignar este padre porque crearía un ciclo en el árbol.')
  }
  if (motherId && isDescendant(childId, motherId)) {
    throw new Error('No se puede asignar esta madre porque crearía un ciclo en el árbol.')
  }
}

function revalidateFamilyPaths(familySlug: string, personId?: string) {
  revalidatePath(`/${familySlug}/tree`)
  revalidatePath(`/${familySlug}/admin`)
  if (personId) {
    revalidatePath(`/${familySlug}/person/${personId}`)
    revalidatePath(`/${familySlug}/person/${personId}/edit`)
  }
}

export async function getPersonEditorPayload(personId?: string): Promise<ActionResult<PersonEditorPayload>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    if (personId) await assertCanEditPerson(personId, session)
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }

  const [candidates, person, media, managedUnitsRaw, relationshipsRaw] = await Promise.all([
    getVisiblePeopleForEditor(session),
    personId
      ? prisma.person.findUnique({
          where: { id: personId },
          include: { media: { orderBy: [{ featured: 'desc' }, { order: 'asc' }] } },
        })
      : Promise.resolve(null),
    personId
      ? prisma.media.findMany({ where: { personId }, orderBy: [{ featured: 'desc' }, { order: 'asc' }] })
      : Promise.resolve([]),
    prisma.managedFamilyUnit.findMany({
      where: { familyId: session.familyId, representativeUserId: session.userId },
      select: { id: true, label: true },
    }),
    personId
      ? prisma.relationship.findMany({
          where: { familyId: session.familyId, OR: [{ person1Id: personId }, { person2Id: personId }] },
          include: {
            person1: { select: { id: true, firstName: true, middleName: true, lastName: true } },
            person2: { select: { id: true, firstName: true, middleName: true, lastName: true } },
          },
        })
      : Promise.resolve([]),
  ])

  if (personId && (!person || person.familyId !== session.familyId)) {
    return { ok: false, error: 'Persona no encontrada' }
  }

  const isAdmin = session.role === 'ADMIN' || session.scope === 'ADMIN'
  const isRepresentative = !isAdmin && managedUnitsRaw.length > 0
  const viewerMode: 'ADMIN' | 'REPRESENTATIVE' | 'MEMBER' = isAdmin
    ? 'ADMIN'
    : isRepresentative ? 'REPRESENTATIVE' : 'MEMBER'

  const canChangeRel = personId
    ? await canChangeRelationships(session, personId)
    : isAdmin || isRepresentative

  const managedUnits: ManagedUnitOption[] = managedUnitsRaw.map(u => ({ id: u.id, label: u.label }))

  return {
    ok: true,
    data: {
      familySlug: session.familySlug,
      viewerMode,
      canChangeRelationships: canChangeRel,
      managedUnits,
      person: person
        ? {
            id: person.id,
            firstName: person.firstName,
            middleName: person.middleName ?? '',
            lastName: person.lastName,
            birthSurname1: person.birthSurname1 ?? '',
            birthSurname2: person.birthSurname2 ?? '',
            birthDate: serializeDate(person.birthDate),
            deathDate: serializeDate(person.deathDate),
            birthPlace: person.birthPlace ?? '',
            gender: person.gender,
            nodeKind: (person.nodeKind ?? 'PERSON') as 'PERSON' | 'PET',
            bio: person.bio ?? '',
            fatherId: person.fatherId ?? '',
            motherId: person.motherId ?? '',
            coverPhoto: person.coverPhoto ?? '',
            isCore: person.isCore,
            unitAffiliationId: person.unitAffiliationId ?? '',
            claimedRelation: person.claimedRelation ?? '',
            claimedRelationOfId: person.claimedRelationOfId ?? '',
          }
        : null,
      candidates: candidates.filter(c => c.id !== personId).map(serializeOption),
      media: media.map(serializeMedia),
      relationships: relationshipsRaw.map((r): RelationshipItem => {
        const partner = r.person1Id === personId ? r.person2 : r.person1
        return {
          id: r.id,
          type: r.type as 'SPOUSE' | 'PARTNER' | 'SIBLING',
          partnerId: partner.id,
          partnerName: getPersonDisplayName(partner),
          endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : null,
        }
      }),
    },
  }
}

export async function createRelationship(input: {
  personId: string
  partnerId: string
  type: 'SPOUSE' | 'PARTNER' | 'SIBLING'
}): Promise<ActionResult<{ id: string }>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    const isAdmin = session.role === 'ADMIN' || session.scope === 'ADMIN'
    if (!isAdmin) return { ok: false, error: 'Solo administradores pueden gestionar relaciones.' }

    if (input.personId === input.partnerId) {
      return { ok: false, error: 'Una persona no puede tener relación consigo misma.' }
    }

    const [p1, p2] = await Promise.all([
      prisma.person.findFirst({ where: { id: input.personId, familyId: session.familyId }, select: { id: true, firstName: true, lastName: true, gender: true } }),
      prisma.person.findFirst({ where: { id: input.partnerId, familyId: session.familyId }, select: { id: true, firstName: true, lastName: true, gender: true } }),
    ])
    if (!p1 || !p2) return { ok: false, error: 'Persona no encontrada en esta familia.' }

    const [id1, id2] = [input.personId, input.partnerId].sort()
    const rel = await prisma.relationship.create({
      data: { familyId: session.familyId, person1Id: id1, person2Id: id2, type: input.type },
    })

    // Sibling relationships: no managed family unit, just revalidate and return
    if (input.type === 'SIBLING') {
      revalidatePath(`/${session.familySlug}/person/${input.personId}/edit`)
      revalidatePath(`/${session.familySlug}/tree`)
      return { ok: true, data: { id: rel.id } }
    }

    // Auto-create managed family unit if one doesn't exist for this couple
    const existingUnit = await prisma.managedFamilyUnit.findFirst({
      where: {
        familyId: session.familyId,
        OR: [
          { parentAId: input.personId, parentBId: input.partnerId },
          { parentAId: input.partnerId, parentBId: input.personId },
        ],
      },
      select: { id: true },
    })

    if (!existingUnit) {
      // Determine order: MALE first, FEMALE second; if one is FEMALE+other UNKNOWN → UNKNOWN first
      // alphabetical only when both genders are unknown
      let parentA: typeof p1, parentB: typeof p1
      if (p1.gender === 'MALE')        { parentA = p1; parentB = p2 }
      else if (p2.gender === 'MALE')   { parentA = p2; parentB = p1 }
      else if (p1.gender === 'FEMALE') { parentA = p2; parentB = p1 }
      else if (p2.gender === 'FEMALE') { parentA = p1; parentB = p2 }
      else { parentA = p1.lastName <= p2.lastName ? p1 : p2; parentB = parentA.id === p1.id ? p2 : p1 }

      const surnameA = parentA.lastName.split(' ')[0]
      const surnameB = parentB.lastName.split(' ')[0]
      const label = surnameB && surnameB !== surnameA
        ? `Familia ${surnameA} ${surnameB}`
        : `Familia ${surnameA}`

      await prisma.managedFamilyUnit.create({
        data: {
          familyId:        session.familyId,
          label,
          parentAId:       parentA.id,
          parentBId:       parentB.id,
          primarySurname:  surnameA,
          secondarySurname: surnameB !== surnameA ? surnameB : null,
          canInviteUsers:  false,
          canEditPeople:   false,
          canManageContent: false,
          canViewAudit:    false,
          createdById:     session.userId,
        },
      })

      revalidatePath(`/${session.familySlug}/admin`)
    }

    revalidatePath(`/${session.familySlug}/person/${input.personId}/edit`)
    revalidatePath(`/${session.familySlug}/tree`)
    return { ok: true, data: { id: rel.id } }
  } catch (error: unknown) {
    const msg = (error as Error).message
    if (msg.includes('Unique constraint')) return { ok: false, error: 'Ya existe esa relación entre estas personas.' }
    return { ok: false, error: msg }
  }
}

export async function deleteRelationship(input: {
  relationshipId: string
  personId: string
}): Promise<ActionResult<null>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    const isAdmin = session.role === 'ADMIN' || session.scope === 'ADMIN'
    if (!isAdmin) return { ok: false, error: 'Solo administradores pueden gestionar relaciones de pareja.' }

    await prisma.relationship.deleteMany({
      where: { id: input.relationshipId, familyId: session.familyId },
    })

    revalidatePath(`/${session.familySlug}/person/${input.personId}/edit`)
    revalidatePath(`/${session.familySlug}/tree`)
    return { ok: true, data: null }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}

export async function createPerson(input: Omit<PersonFormData, 'id' | 'coverPhoto' | 'isCore'>): Promise<ActionResult<{ id: string }>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  const firstName = normalizeText(input.firstName)
  const lastName = normalizeText(input.lastName)
  const isPet = input.nodeKind === 'PET'
  if (!firstName || (!isPet && !lastName)) {
    return { ok: false, error: 'Nombre y apellido son obligatorios.' }
  }

  try {
    const fatherId = await validateParent(input.fatherId || undefined, session)
    const motherId = await validateParent(input.motherId || undefined, session)

    if (fatherId && motherId && fatherId === motherId) {
      return { ok: false, error: 'Padre y madre deben ser personas distintas.' }
    }

    if (session.role !== 'ADMIN' && session.scope !== 'ADMIN') {
      if (!(await canCreatePerson(session))) {
        return { ok: false, error: 'No tienes permiso para crear personas.' }
      }

      if (!fatherId && !motherId) {
        const unitId = normalizeText(input.unitAffiliationId) || null
        if (!unitId) {
          return { ok: false, error: 'Para crear una persona sin padre ni madre, debes afiliarla a una unidad familiar.' }
        }
        const ownedUnits = await prisma.managedFamilyUnit.findMany({
          where: { familyId: session.familyId, representativeUserId: session.userId },
          select: { id: true },
        })
        if (!ownedUnits.some(u => u.id === unitId)) {
          return { ok: false, error: 'No puedes afiliar la persona a una unidad que no administras.' }
        }
      } else {
        const manageableParentIds = [fatherId, motherId].filter(Boolean) as string[]
        let managesAtLeastOneParent = false
        for (const parentId of manageableParentIds) {
          try {
            await assertCanManagePerson(parentId, session, 'people')
            managesAtLeastOneParent = true
            break
          } catch {
            // keep checking other parent
          }
        }
        if (!managesAtLeastOneParent) {
          return { ok: false, error: 'No puedes crear personas fuera de tu unidad administrada.' }
        }
      }
    }

    let unitAffiliationId: string | null = null
    let claimedRelation: ClaimedRelation | null = null
    let claimedRelationOfId: string | null = null

    if (!fatherId && !motherId) {
      unitAffiliationId = normalizeText(input.unitAffiliationId) || null
      const rawRel = normalizeText(input.claimedRelation) as ClaimedRelation | ''
      claimedRelation = rawRel || null
      claimedRelationOfId = normalizeText(input.claimedRelationOfId) || null
      if (claimedRelation && CLAIMED_RELATION_REQUIRES_REF.has(claimedRelation) && !claimedRelationOfId) {
        return { ok: false, error: 'Este tipo de relación requiere indicar con quién de la unidad.' }
      }
      if (!claimedRelation || !CLAIMED_RELATION_REQUIRES_REF.has(claimedRelation)) {
        claimedRelationOfId = null
      }
    }

    const birthDate = parseDate(input.birthDate)
    const deathDate = parseDate(input.deathDate)
    const dateError = validateDates(birthDate, deathDate)
    if (dateError) return { ok: false, error: dateError }

    const bio = normalizeText(input.bio) || null
    if (bio && bio.length > 5000) return { ok: false, error: 'La biografía no puede superar los 5000 caracteres.' }

    const person = await prisma.person.create({
      data: {
        familyId: session.familyId,
        firstName,
        middleName: normalizeText(input.middleName) || null,
        lastName,
        birthSurname1: normalizeText(input.birthSurname1) || null,
        birthSurname2: normalizeText(input.birthSurname2) || null,
        birthDate,
        deathDate,
        birthPlace: normalizeText(input.birthPlace) || null,
        gender:   parseGender(input.gender),
        nodeKind: input.nodeKind === 'PET' ? 'PET' : 'PERSON',
        bio,
        fatherId,
        motherId,
        unitAffiliationId,
        claimedRelation,
        claimedRelationOfId,
      },
    })

    await logAudit({
      familyId: session.familyId,
      userId: session.userId,
      action: 'CREATE_PERSON',
      entityType: 'Person',
      entityId: person.id,
      newValue: {
        firstName: person.firstName,
        middleName: person.middleName,
        lastName: person.lastName,
        birthSurname1: person.birthSurname1,
        birthSurname2: person.birthSurname2,
        fatherId: person.fatherId,
        motherId: person.motherId,
      },
    })

    revalidateFamilyPaths(session.familySlug, person.id)
    return { ok: true, data: { id: person.id } }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}

export async function updatePerson(input: PersonFormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    await assertCanEditPerson(input.id, session)

    const existing = await prisma.person.findUnique({
      where: { id: input.id },
    })

    if (!existing || existing.familyId !== session.familyId) {
      return { ok: false, error: 'Persona no encontrada.' }
    }

    const firstName = normalizeText(input.firstName)
    const lastName = normalizeText(input.lastName)
    if (!firstName || !lastName) {
      return { ok: false, error: 'Nombre y apellido son obligatorios.' }
    }

    const canChangeRel = await canChangeRelationships(session, input.id)

    let fatherId = existing.fatherId
    let motherId = existing.motherId

    if (canChangeRel) {
      fatherId = await validateParent(input.fatherId || undefined, session, input.id)
      motherId = await validateParent(input.motherId || undefined, session, input.id)
      if (fatherId && motherId && fatherId === motherId) {
        return { ok: false, error: 'Padre y madre deben ser personas distintas.' }
      }
      await assertNoCycle(input.id, fatherId, motherId, session.familyId)
    }

    let unitAffiliationId = existing.unitAffiliationId
    let claimedRelation = existing.claimedRelation
    let claimedRelationOfId = existing.claimedRelationOfId

    if (canChangeRel) {
      if (fatherId || motherId) {
        unitAffiliationId = null
        claimedRelation = null
        claimedRelationOfId = null
      } else {
        unitAffiliationId = normalizeText(input.unitAffiliationId) || null
        const rawRel = normalizeText(input.claimedRelation) as ClaimedRelation | ''
        claimedRelation = rawRel || null
        claimedRelationOfId = normalizeText(input.claimedRelationOfId) || null
        if (claimedRelation && CLAIMED_RELATION_REQUIRES_REF.has(claimedRelation) && !claimedRelationOfId) {
          return { ok: false, error: 'Este tipo de relación requiere indicar con quién de la unidad.' }
        }
        if (!claimedRelation || !CLAIMED_RELATION_REQUIRES_REF.has(claimedRelation)) {
          claimedRelationOfId = null
        }
      }
    }

    const birthDate = parseDate(input.birthDate)
    const deathDate = parseDate(input.deathDate)
    const dateError = validateDates(birthDate, deathDate)
    if (dateError) return { ok: false, error: dateError }

    const bio = normalizeText(input.bio) || null
    if (bio && bio.length > 5000) return { ok: false, error: 'La biografía no puede superar los 5000 caracteres.' }

    const updated = await prisma.person.update({
      where: { id: input.id },
      data: {
        firstName,
        middleName: normalizeText(input.middleName) || null,
        lastName,
        birthSurname1: normalizeText(input.birthSurname1) || null,
        birthSurname2: normalizeText(input.birthSurname2) || null,
        birthDate,
        deathDate,
        birthPlace: normalizeText(input.birthPlace) || null,
        gender:   parseGender(input.gender),
        nodeKind: input.nodeKind === 'PET' ? 'PET' : 'PERSON',
        bio,
        fatherId,
        motherId,
        coverPhoto: normalizeText(input.coverPhoto) || null,
        isCore: session.role === 'ADMIN' ? input.isCore : existing.isCore,
        unitAffiliationId,
        claimedRelation,
        claimedRelationOfId,
      },
    })

    await logAudit({
      familyId: session.familyId,
      userId: session.userId,
      action: 'UPDATE_PERSON',
      entityType: 'Person',
      entityId: updated.id,
      oldValue: {
        firstName: existing.firstName,
        middleName: existing.middleName,
        lastName: existing.lastName,
        birthSurname1: existing.birthSurname1,
        birthSurname2: existing.birthSurname2,
        fatherId: existing.fatherId,
        motherId: existing.motherId,
        coverPhoto: existing.coverPhoto,
        isCore: existing.isCore,
      },
      newValue: {
        firstName: updated.firstName,
        middleName: updated.middleName,
        lastName: updated.lastName,
        birthSurname1: updated.birthSurname1,
        birthSurname2: updated.birthSurname2,
        fatherId: updated.fatherId,
        motherId: updated.motherId,
        coverPhoto: updated.coverPhoto,
        isCore: updated.isCore,
      },
    })

    revalidateFamilyPaths(session.familySlug, updated.id)
    return { ok: true, data: undefined }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}

export async function setPersonCoverPhoto(personId: string, mediaId: string | null): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    await assertCanEditPerson(personId, session)

    let coverPhoto: string | null = null
    if (mediaId) {
      const media = await prisma.media.findUnique({ where: { id: mediaId } })
      if (!media || media.familyId !== session.familyId || media.personId !== personId) {
        return { ok: false, error: 'Imagen no encontrada para esta persona.' }
      }
      coverPhoto = media.url
    }

    await prisma.person.update({
      where: { id: personId },
      data: { coverPhoto },
    })

    revalidateFamilyPaths(session.familySlug, personId)
    return { ok: true, data: undefined }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}

export async function deletePerson(personId: string): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    await assertCanEditPerson(personId, session)

    const person = await prisma.person.findUnique({
      where: { id: personId },
      include: {
        _count: {
          select: {
            childrenAsFather: true,
            childrenAsMother: true,
            content: true,
            media: true,
            importantLinks: true,
          },
        },
        user: true,
      },
    })

    if (!person || person.familyId !== session.familyId) {
      return { ok: false, error: 'Persona no encontrada.' }
    }

    if (
      person._count.childrenAsFather > 0 ||
      person._count.childrenAsMother > 0 ||
      person._count.content > 0 ||
      person._count.media > 0 ||
      person._count.importantLinks > 0 ||
      person.user
    ) {
      return {
        ok: false,
        error: 'Solo se pueden eliminar personas sin hijos, contenido, fotos, relaciones importantes ni usuario asociado.',
      }
    }

    // Soft delete: marca la persona como eliminada pero NO borra del DB.
    // Las relaciones (Relationship) tampoco se borran — quedan colgando, pero
    // el árbol filtra por deletedAt:null antes de pasar al layout, así que
    // person1Id/person2Id de la persona eliminada no aparecerán en personSet
    // y se ignoran automáticamente. Si la persona se restaura, todo vuelve.
    await prisma.person.update({
      where: { id: personId },
      data: {
        deletedAt: new Date(),
        deletedById: session.userId,
      },
    })

    await logAudit({
      familyId: session.familyId,
      userId: session.userId,
      action: 'DELETE_PERSON',
      entityType: 'Person',
      entityId: personId,
      oldValue: {
        firstName: person.firstName,
        middleName: person.middleName,
        lastName: person.lastName,
      },
    })

    revalidateFamilyPaths(session.familySlug)
    return { ok: true, data: undefined }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}

/**
 * Restaura una persona previamente eliminada (deletedAt → null).
 * Solo admins.
 */
export async function restorePerson(personId: string): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    const isAdmin = session.role === 'ADMIN' || session.scope === 'ADMIN'
    if (!isAdmin) return { ok: false, error: 'Solo administradores pueden restaurar personas.' }

    const person = await prisma.person.findUnique({
      where: { id: personId },
      select: { id: true, familyId: true, firstName: true, lastName: true, deletedAt: true },
    })
    if (!person || person.familyId !== session.familyId) {
      return { ok: false, error: 'Persona no encontrada.' }
    }
    if (!person.deletedAt) {
      return { ok: false, error: 'Esta persona no está eliminada.' }
    }

    await prisma.person.update({
      where: { id: personId },
      data: { deletedAt: null, deletedById: null },
    })

    await logAudit({
      familyId: session.familyId,
      userId: session.userId,
      action: 'RESTORE_PERSON',
      entityType: 'Person',
      entityId: personId,
      newValue: { firstName: person.firstName, lastName: person.lastName },
    })

    revalidateFamilyPaths(session.familySlug)
    return { ok: true, data: undefined }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}

export async function setRelationshipEndDate(input: {
  relationshipId: string
  personId: string
  endDate: string | null
}): Promise<ActionResult<null>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    const isAdmin = session.role === 'ADMIN' || session.scope === 'ADMIN'
    if (!isAdmin) return { ok: false, error: 'Solo administradores pueden modificar relaciones de pareja.' }

    const rel = await prisma.relationship.findFirst({
      where: { id: input.relationshipId, familyId: session.familyId },
    })
    if (!rel) return { ok: false, error: 'Relación no encontrada.' }
    if (rel.person1Id !== input.personId && rel.person2Id !== input.personId) {
      return { ok: false, error: 'No autorizado.' }
    }

    const endDate = input.endDate ? new Date(input.endDate) : null
    await prisma.relationship.update({
      where: { id: input.relationshipId },
      data: { endDate },
    })

    revalidateFamilyPaths(session.familySlug)
    return { ok: true, data: null }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}

export async function setParentChild(input: {
  childId: string
  parentId: string
  role: 'father' | 'mother'
}): Promise<ActionResult<null>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    await assertCanEditPerson(input.childId, session)

    const child = await prisma.person.findUnique({ where: { id: input.childId } })
    if (!child || child.familyId !== session.familyId) {
      return { ok: false, error: 'Persona no encontrada.' }
    }

    await validateParent(input.parentId, session, input.childId)

    const data = input.role === 'father'
      ? { fatherId: input.parentId }
      : { motherId: input.parentId }

    await prisma.person.update({ where: { id: input.childId }, data })

    revalidateFamilyPaths(session.familySlug, input.childId)
    return { ok: true, data: null }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cumpleaños del mes
// ─────────────────────────────────────────────────────────────────────────────

export interface MonthBirthday {
  id:        string
  fullName:  string
  day:       number               // día del mes (1-31)
  birthYear: number | null
  age:       number | null        // edad que cumplirá este año (null si falleció o no hay año)
  gender:    'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN'
  isPet:     boolean
  isPast:    boolean              // ya pasó este mes
  isToday:   boolean
  deceased:  boolean
}

/**
 * Devuelve cumpleaños del mes calendario actual de personas en la familia
 * (filtra invisibles según permisos del usuario, y excluye eliminadas).
 *
 * Si `month` se pasa, usa ese mes (1-12); si no, usa el mes actual del servidor.
 *
 * Ordenado por día ascendente. Personas fallecidas se incluyen con
 * `deceased: true` — el frontend decide si mostrarlas o no.
 */
export async function getMonthBirthdays(month?: number): Promise<ActionResult<MonthBirthday[]>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  const visibleIds = await getVisiblePersonIds(session)

  const now = new Date()
  const targetMonth = month ?? (now.getMonth() + 1)   // 1-12
  const today = now.getDate()
  const isCurrentMonth = targetMonth === now.getMonth() + 1
  const currentYear = now.getFullYear()

  // No hay forma directa en Prisma de filtrar por month(birthDate) — traemos
  // los registros con birthDate definida y filtramos en JS. Para una familia
  // de cientos de personas esto es trivial.
  const persons = await prisma.person.findMany({
    where: {
      familyId:  session.familyId,
      deletedAt: null,
      birthDate: { not: null },
      ...(visibleIds ? { id: { in: [...visibleIds] } } : {}),
    },
    select: {
      id:         true,
      firstName:  true,
      middleName: true,
      lastName:   true,
      birthDate:  true,
      deathDate:  true,
      gender:     true,
      nodeKind:   true,
    },
  })

  const result: MonthBirthday[] = []
  for (const p of persons) {
    if (!p.birthDate) continue
    const bd = new Date(p.birthDate)
    if (bd.getMonth() + 1 !== targetMonth) continue

    const day = bd.getDate()
    const birthYear = bd.getFullYear()
    const deceased = p.deathDate != null
    const age = (deceased || !birthYear) ? null : currentYear - birthYear

    result.push({
      id:        p.id,
      fullName:  getPersonDisplayName({ firstName: p.firstName, middleName: p.middleName, lastName: p.lastName }),
      day,
      birthYear: birthYear ?? null,
      age,
      gender:    p.gender as 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN',
      isPet:     p.nodeKind === 'PET',
      isPast:    isCurrentMonth ? day < today : false,
      isToday:   isCurrentMonth && day === today,
      deceased,
    })
  }

  result.sort((a, b) => a.day - b.day)
  return { ok: true, data: result }
}
