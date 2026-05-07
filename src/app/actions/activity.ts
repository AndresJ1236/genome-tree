'use server'

// Activity feed familiar — agrega eventos de varias fuentes (personas creadas,
// contenido nuevo, fotos subidas, comentarios) en un único stream ordenado
// por fecha. NO depende del modelo Notification porque ese es per-user;
// este feed es para toda la familia.

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import type { ActionResult } from '@/lib/content-types'

export interface ActivityItem {
  id:        string                 // unique = `${kind}:${entityId}`
  kind:      'PERSON_CREATED' | 'CONTENT_CREATED' | 'MEDIA_UPLOADED' | 'COMMENT_POSTED'
  createdAt: string                 // ISO
  actorId:   string
  actorName: string
  /** Persona protagonista (la persona del perfil donde apareció esto) */
  personId:    string | null
  personName:  string | null
  /** Resumen ya en español, listo para mostrar */
  message:   string
  /** Para linkear al elemento — depende del kind. Ejemplo: `/familia/person/abc#story-123` */
  href:      string | null
}

const FEED_LIMIT = 50

/**
 * Devuelve los últimos N eventos de actividad de la familia, mezclados
 * y ordenados por fecha.
 */
export async function getFamilyActivity(): Promise<ActionResult<ActivityItem[]>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  const family = await prisma.family.findUnique({
    where:  { id: session.familyId },
    select: { slug: true },
  })
  if (!family) return { ok: false, error: 'Familia no encontrada.' }
  const slug = family.slug

  // 4 queries en paralelo — cada una limitada para que el merge sea rápido.
  const [people, contents, mediaRows, comments] = await Promise.all([
    prisma.person.findMany({
      where:    { familyId: session.familyId, deletedAt: null },
      orderBy:  { createdAt: 'desc' },
      take:     FEED_LIMIT,
      select:   { id: true, firstName: true, lastName: true, createdAt: true },
    }),
    prisma.content.findMany({
      where:    { familyId: session.familyId, deletedAt: null },
      orderBy:  { createdAt: 'desc' },
      take:     FEED_LIMIT,
      select: {
        id: true, type: true, title: true, createdAt: true, personId: true,
        createdBy: { select: { id: true, name: true } },
        person:    { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.media.findMany({
      where:    { familyId: session.familyId },
      orderBy:  { createdAt: 'desc' },
      take:     FEED_LIMIT,
      select: {
        id: true, kind: true, createdAt: true, personId: true, uploadedById: true,
        person: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.comment.findMany({
      where:    { familyId: session.familyId, deletedAt: null },
      orderBy:  { createdAt: 'desc' },
      take:     FEED_LIMIT,
      include: {
        author:  { select: { id: true, name: true } },
        content: {
          select: {
            personId: true, type: true,
            person: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),
  ])

  // Resolver actor names para personas y media (no traen createdBy directo)
  const auditMap = new Map<string, string>() // entityId → actorName
  if (people.length > 0) {
    const personLogs = await prisma.auditLog.findMany({
      where: {
        familyId:   session.familyId,
        action:     'CREATE_PERSON',
        entityType: 'Person',
        entityId:   { in: people.map(p => p.id) },
      },
      select: { entityId: true, user: { select: { id: true, name: true } } },
    })
    for (const log of personLogs) auditMap.set(log.entityId, log.user.name)
  }

  // Para media: lookup users por uploadedById
  const uploaderIds = [...new Set(mediaRows.map(m => m.uploadedById))]
  const uploaders = uploaderIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: uploaderIds } },
        select: { id: true, name: true },
      })
    : []
  const uploaderById = new Map(uploaders.map(u => [u.id, u.name]))

  // Mergear los 4 streams en items
  const items: ActivityItem[] = []

  for (const p of people) {
    items.push({
      id:        `PERSON_CREATED:${p.id}`,
      kind:      'PERSON_CREATED',
      createdAt: p.createdAt.toISOString(),
      actorId:   '',
      actorName: auditMap.get(p.id) ?? 'Alguien',
      personId:    p.id,
      personName:  `${p.firstName} ${p.lastName}`.trim(),
      message:   `añadió a ${p.firstName} ${p.lastName}`.trim(),
      href:      `/${slug}/person/${p.id}`,
    })
  }

  for (const c of contents) {
    const typeLabel = contentTypeLabel(c.type)
    const personFullName = c.person ? `${c.person.firstName} ${c.person.lastName}`.trim() : ''
    items.push({
      id:        `CONTENT_CREATED:${c.id}`,
      kind:      'CONTENT_CREATED',
      createdAt: c.createdAt.toISOString(),
      actorId:   c.createdBy.id,
      actorName: c.createdBy.name,
      personId:    c.personId,
      personName:  personFullName,
      message:   `escribió ${typeLabel} en el perfil de ${personFullName}: "${c.title}"`,
      href:      `/${slug}/person/${c.personId}`,
    })
  }

  // Agrupar las fotos del mismo uploader+persona en el mismo día
  const mediaGrouped = new Map<string, { count: number; personId: string; personName: string; actorName: string; actorId: string; createdAt: Date; firstId: string }>()
  for (const m of mediaRows) {
    if (!m.person) continue
    const day = m.createdAt.toISOString().slice(0, 10)
    const key = `${m.uploadedById}|${m.personId}|${day}|${m.kind}`
    const personName = `${m.person.firstName} ${m.person.lastName}`.trim()
    const actorName = uploaderById.get(m.uploadedById) ?? 'Alguien'
    const ex = mediaGrouped.get(key)
    if (ex) {
      ex.count++
      // Quedarse con el más reciente como representante
      if (m.createdAt > ex.createdAt) ex.createdAt = m.createdAt
    } else {
      mediaGrouped.set(key, {
        count: 1,
        personId: m.personId,
        personName,
        actorName,
        actorId: m.uploadedById,
        createdAt: m.createdAt,
        firstId: m.id,
      })
    }
  }
  for (const [key, g] of mediaGrouped) {
    const kindLabel = key.split('|')[3] === 'AUDIO' ? 'audios' : key.split('|')[3] === 'VIDEO' ? 'videos' : g.count === 1 ? 'una foto' : `${g.count} fotos`
    items.push({
      id:        `MEDIA_UPLOADED:${g.firstId}`,
      kind:      'MEDIA_UPLOADED',
      createdAt: g.createdAt.toISOString(),
      actorId:   g.actorId,
      actorName: g.actorName,
      personId:    g.personId,
      personName:  g.personName,
      message:   `subió ${kindLabel} a ${g.personName}`,
      href:      `/${slug}/person/${g.personId}`,
    })
  }

  for (const c of comments) {
    const personName = c.content.person ? `${c.content.person.firstName} ${c.content.person.lastName}`.trim() : ''
    items.push({
      id:        `COMMENT_POSTED:${c.id}`,
      kind:      'COMMENT_POSTED',
      createdAt: c.createdAt.toISOString(),
      actorId:   c.author.id,
      actorName: c.author.name,
      personId:    c.content.personId,
      personName:  personName,
      message:   `comentó en ${contentTypeLabel(c.content.type, true)} de ${personName}: "${c.body.slice(0, 80)}${c.body.length > 80 ? '…' : ''}"`,
      href:      `/${slug}/person/${c.content.personId}#comment-${c.id}`,
    })
  }

  // Orden cronológico inverso
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return { ok: true, data: items.slice(0, FEED_LIMIT) }
}

function contentTypeLabel(type: string, withArticle = false): string {
  switch (type) {
    case 'STORY':     return withArticle ? 'una historia' : 'una historia'
    case 'RECIPE':    return withArticle ? 'una receta'   : 'una receta'
    case 'DIARY':     return withArticle ? 'una entrada de diario' : 'una entrada de diario'
    case 'INTERVIEW': return withArticle ? 'una entrevista' : 'una entrevista'
    case 'OBJECT':    return withArticle ? 'una pieza' : 'una pieza'
    case 'SOURCE':    return withArticle ? 'una fuente' : 'una fuente'
    default:          return 'contenido'
  }
}
