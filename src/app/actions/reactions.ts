'use server'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { assertPersonAccess } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/content-types'
import type { ReactionType } from '@prisma/client'
import { REACTION_TYPES, type ReactionSummary, type ReactionTypeValue } from '@/lib/reactions-types'

// IMPORTANTE: NO re-exportar tipos desde aquí. Aunque conceptualmente
// `export type { ... }` es compile-time-only, Turbopack los procesa como
// exports en runtime cuando el archivo lleva 'use server' y rompe la
// carga del módulo SSR ("ReferenceError: ReactionSummary is not defined").
// Los consumidores deben importar tipos desde `@/lib/reactions-types`.

/**
 * Devuelve el resumen agregado de reacciones para un Content o Media.
 * Incluye conteos por tipo, si el usuario actual reaccionó, y un preview
 * con los primeros 3 nombres para hover/tooltip.
 */
export async function listReactions(target: {
  contentId?: string
  mediaId?:   string
}): Promise<ActionResult<ReactionSummary[]>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }
  if (!target.contentId && !target.mediaId) {
    return { ok: false, error: 'Debe especificar contentId o mediaId.' }
  }
  if (target.contentId && target.mediaId) {
    return { ok: false, error: 'Solo uno de contentId o mediaId.' }
  }

  // Verificar que el usuario tiene acceso a la persona dueña
  let personId: string
  if (target.contentId) {
    const c = await prisma.content.findUnique({
      where: { id: target.contentId },
      select: { familyId: true, personId: true, deletedAt: true },
    })
    if (!c || c.familyId !== session.familyId || c.deletedAt) {
      return { ok: false, error: 'Contenido no encontrado.' }
    }
    personId = c.personId
  } else {
    const m = await prisma.media.findUnique({
      where: { id: target.mediaId! },
      select: { familyId: true, personId: true },
    })
    if (!m || m.familyId !== session.familyId) {
      return { ok: false, error: 'Imagen no encontrada.' }
    }
    personId = m.personId
  }

  try { await assertPersonAccess(personId, session) }
  catch (e) { return { ok: false, error: (e as Error).message } }

  const where = target.contentId
    ? { contentId: target.contentId }
    : { mediaId:   target.mediaId }

  const rows = await prisma.reaction.findMany({
    where,
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  })

  // Agregar por tipo
  const byType = new Map<ReactionTypeValue, { count: number; mine: boolean; names: string[] }>()
  for (const r of rows) {
    const existing = byType.get(r.type as ReactionTypeValue) ?? { count: 0, mine: false, names: [] }
    existing.count++
    if (r.userId === session.userId) existing.mine = true
    if (existing.names.length < 3) existing.names.push(r.user.name)
    byType.set(r.type as ReactionTypeValue, existing)
  }

  // Devolver SIEMPRE los 5 tipos en orden, con count=0 para los que no tienen
  const result: ReactionSummary[] = REACTION_TYPES.map(type => {
    const data = byType.get(type)
    return {
      type,
      count:   data?.count   ?? 0,
      mine:    data?.mine    ?? false,
      preview: data?.names   ?? [],
    }
  })

  return { ok: true, data: result }
}

/**
 * Toggle: si el usuario ya reaccionó con ese tipo, borra; si no, crea.
 * Devuelve el resumen actualizado para que el cliente actualice optimisticamente.
 */
export async function toggleReaction(input: {
  type:      ReactionTypeValue
  contentId?: string
  mediaId?:   string
}): Promise<ActionResult<ReactionSummary[]>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }
  if (!REACTION_TYPES.includes(input.type)) {
    return { ok: false, error: 'Tipo de reacción inválido.' }
  }
  if (!input.contentId && !input.mediaId) {
    return { ok: false, error: 'Debe especificar contentId o mediaId.' }
  }
  if (input.contentId && input.mediaId) {
    return { ok: false, error: 'Solo uno de contentId o mediaId.' }
  }

  // Verificar acceso
  let personId: string
  if (input.contentId) {
    const c = await prisma.content.findUnique({
      where: { id: input.contentId },
      select: { familyId: true, personId: true, deletedAt: true },
    })
    if (!c || c.familyId !== session.familyId || c.deletedAt) {
      return { ok: false, error: 'Contenido no encontrado.' }
    }
    personId = c.personId
  } else {
    const m = await prisma.media.findUnique({
      where: { id: input.mediaId! },
      select: { familyId: true, personId: true },
    })
    if (!m || m.familyId !== session.familyId) {
      return { ok: false, error: 'Imagen no encontrada.' }
    }
    personId = m.personId
  }

  try { await assertPersonAccess(personId, session) }
  catch (e) { return { ok: false, error: (e as Error).message } }

  // Buscar reacción existente (única vía compound unique)
  const existing = await prisma.reaction.findFirst({
    where: {
      userId: session.userId,
      type:   input.type as ReactionType,
      ...(input.contentId ? { contentId: input.contentId } : { mediaId: input.mediaId }),
    },
  })

  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } })
  } else {
    await prisma.reaction.create({
      data: {
        familyId: session.familyId,
        userId:   session.userId,
        type:     input.type as ReactionType,
        ...(input.contentId ? { contentId: input.contentId } : { mediaId: input.mediaId }),
      },
    })
  }

  // Revalidar la página del perfil para que SSR se actualice
  const family = await prisma.family.findUnique({
    where: { id: session.familyId },
    select: { slug: true },
  })
  if (family) {
    revalidatePath(`/${family.slug}/person/${personId}`)
  }

  // Devolver el resumen actualizado
  return listReactions({ contentId: input.contentId, mediaId: input.mediaId })
}
