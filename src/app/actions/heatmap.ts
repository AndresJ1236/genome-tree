'use server'

// Heatmap de "riqueza de contenido" — por cada persona devuelve un score
// 0..100 basado en cuánto contenido se ha registrado (fotos, historias,
// recetas, audios, etc.). Sirve para que admins/representantes vean
// rápidamente qué partes del árbol están bien documentadas y cuáles
// necesitan trabajo.

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { canCreatePerson } from '@/lib/permissions'
import type { ActionResult } from '@/lib/content-types'

export interface PersonRichness {
  personId: string
  /** Score 0..100, usado para colorear el nodo. */
  score:    number
  /** Detalle por categoría — útil para tooltip. */
  counts: {
    media:      number  // fotos
    audioVideo: number  // audio + video (bonus por ser raros)
    stories:    number
    recipes:    number
    diary:      number
    interviews: number
    objects:    number
    sources:    number
    links:      number
  }
}

// Pesos por tipo de contenido — calibrados para que ~5 cosas variadas
// alcancen el verde, mientras que solo fotos no llegue (las fotos son
// fáciles de subir, los textos requieren más trabajo).
const W = {
  photo:      2,    // cap a 10 fotos = 20 puntos
  audioVideo: 8,    // raro y valioso
  story:      6,
  recipe:     6,
  diary:      4,
  interview:  6,
  object:     4,
  source:     4,
  link:       2,
}
const MAX_SCORE = 100  // score escalado al final

/**
 * Devuelve la riqueza de contenido de cada persona de la familia.
 * Solo accesible para admins o representantes (mismo gate que canCreatePerson).
 */
export async function getFamilyContentRichness(): Promise<ActionResult<PersonRichness[]>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  const allowed = await canCreatePerson(session)
  if (!allowed) return { ok: false, error: 'Solo admins o representantes' }

  // Una sola query agregada por categoría — más eficiente que N queries
  // por persona. Prisma no tiene un groupBy con count condicional para
  // múltiples relaciones, así que hacemos varios groupBy en paralelo.
  const familyId = session.familyId

  const [persons, mediaRows, contentRows, linkRows] = await Promise.all([
    prisma.person.findMany({
      where:  { familyId, deletedAt: null },
      select: { id: true },
    }),
    prisma.media.groupBy({
      by:    ['personId', 'kind'],
      where: { familyId },
      _count: { _all: true },
    }),
    prisma.content.groupBy({
      by:    ['personId', 'type'],
      where: { familyId, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.importantLink.groupBy({
      by:    ['personId'],
      where: { familyId },
      _count: { _all: true },
    }),
  ])

  // Acumular por personId
  const byPerson = new Map<string, PersonRichness>()
  for (const p of persons) {
    byPerson.set(p.id, {
      personId: p.id,
      score: 0,
      counts: {
        media: 0, audioVideo: 0, stories: 0, recipes: 0,
        diary: 0, interviews: 0, objects: 0, sources: 0, links: 0,
      },
    })
  }

  for (const row of mediaRows) {
    const r = byPerson.get(row.personId)
    if (!r) continue
    if (row.kind === 'AUDIO' || row.kind === 'VIDEO') r.counts.audioVideo += row._count._all
    else                                              r.counts.media      += row._count._all
  }

  for (const row of contentRows) {
    const r = byPerson.get(row.personId)
    if (!r) continue
    switch (row.type) {
      case 'STORY':     r.counts.stories    += row._count._all; break
      case 'RECIPE':    r.counts.recipes    += row._count._all; break
      case 'DIARY':     r.counts.diary      += row._count._all; break
      case 'INTERVIEW': r.counts.interviews += row._count._all; break
      case 'OBJECT':    r.counts.objects    += row._count._all; break
      case 'SOURCE':    r.counts.sources    += row._count._all; break
    }
  }

  for (const row of linkRows) {
    const r = byPerson.get(row.personId)
    if (r) r.counts.links += row._count._all
  }

  // Calcular score con caps
  for (const r of byPerson.values()) {
    const c = r.counts
    const raw =
        Math.min(c.media, 10) * W.photo
      + c.audioVideo * W.audioVideo
      + c.stories    * W.story
      + c.recipes    * W.recipe
      + c.diary      * W.diary
      + c.interviews * W.interview
      + c.objects    * W.object
      + c.sources    * W.source
      + c.links      * W.link
    r.score = Math.min(MAX_SCORE, raw)
  }

  return { ok: true, data: [...byPerson.values()] }
}
