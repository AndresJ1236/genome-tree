'use server'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { assertPersonAccess, getManagedPersonIdSet, userManagesPerson } from '@/lib/permissions'
import { logAudit } from '@/lib/audit'
import { getPersonDisplayName } from '@/lib/person-name'
import { notifyAdminsAndRepresentatives, notifyUser } from '@/lib/notifications'
import { revalidatePath } from 'next/cache'
import type { ActionResult, PersonCreationProposalItem, PersonProposalItem, ProposalStatus } from '@/lib/content-types'
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

    const proposedBirth = input.fields.birthDate ? new Date(input.fields.birthDate) : null
    const proposedDeath = input.fields.deathDate ? new Date(input.fields.deathDate) : null
    const effectiveBirth = proposedBirth ?? person.birthDate
    const effectiveDeath = proposedDeath ?? person.deathDate
    if (effectiveBirth && effectiveDeath && effectiveDeath < effectiveBirth) {
      return { ok: false, error: 'La fecha de fallecimiento no puede ser anterior a la fecha de nacimiento.' }
    }

    if (input.fields.bio && input.fields.bio.trim().length > 5000) {
      return { ok: false, error: 'La biografía no puede superar los 5000 caracteres.' }
    }

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

    void notifyAdminsAndRepresentatives({
      familyId: session.familyId,
      type:     'PROPOSAL_SUBMITTED',
      title:    'Nueva propuesta de cambio',
      body:     `en ${getPersonDisplayName(person)}`,
      href:     `/${session.familySlug}/settings/proposals`,
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
        proposedById: true,
        firstName: true, middleName: true, lastName: true,
        gender: true, birthDate: true, deathDate: true,
        birthPlace: true, bio: true,
        person: { select: { firstName: true, middleName: true, lastName: true } },
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

    void notifyUser(proposal.proposedById, {
      familyId: session.familyId,
      type:     'PROPOSAL_APPROVED',
      title:    'Propuesta aprobada',
      body:     `Tus cambios en ${getPersonDisplayName(proposal.person)} fueron aprobados`,
      href:     `/${session.familySlug}/person/${proposal.personId}`,
    })

    revalidatePath(`/${session.familySlug}/person/${proposal.personId}`)
    revalidatePath(`/${session.familySlug}/admin`)
    revalidatePath(`/${session.familySlug}/settings/proposals`)

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
      select: {
        familyId: true, personId: true, status: true,
        proposedById: true,
        person: { select: { firstName: true, middleName: true, lastName: true } },
      },
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

    const reason = input.reason.trim()
    void notifyUser(proposal.proposedById, {
      familyId: session.familyId,
      type:     'PROPOSAL_REJECTED',
      title:    'Propuesta no aprobada',
      body:     `Tus cambios en ${getPersonDisplayName(proposal.person)}${reason ? `: ${reason}` : ' no fueron aprobados'}`,
      href:     `/${session.familySlug}/person/${proposal.personId}`,
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

// ─────────────────────────────────────────────
// OBTENER PROPUESTAS DEL USUARIO ACTUAL
// ─────────────────────────────────────────────

export async function getOwnProposals(): Promise<ActionResult<PersonProposalItem[]>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    const proposals = await prisma.personUpdateProposal.findMany({
      where: { familyId: session.familyId, proposedById: session.userId },
      orderBy: { createdAt: 'desc' },
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
        firstName:  p.firstName, middleName: p.middleName, lastName: p.lastName,
        gender:     p.gender,
        birthDate:  p.birthDate?.toISOString() ?? null,
        deathDate:  p.deathDate?.toISOString() ?? null,
        birthPlace: p.birthPlace, bio: p.bio,
      }
      const fields = Object.entries(FIELD_LABELS)
        .filter(([key]) => proposed[key] !== null)
        .map(([key, label]) => ({
          key, label,
          currentValue:  formatFieldValue(key, current[key]),
          proposedValue: formatFieldValue(key, proposed[key]),
        }))
      return {
        id: p.id, personId: p.personId,
        personName:      getPersonDisplayName(p.person),
        proposedByName:  p.proposedBy.name,
        status:          p.status as ProposalStatus,
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

// ─────────────────────────────────────────────
// PROPONER NUEVA PERSONA (MEMBER)
// ─────────────────────────────────────────────

export async function proposeNewPerson(input: {
  firstName: string
  lastName?: string
  middleName?: string
  gender?: Gender
  birthDate?: string
  deathDate?: string
  birthPlace?: string
  nodeKind?: 'PERSON' | 'PET'
  notes?: string
  fatherId?: string
  motherId?: string
}): Promise<ActionResult<{ proposalId: string }>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  const firstName = input.firstName?.trim()
  if (!firstName) return { ok: false, error: 'El nombre es obligatorio.' }

  const nodeKind = input.nodeKind ?? 'PERSON'
  if (nodeKind === 'PERSON' && !input.lastName?.trim()) {
    return { ok: false, error: 'El apellido es obligatorio para personas.' }
  }

  try {
    const proposal = await prisma.personCreationProposal.create({
      data: {
        familyId:    session.familyId,
        proposedById: session.userId,
        firstName,
        lastName:    input.lastName?.trim() || null,
        middleName:  input.middleName?.trim() || null,
        gender:      input.gender ?? null,
        birthDate:   input.birthDate ? new Date(input.birthDate) : null,
        deathDate:   input.deathDate ? new Date(input.deathDate) : null,
        birthPlace:  input.birthPlace?.trim() || null,
        nodeKind,
        notes:       input.notes?.trim() || null,
        fatherId:    input.fatherId || null,
        motherId:    input.motherId || null,
      },
    })

    await logAudit({
      familyId:   session.familyId,
      userId:     session.userId,
      action:     'PROPOSE_NEW_PERSON',
      entityType: 'PersonCreationProposal',
      entityId:   proposal.id,
      newValue:   { firstName, lastName: input.lastName, nodeKind },
    })

    void notifyAdminsAndRepresentatives({
      familyId: session.familyId,
      type:     'PROPOSAL_SUBMITTED',
      title:    'Propuesta de nueva persona',
      body:     `${firstName}${input.lastName ? ' ' + input.lastName : ''}`,
      href:     `/${session.familySlug}/settings/proposals`,
    })

    return { ok: true, data: { proposalId: proposal.id } }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}

// ─────────────────────────────────────────────
// OBTENER PROPUESTAS DE NUEVA PERSONA
// ─────────────────────────────────────────────

function serializeCreationProposal(p: {
  id: string
  status: string
  createdAt: Date
  reviewedAt: Date | null
  rejectionReason: string | null
  firstName: string
  lastName: string | null
  middleName: string | null
  gender: Gender | null
  birthDate: Date | null
  nodeKind: string
  notes: string | null
  proposedBy: { name: string }
  father: { firstName: string; middleName: string | null; lastName: string } | null
  mother: { firstName: string; middleName: string | null; lastName: string } | null
}) {
  return {
    id: p.id,
    proposedByName: p.proposedBy.name,
    status: p.status as ProposalStatus,
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
  }
}

const CREATION_SELECT = {
  id: true, status: true, createdAt: true, reviewedAt: true, rejectionReason: true,
  firstName: true, lastName: true, middleName: true, gender: true,
  birthDate: true, nodeKind: true, notes: true,
  proposedBy: { select: { name: true } },
  father: { select: { firstName: true, middleName: true, lastName: true } },
  mother: { select: { firstName: true, middleName: true, lastName: true } },
} as const

export async function getCreationProposals(): Promise<ActionResult<ReturnType<typeof serializeCreationProposal>[]>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }
  if (session.role !== 'ADMIN') return { ok: false, error: 'Solo administradores' }

  try {
    const proposals = await prisma.personCreationProposal.findMany({
      where: { familyId: session.familyId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      select: CREATION_SELECT,
    })
    return { ok: true, data: proposals.map(serializeCreationProposal) }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}

export async function getOwnCreationProposals(): Promise<ActionResult<ReturnType<typeof serializeCreationProposal>[]>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    const proposals = await prisma.personCreationProposal.findMany({
      where: { familyId: session.familyId, proposedById: session.userId },
      orderBy: { createdAt: 'desc' },
      select: CREATION_SELECT,
    })
    return { ok: true, data: proposals.map(serializeCreationProposal) }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}

export async function approveCreationProposal(proposalId: string): Promise<ActionResult<{ personId: string }>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }
  if (session.role !== 'ADMIN') return { ok: false, error: 'Solo administradores' }

  try {
    const proposal = await prisma.personCreationProposal.findUnique({
      where: { id: proposalId },
      select: {
        familyId: true, status: true, proposedById: true,
        firstName: true, lastName: true, middleName: true,
        gender: true, birthDate: true, deathDate: true, birthPlace: true,
        nodeKind: true, notes: true, fatherId: true, motherId: true,
      },
    })
    if (!proposal) return { ok: false, error: 'Propuesta no encontrada' }
    if (proposal.familyId !== session.familyId) return { ok: false, error: 'No autorizado' }
    if (proposal.status !== 'PENDING') return { ok: false, error: 'Esta propuesta ya fue revisada' }

    const person = await prisma.person.create({
      data: {
        familyId:   session.familyId,
        firstName:  proposal.firstName,
        lastName:   proposal.lastName ?? '',
        middleName: proposal.middleName,
        gender:     proposal.gender ?? 'UNKNOWN',
        birthDate:  proposal.birthDate,
        deathDate:  proposal.deathDate,
        birthPlace: proposal.birthPlace,
        nodeKind:   proposal.nodeKind,
        bio:        proposal.notes,
        fatherId:   proposal.fatherId,
        motherId:   proposal.motherId,
      },
    })

    await prisma.personCreationProposal.update({
      where: { id: proposalId },
      data: { status: 'APPROVED', reviewedById: session.userId, reviewedAt: new Date() },
    })

    await logAudit({
      familyId: session.familyId,
      userId:   session.userId,
      action:   'APPROVE_NEW_PERSON_PROPOSAL',
      entityType: 'PersonCreationProposal',
      entityId: proposalId,
      newValue: { personId: person.id },
    })

    void notifyUser(proposal.proposedById, {
      familyId: session.familyId,
      type:     'PROPOSAL_APPROVED',
      title:    'Propuesta aprobada',
      body:     `${proposal.firstName}${proposal.lastName ? ' ' + proposal.lastName : ''} fue añadido al árbol`,
      href:     `/${session.familySlug}/person/${person.id}`,
    })

    revalidatePath(`/${session.familySlug}/admin`)
    revalidatePath(`/${session.familySlug}/tree`)
    return { ok: true, data: { personId: person.id } }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}

export async function rejectCreationProposal(input: { proposalId: string; reason: string }): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }
  if (session.role !== 'ADMIN') return { ok: false, error: 'Solo administradores' }

  try {
    const proposal = await prisma.personCreationProposal.findUnique({
      where: { id: input.proposalId },
      select: { familyId: true, status: true, proposedById: true, firstName: true, lastName: true },
    })
    if (!proposal) return { ok: false, error: 'Propuesta no encontrada' }
    if (proposal.familyId !== session.familyId) return { ok: false, error: 'No autorizado' }
    if (proposal.status !== 'PENDING') return { ok: false, error: 'Esta propuesta ya fue revisada' }

    await prisma.personCreationProposal.update({
      where: { id: input.proposalId },
      data: { status: 'REJECTED', reviewedById: session.userId, reviewedAt: new Date(), rejectionReason: input.reason.trim() || null },
    })

    void notifyUser(proposal.proposedById, {
      familyId: session.familyId,
      type:     'PROPOSAL_REJECTED',
      title:    'Propuesta rechazada',
      body:     `La sugerencia de añadir a ${proposal.firstName}${proposal.lastName ? ' ' + proposal.lastName : ''} no fue aprobada`,
      href:     `/${session.familySlug}/settings/proposals`,
    })

    revalidatePath(`/${session.familySlug}/admin`)
    return { ok: true, data: undefined }
  } catch (error: unknown) {
    return { ok: false, error: (error as Error).message }
  }
}
