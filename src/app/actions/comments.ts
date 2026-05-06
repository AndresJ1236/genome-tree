'use server'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { revalidatePath } from 'next/cache'
import { assertPersonAccess } from '@/lib/permissions'
import type { ActionResult } from '@/lib/content-types'

const MAX_BODY_CHARS = 2000

export interface CommentItem {
  id:        string
  body:      string
  authorId:  string
  authorName: string
  createdAt: string         // ISO
  isMine:    boolean        // true si el viewer es el autor
}

/**
 * Lista los comentarios de un Content. Solo los no eliminados.
 * Cualquier usuario que pueda VER el contenido puede leer sus comentarios
 * (la verificación de acceso ya la hace getProfilePayload aguas arriba; aquí
 * solo confirmamos pertenencia a la familia).
 */
export async function listComments(contentId: string): Promise<ActionResult<CommentItem[]>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  const content = await prisma.content.findUnique({
    where: { id: contentId },
    select: { familyId: true, personId: true, deletedAt: true },
  })
  if (!content || content.familyId !== session.familyId) {
    return { ok: false, error: 'Contenido no encontrado.' }
  }
  if (content.deletedAt) {
    return { ok: false, error: 'Contenido eliminado.' }
  }

  // Asegurar que el viewer puede ver a la persona dueña del contenido
  try {
    await assertPersonAccess(content.personId, session)
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }

  const rows = await prisma.comment.findMany({
    where:   { contentId, deletedAt: null },
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  })

  const items: CommentItem[] = rows.map(r => ({
    id:         r.id,
    body:       r.body,
    authorId:   r.authorId,
    authorName: r.author.name,
    createdAt:  r.createdAt.toISOString(),
    isMine:     r.authorId === session.userId,
  }))

  return { ok: true, data: items }
}

/**
 * Crea un nuevo comentario en un Content.
 * Cualquier miembro de la familia que pueda ver el contenido puede comentar.
 */
export async function createComment(
  contentId: string,
  body: string
): Promise<ActionResult<CommentItem>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  const trimmed = body.trim()
  if (!trimmed) return { ok: false, error: 'El comentario no puede estar vacío.' }
  if (trimmed.length > MAX_BODY_CHARS) {
    return { ok: false, error: `El comentario no puede superar ${MAX_BODY_CHARS} caracteres.` }
  }

  const content = await prisma.content.findUnique({
    where: { id: contentId },
    select: { familyId: true, personId: true, deletedAt: true },
  })
  if (!content || content.familyId !== session.familyId) {
    return { ok: false, error: 'Contenido no encontrado.' }
  }
  if (content.deletedAt) {
    return { ok: false, error: 'Contenido eliminado.' }
  }

  try {
    await assertPersonAccess(content.personId, session)
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }

  const created = await prisma.comment.create({
    data: {
      contentId,
      familyId: session.familyId,
      authorId: session.userId,
      body:     trimmed,
    },
    include: { author: { select: { name: true } } },
  })

  // El audit log dispara la fan-out de notificaciones automáticamente
  void logAudit({
    familyId:   session.familyId,
    userId:     session.userId,
    action:     'CREATE_COMMENT',
    entityType: 'Comment',
    entityId:   created.id,
    newValue:   {
      contentId,
      personId: content.personId,
      preview:  trimmed.slice(0, 80),
    },
  })

  // Revalidar la página del perfil para que aparezca el comentario en server-side renders
  const family = await prisma.family.findUnique({ where: { id: session.familyId }, select: { slug: true } })
  if (family) {
    revalidatePath(`/${family.slug}/person/${content.personId}`)
  }

  return {
    ok: true,
    data: {
      id:         created.id,
      body:       created.body,
      authorId:   created.authorId,
      authorName: created.author.name,
      createdAt:  created.createdAt.toISOString(),
      isMine:     true,
    },
  }
}

/**
 * Soft-delete un comentario. El autor puede borrar sus propios comentarios;
 * los admins pueden borrar cualquiera.
 */
export async function deleteComment(commentId: string): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  const comment = await prisma.comment.findUnique({
    where:  { id: commentId },
    select: { authorId: true, familyId: true, contentId: true, deletedAt: true, content: { select: { personId: true } } },
  })
  if (!comment || comment.familyId !== session.familyId) {
    return { ok: false, error: 'Comentario no encontrado.' }
  }
  if (comment.deletedAt) {
    return { ok: false, error: 'Este comentario ya fue eliminado.' }
  }

  const isAdmin  = session.role === 'ADMIN' || session.scope === 'ADMIN'
  const isAuthor = comment.authorId === session.userId
  if (!isAdmin && !isAuthor) {
    return { ok: false, error: 'Solo puedes borrar tus propios comentarios.' }
  }

  await prisma.comment.update({
    where: { id: commentId },
    data:  { deletedAt: new Date() },
  })

  void logAudit({
    familyId:   session.familyId,
    userId:     session.userId,
    action:     'DELETE_COMMENT',
    entityType: 'Comment',
    entityId:   commentId,
  })

  const family = await prisma.family.findUnique({ where: { id: session.familyId }, select: { slug: true } })
  if (family) {
    revalidatePath(`/${family.slug}/person/${comment.content.personId}`)
  }

  return { ok: true, data: undefined }
}
