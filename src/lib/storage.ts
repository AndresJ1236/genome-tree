import 'server-only'
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
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

async function ensureBucket(): Promise<void> {
  if (_bucketReady) return
  const client = getClient()
  const { bucket } = getConfig()

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }))
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

export function generateKey(
  familySlug: string,
  personId: string,
  mimeType: string
): string {
  const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'bin'
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(2, 8)
  return `${familySlug}/${personId}/${timestamp}-${random}.${ext}`
}
