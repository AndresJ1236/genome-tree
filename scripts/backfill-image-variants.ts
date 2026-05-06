/**
 * Backfill de variantes WebP para fotos subidas antes de la implementación
 * de thumbnails.
 *
 * Recorre todas las filas de Media donde thumbUrl IS NULL, descarga el
 * original desde MinIO, ejecuta processImage, sube las 3 variantes y
 * actualiza la fila con los URLs nuevos.
 *
 * ⚠️  CRÍTICO: cuando corras esto desde un contenedor temporal, asegúrate
 *    de pasar TODAS las variables MinIO incluyendo MINIO_PUBLIC_URL. Sin
 *    esa última, las URLs guardadas en DB serán las internas de Docker
 *    (http://minio:9000/...), inalcanzables desde el navegador.
 *
 * Uso recomendado (extrae las env vars del .env.production):
 *
 *   set -a && . NAS_DEPLOY_PATH/.env.production && set +a
 *   docker run --rm --network genome_genome_net \
 *     -v NAS_DEPLOY_PATH:/app -w /app \
 *     -e DATABASE_URL="$DATABASE_URL" \
 *     -e MINIO_ENDPOINT=minio -e MINIO_PORT=9000 \
 *     -e MINIO_ROOT_USER="$MINIO_ROOT_USER" \
 *     -e MINIO_ROOT_PASSWORD="$MINIO_ROOT_PASSWORD" \
 *     -e MINIO_BUCKET=genome-tree \
 *     -e MINIO_PUBLIC_URL="$MINIO_PUBLIC_URL"  \  # ← NO OLVIDAR
 *     node:20-alpine sh -c \
 *       'npm install --no-save sharp @aws-sdk/client-s3 \
 *          @prisma/client@7.8 @prisma/adapter-pg@7.8 prisma@7.8 pg tsx && \
 *        npx prisma generate --schema /app/prisma/schema.prisma && \
 *        npx tsx scripts/backfill-image-variants.ts'
 *
 * Si olvidas MINIO_PUBLIC_URL y termina con URLs http://minio:9000/...,
 * arregla con SQL:
 *
 *   UPDATE "Media" SET
 *     "url"       = REPLACE("url",       'http://minio:9000/genome-tree/', 'https://<HOSTNAME>/media/'),
 *     "thumbUrl"  = REPLACE("thumbUrl",  'http://minio:9000/genome-tree/', 'https://<HOSTNAME>/media/'),
 *     "mediumUrl" = REPLACE("mediumUrl", 'http://minio:9000/genome-tree/', 'https://<HOSTNAME>/media/'),
 *     "largeUrl"  = REPLACE("largeUrl",  'http://minio:9000/genome-tree/', 'https://<HOSTNAME>/media/');
 *
 * Idempotente: solo procesa filas con thumbUrl null. Si falla a mitad, se
 * puede re-correr sin duplicar trabajo.
 */

import 'server-only'
import { prisma } from '../src/lib/prisma'
import {
  processImage,
  uploadProcessedImage,
} from '../src/lib/storage'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

function getMinioClient(): S3Client {
  return new S3Client({
    endpoint:        `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT ?? '9000'}`,
    region:          'us-east-1',
    credentials: {
      accessKeyId:     process.env.MINIO_ROOT_USER ?? '',
      secretAccessKey: process.env.MINIO_ROOT_PASSWORD ?? '',
    },
    forcePathStyle:  true,
  })
}

async function downloadObject(bucket: string, key: string): Promise<Buffer> {
  const client = getMinioClient()
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  if (!res.Body) throw new Error(`Body vacío para ${key}`)

  // Convert stream to buffer (Node 18+)
  const chunks: Buffer[] = []
  for await (const chunk of res.Body as AsyncIterable<Buffer>) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function main() {
  const bucket = process.env.MINIO_BUCKET ?? 'genome-tree'

  console.log('🔍 Buscando filas Media sin variantes...')
  const pending = await prisma.media.findMany({
    where:  { thumbUrl: null },
    select: { id: true, key: true, mimeType: true, url: true },
  })

  if (pending.length === 0) {
    console.log('✅ No hay nada que migrar — todas las filas ya tienen variantes.')
    return
  }

  console.log(`📦 ${pending.length} filas pendientes. Procesando...`)

  let ok = 0
  let failed = 0
  for (const m of pending) {
    try {
      console.log(`  → ${m.key}`)
      const buffer = await downloadObject(bucket, m.key)
      const processed = await processImage(buffer, m.mimeType)
      const uploaded  = await uploadProcessedImage(m.key, processed)

      await prisma.media.update({
        where: { id: m.id },
        data:  {
          thumbUrl:  uploaded.thumbUrl,
          mediumUrl: uploaded.mediumUrl,
          largeUrl:  uploaded.largeUrl,
          width:     uploaded.width,
          height:    uploaded.height,
          // Si processImage capeó el original, también actualizamos url/mimeType
          url:       uploaded.url,
          mimeType:  uploaded.mimeType,
        },
      })

      ok++
      console.log(`    ✓ ${(buffer.length / 1024 / 1024).toFixed(2)} MB → 3 variantes generadas`)
    } catch (e) {
      failed++
      console.error(`    ✗ Error con ${m.key}:`, (e as Error).message)
    }
  }

  console.log()
  console.log(`✅ Completado: ${ok} ok, ${failed} fallidos`)

  await prisma.$disconnect()
}

main().catch(e => {
  console.error('💥 Error fatal:', e)
  process.exit(1)
})
