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

const appHostname = process.env.APP_HOSTNAME ?? ''
const minioEndpoint = process.env.MINIO_ENDPOINT ?? 'localhost'
const minioPort = process.env.MINIO_PORT ?? '9000'

// img-src: self + data URIs + production hostname (for /media/) + dev MinIO
const imgSrc = appHostname
  ? `img-src 'self' data: blob: https://${appHostname};`
  : `img-src 'self' data: blob: http://${minioEndpoint}:${minioPort};`

// CSP is set per-request in proxy.ts (with per-request nonces).
// These static headers cover everything else.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig: NextConfig = {
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
  allowedDevOrigins: ['127.0.0.1'],
  images: { remotePatterns },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
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
