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

// Pesos por tipo de contenido. Filosofía: las fotos son fáciles de subir
// (y se cap a 10 para evitar que alguien con 100 fotos sin más contenido
// llegue a verde), los textos pesan más porque requieren esfuerzo, los
// audios/videos son los más valiosos (preservar voces de los abuelos).
const W = {
  photo:      2,    // cap a 10 fotos = 20 puntos máximo
  audioVideo: 10,   // raro y valioso
  story:      8,
  recipe:     7,
  diary:      5,
  interview:  8,
  object:     5,
  source:     6,    // documentos importantes
  link:       3,
}

// Puntos brutos necesarios para llegar al "verde pleno" (score 100).
// 60 puntos = ej: 1 audio (10) + 2 historias (16) + 1 receta (7) +
//                1 entrevista (8) + 5 fotos (10) + 1 fuente (6) ≈ 57.
// O bien: 6 historias + audio + foto = 60.
// Calibrado para que una persona "bien documentada" llegue a verde
// sin necesidad de tener todas las categorías llenas.
const RAW_FOR_FULL_GREEN = 60

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

  // Calcular score con caps. Score 0..100 escalado contra
  // RAW_FOR_FULL_GREEN: 100 = verde pleno, 50 = amarillo, 0 = rojo.
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
    r.score = Math.min(100, Math.round((raw / RAW_FOR_FULL_GREEN) * 100))
  }

  return { ok: true, data: [...byPerson.values()] }
}
