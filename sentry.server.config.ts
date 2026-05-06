/**
 * Sentry server-side config (Node runtime, server actions, API routes).
 *
 * Activación: define SENTRY_DSN en producción. Si la var está vacía, Sentry
 * queda desactivado y no hay overhead — perfecto para desarrollo local.
 *
 * El DSN es público por diseño (no es una API key); solo identifica el
 * proyecto destino. Los datos se envían cifrados a sentry.io vía HTTPS.
 */
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    // 10% de samples a producción es suficiente para detectar tendencias sin
    // saturar la cuota gratuita (5K events/mes en plan dev de Sentry)
    tracesSampleRate: 0.1,
    // Captura console.error/warn además de excepciones
    integrations: [
      Sentry.consoleIntegration({ levels: ['error'] }),
    ],
    environment: process.env.NODE_ENV ?? 'development',
    // No reportes desde dev local
    enabled: process.env.NODE_ENV === 'production',
    // Ignorar errores comunes de Next.js que no son bugs reales
    ignoreErrors: [
      // Hot reload artifact
      'NEXT_REDIRECT',
      'NEXT_NOT_FOUND',
      // Server Actions stale (browser cache vieja, no es bug del servidor)
      /Failed to find Server Action/,
    ],
  })
}
