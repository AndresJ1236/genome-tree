'use server'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { assertPersonAccess, getManagedPersonIdSet, userManagesPerson } from '@/lib/permissions'
import { logAudit } from '@/lib/audit'
import { getPersonDisplayName } from '@/lib/person-name'
import { revalidatePath } from 'next/cache'
import type { ActionResult, PersonProposalItem } from '@/lib/content-types'
import type { Gender } from '@prisma/client'

// null = no se propone cambio en ese campo
// string/valor = se propone ese valor
// Para campos nullable: string vacío no se acepta (se normaliza a null = no propone)
type ProposableFields = {
  firstName?: string
  middleName?: string | null
  lastName?: string
  gender?: Gender
  birthDate?: string | null
  deathDate?: string | null
  birthPlace?: string | null
  bio?: string | null
}

const FIELD_LABELS: Record<string, string> = {
  firstName:  'Nombre',
  middleName: 'Segundo nombre',
  lastName:   'Apellido',
  gender:     'Género',
  birthDate:  'Fecha de nacimiento',
  deathDate:  'Fecha de fallecimiento',
  birthPlace: 'Lugar de nacimiento',
  bio:        'Biografía',
}

const GENDER_LABELS: Record<string, string> = {
  MALE: 'Masculino', FEMALE: 'Femenino', OTHER: 'Otro', UNKNOWN: 'Desconocido',
}

function formatFieldValue(key: string, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (key === 'gender') return GENDER_LABELS[value as string] ?? String(value)
  if ((key === 'birthDate' || key === 'deathDate') && typeof value === 'string') {
    try { return new Date(value).toLocaleDateString('es') } catch { return String(value) }
  }
  if (value instanceof Date) return value.toLocaleDateString('es')
  return String(value)
}

// ─────────────────────────────────────────────
// CREAR PROPUESTA (MEMBER)
// ─────────────────────────────────────────────

export async function proposePeopleUpdate(input: {
  personId: string
  fields: ProposableFields
}): Promise<ActionResult<{ proposalId: string }>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    await assertPersonAccess(input.personId, session)

    const person = await prisma.person.findUnique({
      where: { id: input.personId },
      select: {
        firstName: true, middleName: true, lastName: true,
        gender: true, birthDate: true, deathDate: true,
        birthPlace: true, bio: true,
      },
    })
    if (!person) return { ok: false, error: 'Persona no encontrada' }

    // Al menos un campo debe tener un valor propuesto no vacío
    const hasChange = (
      (input.fields.firstName?.trim() ?? '') !== '' ||
      (input.fields.lastName?.trim() ?? '') !== '' ||
      (input.fields.gender !== undefined) ||
      (input.fields.birthDate !== undefined && (input.fields.birthDate ?? '') !== '') ||
      (input.fields.deathDate !== undefined && (input.fields.deathDate ?? '') !== '') ||
      (input.fields.birthPlace !== undefined && (input.fields.birthPlace ?? '') !== '') ||
      (input.fields.bio !== undefined && (input.fields.bio ?? '') !== '') ||
      (input.fields.middleName !== undefined && (input.fields.middleName ?? '') !== '')
    )
    if (!hasChange) return { ok: false, error: 'Incluye al menos un campo con un valor propuesto.' }

    const proposal = await prisma.personUpdateProposal.create({
      data: {
        familyId:    session.familyId,
        personId:    input.personId,
        proposedById: session.userId,
        currentValues: {
          firstName:  person.firstName,
          middleName: person.middleName,
          lastName:   person.lastName,
          gender:     person.gender,
          birthDate:  person.birthDate?.toISOString() ?? null,
          deathDate:  person.deathDate?.toISOString() ?? null,
          birthPlace: person.birthPlace,
          bio:        person.bio,
        },
        firstName:  input.fields.firstName?.trim() || null,
        middleName: input.fields.middleName?.trim() || null,
        lastName:   input.fields.lastName?.trim() || null,
        gender:     input.fields.gender ?? null,
        birthDate:  input.fields.birthDate ? new Date(input.fields.birthDate) : null,
        deathDate:  input.fields.deathDate ? new Date(input.fields.deathDate) : null,
        birthPlace: input.fields.birthPlace?.trim() || null,
        bio:        input.fields.bio?.trim() || null,
      },
    })

    await logAudit({
      familyId:   session.familyId,
      userId:     session.userId,
      action:     'PROPOSE_PERSON_UPDATE',
      entityType: 'PersonUpdateProposal',
      entityId:   proposal.id,
      newValue:   input.fields,
    })

    return { ok: true, data: { proposalId: proposal.id } }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}

// ─────────────────────────────────────────────
// APROBAR PROPUESTA (ADMIN o REPRESENTANTE de la unidad)
// ─────────────────────────────────────────────

export async function approveProposal(
  proposalId: string
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    const proposal = await prisma.personUpdateProposal.findUnique({
      where: { id: proposalId },
      select: {
        familyId: true, personId: true, status: true,
        firstName: true, middleName: true, lastName: true,
        gender: true, birthDate: true, deathDate: true,
        birthPlace: true, bio: true,
      },
    })
    if (!proposal)                            return { ok: false, error: 'Propuesta no encontrada' }
    if (proposal.familyId !== session.familyId) return { ok: false, error: 'No autorizado' }
    if (proposal.status !== 'PENDING')        return { ok: false, error: 'Esta propuesta ya fue revisada' }

    const canApprove =
      session.role === 'ADMIN' ||
      session.scope === 'ADMIN' ||
      (await userManagesPerson(session, proposal.personId, 'people'))
    if (!canApprove) return { ok: false, error: 'No tienes permiso para aprobar esta propuesta' }

    // Aplica solo los campos no-null del proposal
    const updateData: Record<string, unknown> = {}
    if (proposal.firstName  !== null) updateData.firstName  = proposal.firstName
    if (proposal.lastName   !== null) updateData.lastName   = proposal.lastName
    if (proposal.middleName !== null) updateData.middleName = proposal.middleName
    if (proposal.gender     !== null) updateData.gender     = proposal.gender
    if (proposal.birthDate  !== null) updateData.birthDate  = proposal.birthDate
    if (proposal.deathDate  !== null) updateData.deathDate  = proposal.deathDate
    if (proposal.birthPlace !== null) updateData.birthPlace = proposal.birthPlace
    if (proposal.bio        !== null) updateData.bio        = proposal.bio

    await prisma.$transaction(async tx => {
      await tx.person.update({ where: { id: proposal.personId }, data: updateData })
      await tx.personUpdateProposal.update({
        where: { id: proposalId },
        data: { status: 'APPROVED', reviewedById: session.userId, reviewedAt: new Date() },
      })
    })

    await logAudit({
      familyId:   session.familyId,
      userId:     session.userId,
      action:     'APPROVE_PERSON_UPDATE',
      entityType: 'PersonUpdateProposal',
      entityId:   proposalId,
      newValue:   updateData,
    })

    revalidatePath(`/${session.familySlug}/person/${proposal.personId}`)
    revalidatePath(`/${session.familySlug}/admin`)

    return { ok: true, data: undefined }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}

// ─────────────────────────────────────────────
// RECHAZAR PROPUESTA (ADMIN o REPRESENTANTE de la unidad)
// ─────────────────────────────────────────────

export async function rejectProposal(input: {
  proposalId: string
  reason: string
}): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    const proposal = await prisma.personUpdateProposal.findUnique({
      where: { id: input.proposalId },
      select: { familyId: true, personId: true, status: true },
    })
    if (!proposal)                              return { ok: false, error: 'Propuesta no encontrada' }
    if (proposal.familyId !== session.familyId) return { ok: false, error: 'No autorizado' }
    if (proposal.status !== 'PENDING')          return { ok: false, error: 'Esta propuesta ya fue revisada' }

    const canReject =
      session.role === 'ADMIN' ||
      session.scope === 'ADMIN' ||
      (await userManagesPerson(session, proposal.personId, 'people'))
    if (!canReject) return { ok: false, error: 'No tienes permiso para rechazar esta propuesta' }

    await prisma.personUpdateProposal.update({
      where: { id: input.proposalId },
      data: {
        status:          'REJECTED',
        reviewedById:    session.userId,
        reviewedAt:      new Date(),
        rejectionReason: input.reason.trim() || null,
      },
    })

    await logAudit({
      familyId:   session.familyId,
      userId:     session.userId,
      action:     'REJECT_PERSON_UPDATE',
      entityType: 'PersonUpdateProposal',
      entityId:   input.proposalId,
      newValue:   { reason: input.reason },
    })

    revalidatePath(`/${session.familySlug}/admin`)

    return { ok: true, data: undefined }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}

// ─────────────────────────────────────────────
// OBTENER PROPUESTAS PENDIENTES (ADMIN o REPRESENTANTE)
// ─────────────────────────────────────────────

export async function getPendingProposals(): Promise<ActionResult<PersonProposalItem[]>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    const managedIds = await getManagedPersonIdSet(session)
    // managedIds === null → admin, ve todo
    // managedIds === Set vacío → no gestiona nada, lista vacía
    if (managedIds !== null && managedIds.size === 0) {
      return { ok: true, data: [] }
    }

    const proposals = await prisma.personUpdateProposal.findMany({
      where: {
        familyId: session.familyId,
        status:   'PENDING',
        ...(managedIds !== null
          ? { personId: { in: [...managedIds] } }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, personId: true, status: true,
        createdAt: true, reviewedAt: true, rejectionReason: true,
        firstName: true, middleName: true, lastName: true,
        gender: true, birthDate: true, deathDate: true,
        birthPlace: true, bio: true,
        currentValues: true,
        person:     { select: { firstName: true, middleName: true, lastName: true } },
        proposedBy: { select: { name: true } },
      },
    })

    const items: PersonProposalItem[] = proposals.map(p => {
      const current = p.currentValues as Record<string, unknown>

      const proposed: Record<string, unknown> = {
        firstName:  p.firstName,
        middleName: p.middleName,
        lastName:   p.lastName,
        gender:     p.gender,
        birthDate:  p.birthDate?.toISOString() ?? null,
        deathDate:  p.deathDate?.toISOString() ?? null,
        birthPlace: p.birthPlace,
        bio:        p.bio,
      }

      const fields = Object.entries(FIELD_LABELS)
        .filter(([key]) => proposed[key] !== null)
        .map(([key, label]) => ({
          key,
          label,
          currentValue:  formatFieldValue(key, current[key]),
          proposedValue: formatFieldValue(key, proposed[key]),
        }))

      return {
        id:              p.id,
        personId:        p.personId,
        personName:      getPersonDisplayName(p.person),
        proposedByName:  p.proposedBy.name,
        status:          p.status as 'PENDING',
        createdAt:       p.createdAt.toISOString(),
        reviewedAt:      p.reviewedAt?.toISOString() ?? null,
        rejectionReason: p.rejectionReason,
        fields,
      }
    })

    return { ok: true, data: items }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}
