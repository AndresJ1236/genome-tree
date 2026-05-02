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
import { notifyFamilyMembers } from '@/lib/notifications'
import { getPersonDisplayName } from '@/lib/person-name'
import { CLAIMED_RELATION_REQUIRES_REF } from '@/lib/content-types'
import type {
  ActionResult,
  ClaimedRelation,
  ManagedUnitOption,
  MediaItem,
  PersonEditorPayload,
  PersonFormData,
  PersonOption,
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
}): PersonOption {
  return {
    id: p.id,
    firstName: p.firstName,
    middleName: p.middleName,
    lastName: p.lastName,
    birthDate: p.birthDate ? p.birthDate.toISOString() : null,
    deathDate: p.deathDate ? p.deathDate.toISOString() : null,
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

  const [candidates, person, media, managedUnitsRaw] = await Promise.all([
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
    },
  }
}

export async function createPerson(input: Omit<PersonFormData, 'id' | 'coverPhoto' | 'isCore'>): Promise<ActionResult<{ id: string }>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  const firstName = normalizeText(input.firstName)
  const lastName = normalizeText(input.lastName)
  if (!firstName || !lastName) {
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

    const person = await prisma.person.create({
      data: {
        familyId: session.familyId,
        firstName,
        middleName: normalizeText(input.middleName) || null,
        lastName,
        birthSurname1: normalizeText(input.birthSurname1) || null,
        birthSurname2: normalizeText(input.birthSurname2) || null,
        birthDate: parseDate(input.birthDate),
        deathDate: parseDate(input.deathDate),
        birthPlace: normalizeText(input.birthPlace) || null,
        gender: parseGender(input.gender),
        bio: normalizeText(input.bio) || null,
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

    void notifyFamilyMembers({
      familyId: session.familyId,
      type:     'NEW_PERSON_ADDED',
      title:    'Nueva persona añadida al árbol',
      body:     getPersonDisplayName(person),
      href:     `/${session.familySlug}/person/${person.id}`,
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

    const updated = await prisma.person.update({
      where: { id: input.id },
      data: {
        firstName,
        middleName: normalizeText(input.middleName) || null,
        lastName,
        birthSurname1: normalizeText(input.birthSurname1) || null,
        birthSurname2: normalizeText(input.birthSurname2) || null,
        birthDate: parseDate(input.birthDate),
        deathDate: parseDate(input.deathDate),
        birthPlace: normalizeText(input.birthPlace) || null,
        gender: parseGender(input.gender),
        bio: normalizeText(input.bio) || null,
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

    await prisma.$transaction([
      prisma.relationship.deleteMany({
        where: {
          OR: [{ person1Id: personId }, { person2Id: personId }],
        },
      }),
      prisma.person.delete({ where: { id: personId } }),
    ])

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
