'use server'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import {
  generateKey,
  processImage,
  uploadProcessedImage,
  deleteFileWithVariants,
} from '@/lib/storage'
import { assertCanManagePerson } from '@/lib/permissions'
import { assertModuleEnabled, getModuleForContentType } from '@/lib/family-config'
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

// Map filename extensions → canonical MIME type.
// Used to recover when the browser sends an empty/unknown file.type
// (notably for .jpeg files on some platforms).
const EXT_TO_MIME: Record<string, string> = {
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  pjpeg: 'image/jpeg',
  png:  'image/png',
  webp: 'image/webp',
  gif:  'image/gif',
}

/**
 * Resolve a canonical MIME type for a file.
 *
 * Browsers sometimes send unhelpful values for `file.type`:
 *   - empty string  (rare, but happens on some Linux distros / older browsers)
 *   - "image/jpg"   (informal alias used by a few uploaders)
 *   - other variants that aren't in our allow-list
 *
 * If the reported type is recognized, we keep it. Otherwise we fall back
 * to the file extension. Returns null if neither route gives us a known type.
 */
function resolveMimeType(file: File): string | null {
  // Normalize informal aliases first
  const reported = file.type.toLowerCase().replace('image/jpg', 'image/jpeg')
  if (ALLOWED_MIME_TYPES.includes(reported)) return reported

  // Fall back to extension
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext && EXT_TO_MIME[ext]) return EXT_TO_MIME[ext]

  return null
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

  // Resolve canonical MIME — handles browsers that report an empty or
  // informal type (e.g. "image/jpg") for .jpeg files.
  const mimeType = resolveMimeType(file)
  if (!mimeType) {
    return { ok: false, error: 'Formato no permitido. Usa JPG, PNG, WebP o GIF.' }
  }

  // Validar tamaño
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, error: 'La imagen no puede superar los 10 MB.' }
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

  // Procesar imagen: capeada a 4K + 3 variantes WebP (thumb/medium/large).
  // Sube las 4 versiones a MinIO en paralelo.
  const buffer = Buffer.from(await file.arrayBuffer())
  const baseKey = generateKey(family.slug, personId, mimeType)

  let uploaded
  try {
    const processed = await processImage(buffer, mimeType)
    uploaded = await uploadProcessedImage(baseKey, processed)
  } catch (e: unknown) {
    console.error('[uploadMedia] Error procesando o subiendo:', e)
    return { ok: false, error: 'Error al procesar la imagen. Intenta de nuevo.' }
  }

  // Calcular order: último + 1
  const lastMedia = await prisma.media.findFirst({
    where:   { personId },
    orderBy: { order: 'desc' },
    select:  { order: true },
  })
  const order = (lastMedia?.order ?? -1) + 1

  // Registrar en DB con todas las variantes
  const media = await prisma.media.create({
    data: {
      personId,
      familyId:     session.familyId,
      url:          uploaded.url,
      key:          uploaded.key,
      mimeType:     uploaded.mimeType,
      thumbUrl:     uploaded.thumbUrl,
      mediumUrl:    uploaded.mediumUrl,
      largeUrl:     uploaded.largeUrl,
      width:        uploaded.width,
      height:       uploaded.height,
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

  const mimeType = resolveMimeType(file)
  if (!mimeType) {
    return { ok: false, error: 'Formato no permitido. Usa JPG, PNG, WebP o GIF.' }
  }

  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, error: 'La imagen no puede superar los 10 MB.' }
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
  const baseKey = generateKey(family.slug, personId, mimeType)

  let uploaded
  try {
    const processed = await processImage(buffer, mimeType)
    uploaded = await uploadProcessedImage(baseKey, processed)
  } catch (e: unknown) {
    console.error('[uploadContentMedia] Error procesando o subiendo:', e)
    return { ok: false, error: 'Error al procesar la imagen. Intenta de nuevo.' }
  }

  // Registrar Media y vincularlo al Content en una transacción
  const order = content.media.length

  const media = await prisma.$transaction(async tx => {
    const m = await tx.media.create({
      data: {
        personId,
        familyId:     session.familyId,
        url:          uploaded.url,
        key:          uploaded.key,
        mimeType:     uploaded.mimeType,
        thumbUrl:     uploaded.thumbUrl,
        mediumUrl:    uploaded.mediumUrl,
        largeUrl:     uploaded.largeUrl,
        width:        uploaded.width,
        height:       uploaded.height,
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

  // Eliminar original + 3 variantes WebP del storage (no bloquea si falla)
  deleteFileWithVariants(media.key).catch(err =>
    console.error('[deleteMedia] Error eliminando archivos:', err)
  )

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
