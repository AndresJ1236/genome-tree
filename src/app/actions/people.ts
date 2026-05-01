'use server'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { assertCanEditPerson, assertCanManagePerson, assertPersonAccess, getVisiblePersonIds } from '@/lib/permissions'
import { logAudit } from '@/lib/audit'
import type {
  ActionResult,
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

  const [candidates, person, media] = await Promise.all([
    getVisiblePeopleForEditor(session),
    personId
      ? prisma.person.findUnique({
          where: { id: personId },
          include: {
            media: {
              orderBy: [{ featured: 'desc' }, { order: 'asc' }],
            },
          },
        })
      : Promise.resolve(null),
    personId
      ? prisma.media.findMany({
          where: { personId },
          orderBy: [{ featured: 'desc' }, { order: 'asc' }],
        })
      : Promise.resolve([]),
  ])

  if (personId && (!person || person.familyId !== session.familyId)) {
    return { ok: false, error: 'Persona no encontrada' }
  }

  return {
    ok: true,
    data: {
      familySlug: session.familySlug,
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
          }
        : null,
      candidates: candidates
        .filter(candidate => candidate.id !== personId)
        .map(serializeOption),
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

    if (session.scope === 'BRANCH' && !fatherId && !motherId) {
      return { ok: false, error: 'Para usuarios de rama, la nueva persona debe conectarse a un padre o madre visible.' }
    }

    if (session.role !== 'ADMIN') {
      const manageableParentIds = [fatherId, motherId].filter(Boolean) as string[]
      if (manageableParentIds.length === 0) {
        return { ok: false, error: 'Debes conectar la nueva persona a un padre o madre que puedas administrar.' }
      }

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

    const fatherId = await validateParent(input.fatherId || undefined, session, input.id)
    const motherId = await validateParent(input.motherId || undefined, session, input.id)

    if (fatherId && motherId && fatherId === motherId) {
      return { ok: false, error: 'Padre y madre deben ser personas distintas.' }
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
