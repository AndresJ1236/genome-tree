import type { NextConfig } from 'next'

const remotePatterns: NonNullable<NextConfig['images']>['remotePatterns'] = [
  // Desarrollo: MinIO local
  {
    protocol: 'http',
    hostname: process.env.MINIO_ENDPOINT ?? 'localhost',
    port:     process.env.MINIO_PORT ?? '9000',
  },
]

// Producción: imágenes servidas a través de nginx en /media/
if (process.env.APP_HOSTNAME) {
  remotePatterns.push({
    protocol: 'https',
    hostname: process.env.APP_HOSTNAME,
    pathname: '/media/**',
  })
}

const nextConfig: NextConfig = {
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
  allowedDevOrigins: ['127.0.0.1'],
  images: { remotePatterns },
  experimental: {
    serverActions: {
      bodySizeLimit: '15mb',
    },
  },
  // Force-include pg driver adapter deps that standalone tracing misses
  outputFileTracingIncludes: {
    '/**': [
      './node_modules/postgres-array/**',
      './node_modules/pgpass/**',
      './node_modules/pg-cloudflare/**',
    ],
  },
}

export default nextConfig
