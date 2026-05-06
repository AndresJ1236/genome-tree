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
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
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
