/**
 * Sentry browser-side config (cliente React).
 * Mismo DSN que el server, pero scope diferente. Habilita session replay
 * solo cuando el usuario reporta un error.
 */
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,   // 100% de los errores graban session replay
    replaysSessionSampleRate: 0,     // 0% de sesiones normales (ahorra cuota)
    integrations: [
      Sentry.replayIntegration({
        // Mascarar contenido sensible automáticamente
        maskAllText: false,    // Permitir texto visible (no es una app financiera)
        blockAllMedia: false,  // Permitir fotos en replay (privadas detrás de auth)
      }),
    ],
    environment: process.env.NODE_ENV ?? 'development',
    enabled: process.env.NODE_ENV === 'production',
    ignoreErrors: [
      'NEXT_REDIRECT',
      'NEXT_NOT_FOUND',
      /Failed to find Server Action/,
      // Errores de Cloudflare Tunnel mientras el cliente está cargando bundle nuevo
      /Loading chunk \d+ failed/,
    ],
  })
}
