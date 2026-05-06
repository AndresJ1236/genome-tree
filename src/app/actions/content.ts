'use server'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import {
  assertPersonAccess,
  assertCanEditOwnedContentForPerson,
  assertCanEditPerson,
  assertCanManagePerson,
  canViewPersonMedia,
  canViewPrivatePersonData,
  computeLockedAt,
  getContentVisibilityFilterForPerson,
  userManagesPerson,
} from '@/lib/permissions'
import { assertModuleEnabled, getFamilyModules, getModuleForContentType } from '@/lib/family-config'
import { logAudit } from '@/lib/audit'
import { revalidatePath } from 'next/cache'
import type {
  ClaimedRelation,
  PersonProfile,
  PersonFull,
  StoryItem,
  RecipeItem,
  DiaryItem,
  InterviewItem,
  ObjectItem,
  SourceItem,
  ImportantLinkItem,
  MediaItem,
  PersonBasic,
  ActionResult,
  CreateStoryInput,
  CreateRecipeInput,
  CreateDiaryInput,
  CreateInterviewInput,
  CreateObjectInput,
  CreateSourceInput,
  CreateImportantLinkInput,
  ContentVisibility,
  ConfidenceLevel,
} from '@/lib/content-types'

// ─────────────────────────────────────────────────────────────────────────────
// Límites del sistema
// ─────────────────────────────────────────────────────────────────────────────

const LIMITS = {
  STORIES_MAX:       30,
  STORIES_CHARS_MAX: 10_000,
  FEATURED_MAX:      9,
  MEDIA_MAX:         100,
  RECIPE_MEDIA_MAX:  3,
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de serialización (Prisma devuelve Date; React necesita strings)
// ─────────────────────────────────────────────────────────────────────────────

function serializeDate(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null
}

function toPersonBasic(p: {
  id: string; firstName: string; middleName: string | null; lastName: string
  birthDate: Date | null; deathDate: Date | null; coverPhoto: string | null
  gender: import('@prisma/client').Gender
}): PersonBasic {
  return {
    id:         p.id,
    firstName:  p.firstName,
    middleName: p.middleName,
    lastName:   p.lastName,
    birthDate:  serializeDate(p.birthDate),
    deathDate:  serializeDate(p.deathDate),
    coverPhoto: p.coverPhoto,
    gender:     p.gender as import('@/lib/content-types').Gender,
  }
}

function toMediaItem(m: {
  id: string; url: string; alt: string | null; caption: string | null
  featured: boolean; order: number; mimeType: string
  thumbUrl?: string | null; mediumUrl?: string | null; largeUrl?: string | null
  width?: number | null; height?: number | null
}): MediaItem {
  return {
    id:        m.id,
    url:       m.url,
    thumbUrl:  m.thumbUrl  ?? null,
    mediumUrl: m.mediumUrl ?? null,
    largeUrl:  m.largeUrl  ?? null,
    alt:       m.alt,
    caption:   m.caption,
    featured:  m.featured,
    order:     m.order,
    mimeType:  m.mimeType,
    width:     m.width  ?? null,
    height:    m.height ?? null,
  }
}

function isLocked(lockedAt: Date): boolean {
  return lockedAt < new Date()
}

async function canManagePerson(personId: string): Promise<boolean> {
  const session = await getSession()
  if (!session) return false

  try {
    await assertCanEditPerson(personId, session)
    return true
  } catch {
    return false
  }
}

async function canAddContentForPerson(personId: string): Promise<boolean> {
  const session = await getSession()
  if (!session) return false
  return userManagesPerson(session, personId, 'content')
}

function canEditItem(
  item: { createdById: string; lockedAt: Date },
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
  canManageTargetPerson: boolean
): boolean {
  if (session.role === 'ADMIN' || canManageTargetPerson) return true
  if (item.createdById !== session.userId) return false
  return item.lockedAt >= new Date()
}

function revalidateContentPaths(familySlug: string, personId: string) {
  revalidatePath(`/${familySlug}/person/${personId}`)
  revalidatePath(`/${familySlug}/person/${personId}/edit`)
  revalidatePath(`/${familySlug}/tree`)
}

// ─────────────────────────────────────────────────────────────────────────────
// LECTURA — Perfil para el sidebar (preview)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Carga los datos esenciales de una persona para el sidebar preview del árbol.
 * Devuelve: info básica, familia directa, 9 fotos destacadas, contadores.
 */
export async function getPersonProfile(
  personId: string
): Promise<ActionResult<PersonProfile>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    await assertPersonAccess(personId, session)
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message }
  }

  const [visibilityIn, canViewMedia, canViewPrivate] = await Promise.all([
    getContentVisibilityFilterForPerson(session, personId),
    canViewPersonMedia(session, personId),
    canViewPrivatePersonData(session, personId),
  ])
  const personSelect = { id: true, firstName: true, middleName: true, lastName: true, birthDate: true, deathDate: true, coverPhoto: true, gender: true }

  const [person, children, contentCounts, importantLinksCount, canManage, canAddContent, modules] = await Promise.all([
    prisma.person.findUnique({
      where: { id: personId },
      include: {
        father:           { select: personSelect },
        mother:           { select: personSelect },
        unitAffiliation:  { select: { label: true } },
        claimedRelationOf: { select: personSelect },
        media:  { where: { featured: true }, orderBy: { order: 'asc' }, take: LIMITS.FEATURED_MAX },
        _count: { select: { media: true } },
      },
    }),
    // Hijos: personas donde fatherId=personId o motherId=personId
    prisma.person.findMany({
      where: { OR: [{ fatherId: personId }, { motherId: personId }], deletedAt: null },
      select: personSelect,
      orderBy: { birthDate: 'asc' },
    }),
    prisma.content.groupBy({
      by:     ['type'],
      where:  visibilityIn.length > 0
        ? { personId, deletedAt: null, visibility: { in: visibilityIn } }
        : { personId, id: '__none__' },
      _count: { id: true },
    }),
    prisma.importantLink.count({
      where: visibilityIn.length > 0 ? { personId, visibility: { in: visibilityIn } } : { personId, id: '__none__' },
    }),
    canManagePerson(personId),
    canAddContentForPerson(personId),
    getFamilyModules(session.familyId),
  ])

  if (!person) return { ok: false, error: 'Persona no encontrada' }

  // Parejas inferenciales: personas que comparten un hijo con esta persona
  const partnerIds = new Set<string>()
  for (const child of children) {
    const c = child as { fatherId: string | null; motherId: string | null } & typeof child
    // child ya tiene fatherId/motherId si lo consultamos — usamos una query directa
    void c
  }
  // Consulta de hijos con fatherId/motherId para inferir pareja
  const childrenWithParents = await prisma.person.findMany({
    where: { OR: [{ fatherId: personId }, { motherId: personId }], deletedAt: null },
    select: { fatherId: true, motherId: true },
  })
  for (const c of childrenWithParents) {
    if (c.fatherId && c.fatherId !== personId) partnerIds.add(c.fatherId)
    if (c.motherId && c.motherId !== personId) partnerIds.add(c.motherId)
  }

  const partners: PersonBasic[] = partnerIds.size > 0
    ? (await prisma.person.findMany({
        where: { id: { in: [...partnerIds] } },
        select: personSelect,
      })).map(toPersonBasic)
    : []

  const countMap = Object.fromEntries(
    contentCounts.map(c => [c.type, c._count.id])
  )

  const parents: PersonBasic[] = [
    person.father ? toPersonBasic(person.father) : null,
    person.mother ? toPersonBasic(person.mother) : null,
  ].filter(Boolean) as PersonBasic[]

  const profile: PersonProfile = {
    id:         person.id,
    firstName:  person.firstName,
    lastName:   person.lastName,
    birthDate:  serializeDate(person.birthDate),
    deathDate:  serializeDate(person.deathDate),
    birthPlace: canViewPrivate ? person.birthPlace : null,
    gender:     person.gender,
    nodeKind:   (person.nodeKind ?? 'PERSON') as import('@/lib/content-types').PersonKind,
    bio:        canViewPrivate ? person.bio : null,
    coverPhoto: person.coverPhoto,
    isCore:     person.isCore,
    canManage,
    canAddContent,
    modules,
    parents,
    spouses:       partners,
    children:           children.map(toPersonBasic),
    featuredMedia:      canViewMedia && Array.isArray(person.media) ? person.media.map(toMediaItem) : [],
    claimedRelation:    person.claimedRelation as ClaimedRelation | null,
    claimedRelationOf:  person.claimedRelationOf ? toPersonBasic(person.claimedRelationOf) : null,
    unitAffiliationLabel: person.unitAffiliation?.label ?? null,
    counts: {
      stories:        countMap['STORY']     ?? 0,
      recipes:        countMap['RECIPE']    ?? 0,
      diary:          countMap['DIARY']     ?? 0,
      interviews:     countMap['INTERVIEW'] ?? 0,
      objects:        countMap['OBJECT']    ?? 0,
      sources:        countMap['SOURCE']    ?? 0,
      importantLinks: visibilityIn.length > 0 ? importantLinksCount : 0,
      media:          canViewMedia ? person._count.media : 0,
    },
  }

  return { ok: true, data: profile }
}

// ─────────────────────────────────────────────────────────────────────────────
// LECTURA — Perfil completo para la página biográfica
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Carga el perfil completo de una persona con todo su contenido.
 * Usado en la página /[familySlug]/person/[personId].
 */
export async function getPersonFull(
  personId: string
): Promise<ActionResult<PersonFull>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    await assertPersonAccess(personId, session)
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message }
  }

  const [visibilityIn, canViewMedia] = await Promise.all([
    getContentVisibilityFilterForPerson(session, personId),
    canViewPersonMedia(session, personId),
  ])

  // Cargar person + todo el contenido en paralelo
  const [profileResult, content, importantLinks, allMedia] = await Promise.all([
    getPersonProfile(personId),

    prisma.content.findMany({
      where: visibilityIn.length > 0
        ? { personId, deletedAt: null, visibility: { in: visibilityIn } }
        : { personId, id: '__none__' },
      include: {
        createdBy: { select: { id: true, name: true } },
        media:     { include: { media: true }, orderBy: { order: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    }),

    prisma.importantLink.findMany({
      where:   visibilityIn.length > 0 ? { personId, visibility: { in: visibilityIn } } : { personId, id: '__none__' },
      include: {
        relatedPerson: { select: { id: true, firstName: true, middleName: true, lastName: true, birthDate: true, deathDate: true, coverPhoto: true, gender: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),

    canViewMedia
      ? prisma.media.findMany({
          where:   { personId },
          orderBy: [{ featured: 'desc' }, { order: 'asc' }],
        })
      : Promise.resolve([]),
  ])

  if (!profileResult.ok) return profileResult
  const canManageTargetPerson = profileResult.data.canManage

  // Serializar contenido por tipo
  const stories: StoryItem[] = content
    .filter(c => c.type === 'STORY')
    .map(c => ({
      id:              c.id,
      title:           c.title,
      body:            c.body ?? '',
      visibility:      c.visibility as ContentVisibility,
      createdAt:       c.createdAt.toISOString(),
      lockedAt:        c.lockedAt.toISOString(),
      isLocked:        isLocked(c.lockedAt),
      source:          c.source,
      confidence:      c.confidence as ConfidenceLevel | null,
      approximateDate: c.approximateDate,
      authorName:      c.authorName,
      createdBy:       c.createdBy,
      canEdit:         canEditItem(c, session, canManageTargetPerson),
    }))

  const recipes: RecipeItem[] = content
    .filter(c => c.type === 'RECIPE')
    .map(c => ({
      id:          c.id,
      title:       c.title,
      body:        c.body,
      visibility:  c.visibility as ContentVisibility,
      createdAt:   c.createdAt.toISOString(),
      lockedAt:    c.lockedAt.toISOString(),
      isLocked:    isLocked(c.lockedAt),
      source:      c.source,
      confidence:  c.confidence as ConfidenceLevel | null,
      ingredients: Array.isArray(c.ingredients) ? c.ingredients as string[] : [],
      steps:       Array.isArray(c.steps)       ? c.steps       as string[] : [],
      notes:       c.notes,
      createdBy:   c.createdBy,
      canEdit:     canEditItem(c, session, canManageTargetPerson),
      media:       c.media.map(cm => toMediaItem(cm.media)),
    }))

  const diaryEntries: DiaryItem[] = content
    .filter(c => c.type === 'DIARY')
    .map(c => ({
      id:         c.id,
      title:      c.title,
      body:       c.body ?? '',
      visibility: c.visibility as ContentVisibility,
      createdAt:  c.createdAt.toISOString(),
      lockedAt:   c.lockedAt.toISOString(),
      isLocked:   isLocked(c.lockedAt),
      source:     c.source,
      confidence: c.confidence as ConfidenceLevel | null,
      entryDate:  serializeDate(c.entryDate),
      createdBy:  c.createdBy,
      canEdit:    canEditItem(c, session, canManageTargetPerson),
    }))

  const interviews: InterviewItem[] = content
    .filter(c => c.type === 'INTERVIEW')
    .map(c => ({
      id:              c.id,
      title:           c.title,
      question:        c.question ?? '',
      body:            c.body ?? '',
      visibility:      c.visibility as ContentVisibility,
      createdAt:       c.createdAt.toISOString(),
      lockedAt:        c.lockedAt.toISOString(),
      isLocked:        isLocked(c.lockedAt),
      source:          c.source,
      confidence:      c.confidence as ConfidenceLevel | null,
      approximateDate: c.approximateDate,
      authorName:      c.authorName,
      createdBy:       c.createdBy,
      canEdit:         canEditItem(c, session, canManageTargetPerson),
    }))

  const objects: ObjectItem[] = content
    .filter(c => c.type === 'OBJECT')
    .map(c => ({
      id:         c.id,
      title:      c.title,
      body:       c.body,
      notes:      c.notes,
      visibility: c.visibility as ContentVisibility,
      createdAt:  c.createdAt.toISOString(),
      lockedAt:   c.lockedAt.toISOString(),
      isLocked:   isLocked(c.lockedAt),
      source:     c.source,
      confidence: c.confidence as ConfidenceLevel | null,
      createdBy:  c.createdBy,
      canEdit:    canEditItem(c, session, canManageTargetPerson),
      media:      c.media.map(cm => toMediaItem(cm.media)),
    }))

  const sources: SourceItem[] = content
    .filter(c => c.type === 'SOURCE')
    .map(c => ({
      id:         c.id,
      title:      c.title,
      body:       c.body,
      visibility: c.visibility as ContentVisibility,
      createdAt:  c.createdAt.toISOString(),
      lockedAt:   c.lockedAt.toISOString(),
      isLocked:   isLocked(c.lockedAt),
      source:     c.source,
      confidence: c.confidence as ConfidenceLevel | null,
      createdBy:  c.createdBy,
      canEdit:    canEditItem(c, session, canManageTargetPerson),
    }))

  const importantLinkItems: ImportantLinkItem[] = importantLinks.map(l => ({
    id:            l.id,
    label:         l.label,
    notes:         l.notes,
    source:        l.source,
    confidence:    l.confidence as ConfidenceLevel | null,
    visibility:    l.visibility as ContentVisibility,
    createdAt:     l.createdAt.toISOString(),
    lockedAt:      l.lockedAt.toISOString(),
    isLocked:      isLocked(l.lockedAt),
    canEdit:       canEditItem(l, session, canManageTargetPerson),
    relatedPerson: l.relatedPerson ? toPersonBasic(l.relatedPerson) : null,
    externalName:  l.externalName,
  }))

  const full: PersonFull = {
    ...profileResult.data,
    allMedia:       allMedia.map(toMediaItem),
    stories,
    recipes,
    diaryEntries,
    interviews,
    objects,
    sources,
    importantLinks: importantLinkItems,
  }

  return { ok: true, data: full }
}

// ─────────────────────────────────────────────────────────────────────────────
// CREAR CONTENIDO
// ─────────────────────────────────────────────────────────────────────────────

export async function createStory(
  input: CreateStoryInput
): Promise<ActionResult<{ id: string }>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    await assertCanManagePerson(input.personId, session, 'content')
    await assertModuleEnabled(session.familyId, getModuleForContentType('STORY'), 'El modulo de historias y fuentes esta desactivado.')
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message }
  }

  // Validar límite de 30 historias por persona
  const storyCount = await prisma.content.count({
    where: { personId: input.personId, type: 'STORY' },
  })
  if (storyCount >= LIMITS.STORIES_MAX) {
    return { ok: false, error: `Límite alcanzado: máximo ${LIMITS.STORIES_MAX} historias por persona.` }
  }

  // Validar límite de 10.000 caracteres totales
  const existingStories = await prisma.content.findMany({
    where:  { personId: input.personId, type: 'STORY' },
    select: { body: true },
  })
  const totalChars = existingStories.reduce((sum, s) => sum + (s.body?.length ?? 0), 0)
  if (totalChars + input.body.length > LIMITS.STORIES_CHARS_MAX) {
    const remaining = LIMITS.STORIES_CHARS_MAX - totalChars
    return { ok: false, error: `Límite de caracteres alcanzado. Quedan ${remaining} caracteres disponibles para esta persona.` }
  }

  const content = await prisma.content.create({
    data: {
      personId:        input.personId,
      familyId:        session.familyId,
      type:            'STORY',
      title:           input.title,
      body:            input.body,
      source:          input.source,
      confidence:      input.confidence,
      approximateDate: input.approximateDate,
      authorName:      input.authorName,
      visibility:      input.visibility,
      createdById:     session.userId,
      lockedAt:        computeLockedAt(),
    },
  })

  void logAudit({
    familyId:   session.familyId,
    userId:     session.userId,
    action:     'CREATE_CONTENT',
    entityType: 'CONTENT',
    entityId:   content.id,
    newValue:   { type: 'STORY', title: input.title, personId: input.personId },
  })
  revalidateContentPaths(session.familySlug, input.personId)
  return { ok: true, data: { id: content.id } }
}

export async function createRecipe(
  input: CreateRecipeInput
): Promise<ActionResult<{ id: string }>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    await assertCanManagePerson(input.personId, session, 'content')
    await assertModuleEnabled(session.familyId, getModuleForContentType('RECIPE'), 'El modulo de recetas esta desactivado.')
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message }
  }

  const content = await prisma.content.create({
    data: {
      personId:    input.personId,
      familyId:    session.familyId,
      type:        'RECIPE',
      title:       input.title,
      body:        input.body,
      ingredients: input.ingredients,
      steps:       input.steps,
      notes:       input.notes,
      source:      input.source,
      confidence:  input.confidence,
      visibility:  input.visibility,
      createdById: session.userId,
      lockedAt:    computeLockedAt(),
    },
  })

  void logAudit({
    familyId:   session.familyId,
    userId:     session.userId,
    action:     'CREATE_CONTENT',
    entityType: 'CONTENT',
    entityId:   content.id,
    newValue:   { type: 'RECIPE', title: input.title, personId: input.personId },
  })
  revalidateContentPaths(session.familySlug, input.personId)
  return { ok: true, data: { id: content.id } }
}

export async function createDiaryEntry(
  input: CreateDiaryInput
): Promise<ActionResult<{ id: string }>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    await assertCanManagePerson(input.personId, session, 'content')
    await assertModuleEnabled(session.familyId, getModuleForContentType('DIARY'), 'El modulo de diario e entrevistas esta desactivado.')
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message }
  }

  const content = await prisma.content.create({
    data: {
      personId:    input.personId,
      familyId:    session.familyId,
      type:        'DIARY',
      title:       input.title,
      body:        input.body,
      entryDate:   input.entryDate ? new Date(input.entryDate) : null,
      visibility:  input.visibility,
      createdById: session.userId,
      lockedAt:    computeLockedAt(),
    },
  })

  void logAudit({
    familyId:   session.familyId,
    userId:     session.userId,
    action:     'CREATE_CONTENT',
    entityType: 'CONTENT',
    entityId:   content.id,
    newValue:   { type: 'DIARY', title: input.title, personId: input.personId },
  })
  revalidateContentPaths(session.familySlug, input.personId)
  return { ok: true, data: { id: content.id } }
}

export async function createInterview(
  input: CreateInterviewInput
): Promise<ActionResult<{ id: string }>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    await assertCanManagePerson(input.personId, session, 'content')
    await assertModuleEnabled(session.familyId, getModuleForContentType('INTERVIEW'), 'El modulo de diario e entrevistas esta desactivado.')
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message }
  }

  const content = await prisma.content.create({
    data: {
      personId:        input.personId,
      familyId:        session.familyId,
      type:            'INTERVIEW',
      title:           input.title,
      question:        input.question,
      body:            input.body,
      source:          input.source,
      confidence:      input.confidence,
      approximateDate: input.approximateDate,
      authorName:      input.authorName,
      visibility:      input.visibility,
      createdById:     session.userId,
      lockedAt:        computeLockedAt(),
    },
  })

  void logAudit({
    familyId:   session.familyId,
    userId:     session.userId,
    action:     'CREATE_CONTENT',
    entityType: 'CONTENT',
    entityId:   content.id,
    newValue:   { type: 'INTERVIEW', title: input.title, personId: input.personId },
  })
  revalidateContentPaths(session.familySlug, input.personId)
  return { ok: true, data: { id: content.id } }
}

export async function createObject(
  input: CreateObjectInput
): Promise<ActionResult<{ id: string }>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    await assertCanManagePerson(input.personId, session, 'content')
    await assertModuleEnabled(session.familyId, getModuleForContentType('OBJECT'), 'El modulo de objetos esta desactivado.')
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message }
  }

  const content = await prisma.content.create({
    data: {
      personId:    input.personId,
      familyId:    session.familyId,
      type:        'OBJECT',
      title:       input.title,
      body:        input.body,
      notes:       input.notes,
      source:      input.source,
      confidence:  input.confidence,
      visibility:  input.visibility,
      createdById: session.userId,
      lockedAt:    computeLockedAt(),
    },
  })

  void logAudit({
    familyId:   session.familyId,
    userId:     session.userId,
    action:     'CREATE_CONTENT',
    entityType: 'CONTENT',
    entityId:   content.id,
    newValue:   { type: 'OBJECT', title: input.title, personId: input.personId },
  })
  revalidateContentPaths(session.familySlug, input.personId)
  return { ok: true, data: { id: content.id } }
}

export async function createSource(
  input: CreateSourceInput
): Promise<ActionResult<{ id: string }>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    await assertCanManagePerson(input.personId, session, 'content')
    await assertModuleEnabled(session.familyId, getModuleForContentType('SOURCE'), 'El modulo de historias y fuentes esta desactivado.')
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message }
  }

  const content = await prisma.content.create({
    data: {
      personId:    input.personId,
      familyId:    session.familyId,
      type:        'SOURCE',
      title:       input.title,
      body:        input.body,
      source:      input.source,
      confidence:  input.confidence,
      visibility:  input.visibility,
      createdById: session.userId,
      lockedAt:    computeLockedAt(),
    },
  })

  void logAudit({
    familyId:   session.familyId,
    userId:     session.userId,
    action:     'CREATE_CONTENT',
    entityType: 'CONTENT',
    entityId:   content.id,
    newValue:   { type: 'SOURCE', title: input.title, personId: input.personId },
  })
  revalidateContentPaths(session.familySlug, input.personId)
  return { ok: true, data: { id: content.id } }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTUALIZAR CONTENIDO
// ─────────────────────────────────────────────────────────────────────────────

export async function updateContent(
  id: string,
  data: Partial<{
    title:           string
    body:            string
    source:          string
    confidence:      ConfidenceLevel
    visibility:      ContentVisibility
    approximateDate: string
    authorName:      string
    ingredients:     string[]
    steps:           string[]
    notes:           string
    entryDate:       string
    question:        string
  }>
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  const content = await prisma.content.findUnique({
    where:  { id },
    select: { createdById: true, lockedAt: true, personId: true, familyId: true, type: true, body: true },
  })

  if (!content || content.familyId !== session.familyId) {
    return { ok: false, error: 'Contenido no encontrado' }
  }

  try {
    await assertCanEditOwnedContentForPerson(content, content.personId, session)
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message }
  }

  // Si es una historia, re-validar límite de caracteres
  if (content.type === 'STORY' && data.body !== undefined) {
    const otherStories = await prisma.content.findMany({
      where:  { personId: content.personId, type: 'STORY', NOT: { id } },
      select: { body: true },
    })
    const totalChars = otherStories.reduce((sum, s) => sum + (s.body?.length ?? 0), 0)
    if (totalChars + data.body.length > LIMITS.STORIES_CHARS_MAX) {
      const remaining = LIMITS.STORIES_CHARS_MAX - totalChars
      return { ok: false, error: `Límite de caracteres. Quedan ${remaining} caracteres disponibles.` }
    }
  }

  await prisma.content.update({
    where: { id },
    data: {
      ...data,
      entryDate:   data.entryDate ? new Date(data.entryDate) : undefined,
      ingredients: data.ingredients ?? undefined,
      steps:       data.steps       ?? undefined,
    },
  })

  revalidateContentPaths(session.familySlug, content.personId)
  return { ok: true, data: undefined }
}

// ─────────────────────────────────────────────────────────────────────────────
// ELIMINAR CONTENIDO
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteContent(id: string): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  const content = await prisma.content.findUnique({
    where:  { id },
    select: { createdById: true, lockedAt: true, familyId: true, personId: true },
  })

  if (!content || content.familyId !== session.familyId) {
    return { ok: false, error: 'Contenido no encontrado' }
  }

  try {
    await assertCanEditOwnedContentForPerson(content, content.personId, session)
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message }
  }

  // Soft delete: marca como eliminado pero preserva en DB.
  // ContentMedia se mantiene; queries de listado deben filtrar por
  // deletedAt:null (ya implementado en getProfilePayload y similares).
  await prisma.content.update({
    where: { id },
    data: {
      deletedAt:   new Date(),
      deletedById: session.userId,
    },
  })

  revalidateContentPaths(session.familySlug, content.personId)
  return { ok: true, data: undefined }
}

/**
 * Restaura un contenido previamente eliminado.
 * Solo admins pueden restaurar (ediciones normales pueden estar bloqueadas
 * por lockedAt, pero la restauración es reversible y no toca el contenido).
 */
export async function restoreContent(id: string): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  const isAdmin = session.role === 'ADMIN' || session.scope === 'ADMIN'
  if (!isAdmin) return { ok: false, error: 'Solo administradores pueden restaurar contenido.' }

  const content = await prisma.content.findUnique({
    where: { id },
    select: { familyId: true, personId: true, deletedAt: true },
  })
  if (!content || content.familyId !== session.familyId) {
    return { ok: false, error: 'Contenido no encontrado' }
  }
  if (!content.deletedAt) {
    return { ok: false, error: 'Este contenido no está eliminado.' }
  }

  await prisma.content.update({
    where: { id },
    data: { deletedAt: null, deletedById: null },
  })

  revalidateContentPaths(session.familySlug, content.personId)
  return { ok: true, data: undefined }
}

// ─────────────────────────────────────────────────────────────────────────────
// RELACIONES IMPORTANTES — CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function createImportantLink(
  input: CreateImportantLinkInput
): Promise<ActionResult<{ id: string }>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    await assertCanManagePerson(input.personId, session, 'content')
    await assertModuleEnabled(session.familyId, 'moduleLinks', 'El modulo de relaciones importantes esta desactivado.')
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message }
  }

  if (!input.relatedPersonId && !input.externalName) {
    return { ok: false, error: 'Debes indicar una persona del árbol o un nombre externo.' }
  }

  // Si apunta a otra persona del árbol, verificar que también sea accesible
  if (input.relatedPersonId) {
    try {
      await assertPersonAccess(input.relatedPersonId, session)
    } catch (e: unknown) {
      return { ok: false, error: (e as Error).message }
    }
  }

  const link = await prisma.importantLink.create({
    data: {
      personId:        input.personId,
      familyId:        session.familyId,
      label:           input.label,
      notes:           input.notes,
      source:          input.source,
      confidence:      input.confidence,
      visibility:      input.visibility,
      relatedPersonId: input.relatedPersonId,
      externalName:    input.externalName,
      createdById:     session.userId,
      lockedAt:        computeLockedAt(),
    },
  })

  revalidateContentPaths(session.familySlug, input.personId)
  return { ok: true, data: { id: link.id } }
}

export async function updateImportantLink(
  id: string,
  data: Partial<{
    label:      string
    notes:      string
    source:     string
    confidence: ConfidenceLevel
    visibility: ContentVisibility
    relatedPersonId: string
    externalName: string
  }>
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  const link = await prisma.importantLink.findUnique({
    where:  { id },
    select: { createdById: true, lockedAt: true, familyId: true, personId: true },
  })

  if (!link || link.familyId !== session.familyId) {
    return { ok: false, error: 'Vínculo no encontrado' }
  }

  try {
    await assertCanEditOwnedContentForPerson(link, link.personId, session)
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message }
  }

  if (data.relatedPersonId) {
    try {
      await assertPersonAccess(data.relatedPersonId, session)
    } catch (e: unknown) {
      return { ok: false, error: (e as Error).message }
    }
  }

  if (data.relatedPersonId === '' && data.externalName === '') {
    return { ok: false, error: 'Debes indicar una persona del arbol o un nombre externo.' }
  }

  await prisma.importantLink.update({
    where: { id },
    data: {
      ...data,
      relatedPersonId: data.relatedPersonId === undefined ? undefined : (data.relatedPersonId || null),
      externalName: data.externalName === undefined ? undefined : (data.externalName || null),
    },
  })
  revalidateContentPaths(session.familySlug, link.personId)
  return { ok: true, data: undefined }
}

export async function deleteImportantLink(id: string): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  const link = await prisma.importantLink.findUnique({
    where:  { id },
    select: { createdById: true, lockedAt: true, familyId: true, personId: true },
  })

  if (!link || link.familyId !== session.familyId) {
    return { ok: false, error: 'Vínculo no encontrado' }
  }

  try {
    await assertCanEditOwnedContentForPerson(link, link.personId, session)
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message }
  }

  await prisma.importantLink.delete({ where: { id } })
  revalidateContentPaths(session.familySlug, link.personId)
  return { ok: true, data: undefined }
}

// ─────────────────────────────────────────────────────────────────────────────
// MEDIA — marcar/desmarcar como destacada
// ─────────────────────────────────────────────────────────────────────────────

export async function toggleFeaturedMedia(
  mediaId: string,
  featured: boolean
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  const media = await prisma.media.findUnique({
    where:  { id: mediaId },
    select: { personId: true, familyId: true },
  })

  if (!media || media.familyId !== session.familyId) {
    return { ok: false, error: 'Imagen no encontrada' }
  }

  // Si se quiere marcar como destacada, verificar el límite de 9
  if (featured) {
    const currentFeatured = await prisma.media.count({
      where: { personId: media.personId, featured: true },
    })
    if (currentFeatured >= LIMITS.FEATURED_MAX) {
      return { ok: false, error: `Límite alcanzado: máximo ${LIMITS.FEATURED_MAX} imágenes destacadas por persona.` }
    }
  }

  await prisma.media.update({ where: { id: mediaId }, data: { featured } })
  return { ok: true, data: undefined }
}
