'use server'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { assertCanManagePerson } from '@/lib/permissions'
import { logAudit } from '@/lib/audit'
import type { ActionResult } from '@/lib/content-types'

/**
 * Extrae texto de una imagen (acta de bautismo, carta, certificado, etc.)
 * usando Claude Vision. Útil para hacer buscable contenido de documentos
 * antiguos que solo están como foto.
 *
 * Requiere ANTHROPIC_API_KEY en variables de entorno.
 */
export async function extractTextFromImage(
  mediaId: string
): Promise<ActionResult<{ text: string; usedImageUrl: string }>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'No autenticado' }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { ok: false, error: 'OCR no está configurado en este servidor (falta ANTHROPIC_API_KEY).' }
  }

  // Buscar la imagen — debe existir, pertenecer a la familia, y el viewer
  // debe poder gestionar la persona dueña (solo admins/representantes
  // pueden invocar OCR para evitar abuso de cuota).
  const media = await prisma.media.findUnique({
    where:  { id: mediaId },
    select: { id: true, personId: true, familyId: true, url: true, kind: true, mediumUrl: true, largeUrl: true },
  })
  if (!media || media.familyId !== session.familyId) {
    return { ok: false, error: 'Imagen no encontrada.' }
  }
  if (media.kind !== 'IMAGE') {
    return { ok: false, error: 'OCR solo funciona en imágenes.' }
  }
  try {
    await assertCanManagePerson(media.personId, session, 'content')
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message }
  }

  // Preferimos la variante "large" (1600px) — suficiente resolución para
  // OCR sin pagar por la imagen original 4K. Fallback a la URL principal.
  const imageUrl = media.largeUrl || media.url

  try {
    // Importación dinámica para no cargar el SDK en el cold path de
    // todas las requests. Solo se importa cuando alguien dispara OCR.
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey })

    // Descargar la imagen a base64 — Claude soporta URL pero MinIO usa
    // certificados internos que el API de Claude no resuelve. Mejor pasar
    // los bytes directamente.
    const imageRes = await fetch(imageUrl)
    if (!imageRes.ok) {
      return { ok: false, error: 'No se pudo descargar la imagen para OCR.' }
    }
    const buffer = Buffer.from(await imageRes.arrayBuffer())
    const base64 = buffer.toString('base64')
    const mimeType = imageRes.headers.get('content-type') || 'image/jpeg'

    if (mimeType !== 'image/jpeg' && mimeType !== 'image/png' && mimeType !== 'image/webp' && mimeType !== 'image/gif') {
      return { ok: false, error: `Formato no soportado por OCR: ${mimeType}` }
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type:       'base64',
              media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
              data:       base64,
            },
          },
          {
            type: 'text',
            text:
              'Esta imagen es un documento familiar antiguo (acta, carta, ' +
              'certificado, foto con texto, etc.). Por favor extrae TODO el ' +
              'texto visible, preservando la estructura (saltos de línea, ' +
              'párrafos). Si no hay texto, responde solo con "[Sin texto ' +
              'visible]". No agregues comentarios ni interpretación — solo ' +
              'el texto tal como aparece en el documento.',
          },
        ],
      }],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return { ok: false, error: 'Claude no devolvió texto.' }
    }

    void logAudit({
      familyId:   session.familyId,
      userId:     session.userId,
      action:     'OCR_IMAGE',
      entityType: 'Media',
      entityId:   mediaId,
      newValue:   { textLength: textBlock.text.length },
    })

    return { ok: true, data: { text: textBlock.text, usedImageUrl: imageUrl } }
  } catch (e: unknown) {
    console.error('[ocr] Error:', e)
    return { ok: false, error: (e as Error).message || 'Error al extraer texto.' }
  }
}
