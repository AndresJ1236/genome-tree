'use server'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { uploadFile, deleteFile, generateKey } from '@/lib/storage'
import { assertCanManagePerson } from '@/lib/permissions'
import { assertModuleEnabled, getModuleForContentType } from '@/lib/family-config'
import { logAudit } from '@/lib/audit'
import type { ActionResult } from '@/lib/content-types'

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const MEDIA_MAX        = 100       // máx imágenes por persona
const FEATURED_MAX     = 9         // máx destacadas por persona
const RECIPE_MEDIA_MAX = 3         // máx imágenes por receta/objeto
const MAX_FILE_SIZE    = 10 * 1024 * 1024  // 10 MB

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]

async function validateMagicBytes(file: File): Promise<boolean> {
  const buf = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  // JPEG: FF D8 FF
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true
  // GIF: 47 49 46 38
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true
  // WebP: RIFF....WEBP
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return true
  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// Subir imagen para una persona
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sube una imagen y la registra como Media de una persona.
 * Recibe FormData con: file (File), personId (string), featured? (string "true"/"false")
 */
export async function uploadMedia(
  formData: FormData
): Promise<ActionResult<{ id: string; url: string }>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  const file     = formData.get('file')     as File   | null
  const personId = formData.get('personId') as string | null
  const featured = formData.get('featured') === 'true'

  if (!file || !personId) {
    return { ok: false, error: 'Faltan datos: file y personId son requeridos.' }
  }

  // Validar tipo MIME declarado
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { ok: false, error: 'Formato no permitido. Usa JPG, PNG, WebP o GIF.' }
  }

  // Validar tamaño
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, error: 'La imagen no puede superar los 10 MB.' }
  }

  // Validar magic bytes (el tipo real del archivo, no solo el Content-Type)
  if (!(await validateMagicBytes(file))) {
    return { ok: false, error: 'El archivo no es una imagen válida.' }
  }

  // Verificar acceso a la persona
  try {
    await assertCanManagePerson(personId, session, 'content')
    await assertModuleEnabled(session.familyId, 'moduleMedia', 'El modulo de imagenes esta desactivado.')
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message }
  }

  // Verificar límite total de imágenes
  const totalCount = await prisma.media.count({ where: { personId } })
  if (totalCount >= MEDIA_MAX) {
    return { ok: false, error: `Límite alcanzado: máximo ${MEDIA_MAX} imágenes por persona.` }
  }

  // Verificar límite de destacadas si aplica
  if (featured) {
    const featuredCount = await prisma.media.count({ where: { personId, featured: true } })
    if (featuredCount >= FEATURED_MAX) {
      return {
        ok: false,
        error: `Límite alcanzado: máximo ${FEATURED_MAX} imágenes destacadas por persona.`,
      }
    }
  }

  // Obtener familySlug para construir la clave
  const family = await prisma.family.findUnique({
    where:  { id: session.familyId },
    select: { slug: true },
  })
  if (!family) return { ok: false, error: 'Familia no encontrada.' }

  // Subir archivo
  const buffer = Buffer.from(await file.arrayBuffer())
  const key    = generateKey(family.slug, personId, file.type)

  let url: string
  try {
    const result = await uploadFile(key, buffer, file.type)
    url = result.url
  } catch (e: unknown) {
    console.error('[uploadMedia] Error subiendo archivo:', e)
    return { ok: false, error: 'Error al subir la imagen. Intenta de nuevo.' }
  }

  // Calcular order: último + 1
  const lastMedia = await prisma.media.findFirst({
    where:   { personId },
    orderBy: { order: 'desc' },
    select:  { order: true },
  })
  const order = (lastMedia?.order ?? -1) + 1

  // Registrar en DB
  const media = await prisma.media.create({
    data: {
      personId,
      familyId:     session.familyId,
      url,
      key,
      mimeType:     file.type,
      featured,
      order,
      uploadedById: session.userId,
    },
  })

  return { ok: true, data: { id: media.id, url: media.url } }
}

// ─────────────────────────────────────────────────────────────────────────────
// Subir imagen para un contenido (receta u objeto) — máx RECIPE_MEDIA_MAX
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadContentMedia(
  formData: FormData
): Promise<ActionResult<{ id: string; url: string }>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  const file      = formData.get('file')      as File   | null
  const personId  = formData.get('personId')  as string | null
  const contentId = formData.get('contentId') as string | null

  if (!file || !personId || !contentId) {
    return { ok: false, error: 'Faltan datos requeridos.' }
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { ok: false, error: 'Formato no permitido. Usa JPG, PNG, WebP o GIF.' }
  }

  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, error: 'La imagen no puede superar los 10 MB.' }
  }

  if (!(await validateMagicBytes(file))) {
    return { ok: false, error: 'El archivo no es una imagen válida.' }
  }

  try {
    await assertCanManagePerson(personId, session, 'content')
    await assertModuleEnabled(session.familyId, 'moduleMedia', 'El modulo de imagenes esta desactivado.')
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message }
  }

  // Verificar que el contenido existe y pertenece a la familia
  const content = await prisma.content.findUnique({
    where:   { id: contentId },
    include: { media: true },
  })
  if (!content || content.familyId !== session.familyId) {
    return { ok: false, error: 'Contenido no encontrado.' }
  }

  try {
    await assertModuleEnabled(
      session.familyId,
      getModuleForContentType(content.type),
      'El modulo de este contenido esta desactivado.'
    )
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message }
  }

  if (content.media.length >= RECIPE_MEDIA_MAX) {
    return {
      ok: false,
      error: `Límite alcanzado: máximo ${RECIPE_MEDIA_MAX} imágenes por contenido.`,
    }
  }

  const family = await prisma.family.findUnique({
    where:  { id: session.familyId },
    select: { slug: true },
  })
  if (!family) return { ok: false, error: 'Familia no encontrada.' }

  const buffer = Buffer.from(await file.arrayBuffer())
  const key    = generateKey(family.slug, personId, file.type)

  let url: string
  try {
    const result = await uploadFile(key, buffer, file.type)
    url = result.url
  } catch (e: unknown) {
    console.error('[uploadContentMedia] Error subiendo archivo:', e)
    return { ok: false, error: 'Error al subir la imagen. Intenta de nuevo.' }
  }

  // Registrar Media y vincularlo al Content en una transacción
  const order = content.media.length

  const media = await prisma.$transaction(async tx => {
    const m = await tx.media.create({
      data: {
        personId,
        familyId:     session.familyId,
        url,
        key,
        mimeType:     file.type,
        featured:     false,
        order,
        uploadedById: session.userId,
      },
    })
    await tx.contentMedia.create({
      data: { contentId, mediaId: m.id, order },
    })
    return m
  })

  return { ok: true, data: { id: media.id, url: media.url } }
}

// ─────────────────────────────────────────────────────────────────────────────
// Eliminar imagen
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteMedia(
  mediaId: string
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  const media = await prisma.media.findUnique({
    where:  { id: mediaId },
    select: { key: true, familyId: true, personId: true },
  })

  if (!media || media.familyId !== session.familyId) {
    return { ok: false, error: 'Imagen no encontrada.' }
  }

  // Solo el propietario de la persona o ADMIN puede eliminar
  if (session.role !== 'ADMIN') {
    try {
      await assertCanManagePerson(media.personId, session, 'content')
    } catch (e: unknown) {
      return { ok: false, error: (e as Error).message }
    }
  }

  // Eliminar en cascada: ContentMedia → Media → archivo
  await prisma.$transaction([
    prisma.contentMedia.deleteMany({ where: { mediaId } }),
    prisma.media.delete({ where: { id: mediaId } }),
  ])

  // Eliminar archivo del storage (no bloquea si falla)
  deleteFile(media.key).catch(err =>
    console.error('[deleteMedia] Error eliminando archivo:', err)
  )

  void logAudit({
    familyId: session.familyId,
    userId: session.userId,
    action: 'DELETE_MEDIA',
    entityType: 'Media',
    entityId: mediaId,
    oldValue: { key: media.key, personId: media.personId },
  })

  return { ok: true, data: undefined }
}

// ─────────────────────────────────────────────────────────────────────────────
// Actualizar metadatos de una imagen (alt, caption)
// ─────────────────────────────────────────────────────────────────────────────

export async function updateMediaMeta(
  mediaId: string,
  data: { alt?: string; caption?: string }
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  const media = await prisma.media.findUnique({
    where:  { id: mediaId },
    select: { familyId: true, personId: true },
  })

  if (!media || media.familyId !== session.familyId) {
    return { ok: false, error: 'Imagen no encontrada.' }
  }

  try {
    await assertCanManagePerson(media.personId, session, 'content')
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message }
  }

  await prisma.media.update({ where: { id: mediaId }, data })
  return { ok: true, data: undefined }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reordenar galería
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recibe un array de IDs en el nuevo orden y actualiza el campo `order`.
 */
export async function reorderMedia(
  personId:     string,
  orderedIds:   string[]
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  try {
    await assertCanManagePerson(personId, session, 'content')
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message }
  }

  // Actualizar todos los orders en una transacción
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.media.update({
        where: { id },
        data:  { order: index },
      })
    )
  )

  return { ok: true, data: undefined }
}

// ─────────────────────────────────────────────────────────────────────────────
// Marcar / desmarcar imagen como destacada
// ─────────────────────────────────────────────────────────────────────────────

export async function toggleFeaturedMedia(
  mediaId:  string,
  featured: boolean
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  const media = await prisma.media.findUnique({
    where:  { id: mediaId },
    select: { personId: true, familyId: true },
  })

  if (!media || media.familyId !== session.familyId) {
    return { ok: false, error: 'Imagen no encontrada.' }
  }

  try {
    await assertCanManagePerson(media.personId, session, 'content')
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message }
  }

  // Si se quiere destacar, verificar límite
  if (featured) {
    const featuredCount = await prisma.media.count({
      where: { personId: media.personId, featured: true },
    })
    if (featuredCount >= FEATURED_MAX) {
      return { ok: false, error: `Máximo ${FEATURED_MAX} fotos destacadas por persona.` }
    }
  }

  await prisma.media.update({ where: { id: mediaId }, data: { featured } })
  return { ok: true, data: undefined }
}
