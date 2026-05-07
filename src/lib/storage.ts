import 'server-only'
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
} from '@aws-sdk/client-s3'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

// Configuration
//
// In production (Docker Compose): MINIO_ENDPOINT, MINIO_PORT, MINIO_ROOT_USER,
//   MINIO_ROOT_PASSWORD and MINIO_BUCKET must be defined.
//
// In development: if MinIO is unavailable, the module falls back automatically
//   to local storage under /public/uploads/ and returns relative URLs.

function getConfig() {
  return {
    endpoint:  process.env.MINIO_ENDPOINT ?? '',
    port:      parseInt(process.env.MINIO_PORT ?? '9000', 10),
    user:      process.env.MINIO_ROOT_USER ?? '',
    password:  process.env.MINIO_ROOT_PASSWORD ?? '',
    bucket:    process.env.MINIO_BUCKET ?? 'genome-tree',
    useMinIO:  !!process.env.MINIO_ENDPOINT,
    // Public base URL for browser access (e.g. https://arbol.example.com/media)
    // Falls back to direct MinIO URL if not set
    publicUrl: process.env.MINIO_PUBLIC_URL?.replace(/\/$/, '') ?? '',
  }
}

let _client: S3Client | null = null

function getClient(): S3Client {
  if (_client) return _client
  const cfg = getConfig()
  _client = new S3Client({
    endpoint: `http://${cfg.endpoint}:${cfg.port}`,
    region: 'us-east-1',
    credentials: { accessKeyId: cfg.user, secretAccessKey: cfg.password },
    forcePathStyle: true,
  })
  return _client
}

let _bucketReady = false

/**
 * Bucket policy that allows anonymous GetObject on every key in the bucket.
 *
 * Why this is safe: nginx already gates /media/ behind a session cookie via
 * auth_request, so no anonymous traffic can hit MinIO from outside. The
 * MinIO bucket itself only ever talks to the nginx container on the
 * internal Docker network. Object keys are unguessable (CUID + epoch ms +
 * 6-char random suffix), so even if a malicious actor somehow bypassed
 * nginx, they would still need to guess the exact path.
 *
 * Without this policy, nginx's proxy_pass to MinIO returns 403 because
 * nginx doesn't sign the request with MinIO credentials — and AWS S3 /
 * MinIO buckets default to "private" on creation.
 */
function publicReadPolicy(bucket: string): string {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  })
}

async function ensureBucket(): Promise<void> {
  if (_bucketReady) return
  const client = getClient()
  const { bucket } = getConfig()

  let needsPolicy = false
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }))
    needsPolicy = true
  }

  // Apply the public-read policy on every cold start. Idempotent — MinIO
  // accepts the same policy doc repeatedly. We only NEED to do this once
  // when the bucket is freshly created, but doing it always is cheaper
  // than tracking persistent state and protects against the policy being
  // wiped manually.
  if (needsPolicy || !_bucketReady) {
    try {
      await client.send(new PutBucketPolicyCommand({
        Bucket: bucket,
        Policy: publicReadPolicy(bucket),
      }))
    } catch (e) {
      // Don't crash the app if policy fails — uploads still work; only
      // public reads break, and those will be visible in the UI.
      console.warn('[storage] PutBucketPolicy failed:', e)
    }
  }

  _bucketReady = true
}

export type UploadResult = {
  url: string
  key: string
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

async function uploadFileLocally(key: string, buffer: Buffer): Promise<UploadResult> {
  const localPath = path.join(process.cwd(), 'public', 'uploads', key)
  await mkdir(path.dirname(localPath), { recursive: true })
  await writeFile(localPath, buffer)
  return { url: `/uploads/${key}`, key }
}

export async function uploadFile(
  key: string,
  buffer: Buffer,
  mimeType: string
): Promise<UploadResult> {
  const cfg = getConfig()

  if (cfg.useMinIO) {
    try {
      await ensureBucket()
      await getClient().send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
        })
      )
      const publicBase = cfg.publicUrl || `http://${cfg.endpoint}:${cfg.port}/${cfg.bucket}`
      return { url: `${publicBase}/${key}`, key }
    } catch (error: unknown) {
      if (isProduction()) {
        throw new Error(
          'MinIO no esta disponible en produccion. Revisa MINIO_ENDPOINT, MINIO_PORT y el servicio de almacenamiento.'
        )
      }

      console.warn(
        '[storage] MinIO no disponible en desarrollo; usando fallback local en /public/uploads.',
        error
      )
      return uploadFileLocally(key, buffer)
    }
  }

  return uploadFileLocally(key, buffer)
}

export async function deleteFile(key: string): Promise<void> {
  const cfg = getConfig()

  if (cfg.useMinIO) {
    try {
      await getClient().send(
        new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key })
      )
    } catch {
      // Ignore missing objects.
    }
    return
  }

  try {
    const { unlink } = await import('fs/promises')
    const localPath = path.join(process.cwd(), 'public', 'uploads', key)
    await unlink(localPath)
  } catch {
    // Ignore missing files.
  }
}

export function getPublicUrl(key: string): string {
  const cfg = getConfig()
  if (cfg.useMinIO) {
    const publicBase = cfg.publicUrl || `http://${cfg.endpoint}:${cfg.port}/${cfg.bucket}`
    return `${publicBase}/${key}`
  }
  return `/uploads/${key}`
}

/**
 * Map a canonical MIME type to a single, unambiguous file extension.
 * Falls back to "bin" only if the MIME is genuinely unknown.
 */
const MIME_TO_EXT: Record<string, string> = {
  // Imágenes
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
  // Audio
  'audio/mpeg': 'mp3',
  'audio/mp4':  'm4a',
  'audio/aac':  'aac',
  'audio/ogg':  'ogg',
  'audio/wav':  'wav',
  'audio/webm': 'webm',
  'audio/x-m4a': 'm4a',
  // Video
  'video/mp4':       'mp4',
  'video/webm':      'webm',
  'video/quicktime': 'mov',
  'video/x-m4v':     'm4v',
}

export function generateKey(
  familySlug: string,
  personId: string,
  mimeType: string
): string {
  const ext = MIME_TO_EXT[mimeType.toLowerCase()] ?? 'bin'
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(2, 8)
  return `${familySlug}/${personId}/${timestamp}-${random}.${ext}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Image processing — sharp pipeline
// ─────────────────────────────────────────────────────────────────────────────

// Tamaños de variantes (lado mayor en px). Se generan SIEMPRE en WebP.
export const VARIANT_SIZES = {
  thumb:  150,   // ~10 KB, cuadrado (cover) — nodos del árbol
  medium: 400,   // ~50 KB — galería, avatar de perfil
  large:  1600,  // ~250 KB — vista expandida del perfil
} as const

// Original capeado a 4K (3840×3840 max, lado mayor). Si la imagen ya es más
// chica, se sube tal cual sin re-codificar (preserva calidad y metadata).
export const ORIGINAL_MAX_DIMENSION = 3840

// Cap más bajo para imágenes anexadas a contenido (historias, recetas).
// HD 1920px es suficiente para galería y reduce ~75% el peso.
export const CONTENT_MAX_DIMENSION = 1920

export interface ProcessedImage {
  original: { buffer: Buffer; mimeType: string; width: number; height: number }
  large:    Buffer
  medium:   Buffer
  thumb:    Buffer
}

/**
 * Procesa una imagen subida produciendo:
 *   • original capeado a ORIGINAL_MAX_DIMENSION (manteniendo aspect ratio)
 *   • large WebP a VARIANT_SIZES.large
 *   • medium WebP a VARIANT_SIZES.medium
 *   • thumb WebP cuadrado a VARIANT_SIZES.thumb (fit cover, ideal para avatares)
 *
 * `.rotate()` aplicado en cada variante respeta la orientación EXIF — sin esto,
 * fotos de iPhone aparecen rotadas en navegadores que ignoran EXIF.
 */
export async function processImage(
  input: Buffer,
  inputMimeType: string,
  options: { maxDimension?: number } = {}
): Promise<ProcessedImage> {
  // Import dinámico para no cargar sharp en cold path si solo se borra
  const sharp = (await import('sharp')).default
  const cap = options.maxDimension ?? ORIGINAL_MAX_DIMENSION

  const meta = await sharp(input).metadata()
  const w = meta.width ?? 0
  const h = meta.height ?? 0
  const needsCap = w > cap || h > cap

  // Original: si la imagen es muy grande, recodificar capeada (preservando formato).
  // Si ya es chica, devolver el buffer original sin tocar.
  let originalBuffer = input
  let finalMimeType = inputMimeType
  let finalWidth = w
  let finalHeight = h

  if (needsCap) {
    const pipe = sharp(input).rotate().resize({
      width:  cap,
      height: cap,
      fit:    'inside',
      withoutEnlargement: true,
    })

    // Mantener formato original cuando es razonable; PNG con alpha se queda PNG.
    if (inputMimeType === 'image/png') {
      originalBuffer = await pipe.png({ compressionLevel: 9 }).toBuffer()
      finalMimeType = 'image/png'
    } else if (inputMimeType === 'image/webp') {
      originalBuffer = await pipe.webp({ quality: 90 }).toBuffer()
      finalMimeType = 'image/webp'
    } else if (inputMimeType === 'image/gif') {
      // sharp soporta GIF lectura pero no escritura animada estable; preservar tal cual
      originalBuffer = input
    } else {
      // JPEG y todo lo demás → JPEG calidad 90
      originalBuffer = await pipe.jpeg({ quality: 90, mozjpeg: true }).toBuffer()
      finalMimeType = 'image/jpeg'
    }

    // Releer dimensiones reales después del cap
    const newMeta = await sharp(originalBuffer).metadata()
    finalWidth = newMeta.width ?? finalWidth
    finalHeight = newMeta.height ?? finalHeight
  }

  // Variantes — siempre WebP
  const [largeBuf, mediumBuf, thumbBuf] = await Promise.all([
    sharp(input).rotate().resize({
      width:  VARIANT_SIZES.large,
      height: VARIANT_SIZES.large,
      fit:    'inside',
      withoutEnlargement: true,
    }).webp({ quality: 85 }).toBuffer(),

    sharp(input).rotate().resize({
      width:  VARIANT_SIZES.medium,
      height: VARIANT_SIZES.medium,
      fit:    'inside',
      withoutEnlargement: true,
    }).webp({ quality: 80 }).toBuffer(),

    sharp(input).rotate().resize({
      width:  VARIANT_SIZES.thumb,
      height: VARIANT_SIZES.thumb,
      fit:    'cover',         // cuadrado — para avatares circulares
      position: 'attention',   // sharp encuentra la región "interesante" (ej. caras)
    }).webp({ quality: 75 }).toBuffer(),
  ])

  return {
    original: { buffer: originalBuffer, mimeType: finalMimeType, width: finalWidth, height: finalHeight },
    large:    largeBuf,
    medium:   mediumBuf,
    thumb:    thumbBuf,
  }
}

export interface VariantUploadResult {
  url:       string   // original
  key:       string   // original
  thumbUrl:  string
  mediumUrl: string
  largeUrl:  string
  mimeType:  string
  width:     number
  height:    number
}

/**
 * Sube las 4 versiones (original + 3 variantes WebP) en paralelo y devuelve
 * los URLs públicos. Las variantes derivan del key del original con sufijos
 * predecibles: `<base>-thumb.webp`, `<base>-medium.webp`, `<base>-large.webp`.
 */
export async function uploadProcessedImage(
  baseKey: string,
  processed: ProcessedImage
): Promise<VariantUploadResult> {
  // baseKey = `family/personId/timestamp-rand.jpg`
  // Para variantes: cambiar extensión y agregar sufijo
  const lastDot = baseKey.lastIndexOf('.')
  const stem = lastDot >= 0 ? baseKey.slice(0, lastDot) : baseKey

  const thumbKey  = `${stem}-thumb.webp`
  const mediumKey = `${stem}-medium.webp`
  const largeKey  = `${stem}-large.webp`

  const [origRes, thumbRes, mediumRes, largeRes] = await Promise.all([
    uploadFile(baseKey,   processed.original.buffer, processed.original.mimeType),
    uploadFile(thumbKey,  processed.thumb,  'image/webp'),
    uploadFile(mediumKey, processed.medium, 'image/webp'),
    uploadFile(largeKey,  processed.large,  'image/webp'),
  ])

  return {
    url:       origRes.url,
    key:       origRes.key,
    thumbUrl:  thumbRes.url,
    mediumUrl: mediumRes.url,
    largeUrl:  largeRes.url,
    mimeType:  processed.original.mimeType,
    width:     processed.original.width,
    height:    processed.original.height,
  }
}

/**
 * Borra el original Y todas las variantes asociadas al baseKey.
 * Tolerante: si una variante no existe (ej. fila legacy pre-backfill), no
 * lanza error.
 */
export async function deleteFileWithVariants(baseKey: string): Promise<void> {
  const lastDot = baseKey.lastIndexOf('.')
  const stem = lastDot >= 0 ? baseKey.slice(0, lastDot) : baseKey
  await Promise.all([
    deleteFile(baseKey),
    deleteFile(`${stem}-thumb.webp`),
    deleteFile(`${stem}-medium.webp`),
    deleteFile(`${stem}-large.webp`),
  ])
}

// ─────────────────────────────────────────────────────────────────────────────
// Audio / Video — guarda el original tal cual, sin transcoding
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Para audio/video, en esta primera fase guardamos el archivo SIN transcoding.
 * Los navegadores modernos reproducen mp4/webm/mp3/m4a/ogg directamente con
 * <video>/<audio> elements.
 *
 * Casos cubiertos sin ffmpeg:
 *  ✓ MP3, M4A, AAC, OGG, WebM audio — todos reproducen
 *  ✓ MP4 (H.264) — el formato más común de celular
 *  ✓ WebM video
 *  ✗ MOV (QuickTime) — Safari sí, otros NO. Si es problema lo agregamos.
 *
 * Si en el futuro necesitamos thumbnails de video o transcoding a MP4,
 * agregaríamos ffmpeg-static + fluent-ffmpeg al Dockerfile.
 */
export const VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',  // .mov de iPhone
  'video/x-m4v',
] as const

export const AUDIO_MIME_TYPES = [
  'audio/mpeg',       // MP3
  'audio/mp4',        // M4A
  'audio/aac',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/x-m4a',
] as const

export const MAX_AUDIO_SIZE = 50 * 1024 * 1024    // 50 MB → ~50 min de audio
export const MAX_VIDEO_SIZE = 200 * 1024 * 1024   // 200 MB → ~5-10 min HD

export function classifyMime(mime: string): 'image' | 'audio' | 'video' | 'unknown' {
  const m = mime.toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('audio/')) return 'audio'
  if (m.startsWith('video/')) return 'video'
  return 'unknown'
}

export interface SimpleUploadResult {
  url:         string
  key:         string
  mimeType:    string
  durationSec: number | null    // siempre null en esta fase (sin ffmpeg)
}

/**
 * Sube un archivo de audio o video tal cual a MinIO. No genera variantes
 * ni extrae duración (eso requeriría ffmpeg). El cliente puede leer la
 * duración del <audio>/<video> element via metadata events si lo necesita.
 */
export async function uploadMediaFile(
  baseKey: string,
  buffer: Buffer,
  mimeType: string
): Promise<SimpleUploadResult> {
  const result = await uploadFile(baseKey, buffer, mimeType)
  return {
    url:         result.url,
    key:         result.key,
    mimeType,
    durationSec: null,
  }
}
