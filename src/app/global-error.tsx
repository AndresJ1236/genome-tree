'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

/**
 * Error boundary global — Next.js renderiza esto cuando un componente
 * lanza un error que no fue capturado por error boundaries más cercanos.
 * Reportamos a Sentry y mostramos un mensaje amigable.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="es">
      <body style={{
        background: '#F5F0E8',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: 0,
        fontFamily: 'Georgia, serif',
      }}>
        <div style={{ textAlign: 'center', maxWidth: 420, padding: 32 }}>
          <h1 style={{ fontSize: 22, color: '#2D4A3E', marginBottom: 12 }}>Algo salió mal</h1>
          <p style={{ fontSize: 14, color: '#6B6B6B', lineHeight: 1.5, marginBottom: 24 }}>
            La aplicación encontró un error inesperado. El equipo ya recibió la
            notificación. Por favor recarga la página o intenta de nuevo en un momento.
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: '#2D4A3E', color: '#F5F0E8',
              padding: '10px 24px', border: 'none', borderRadius: 2,
              fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
          {error.digest && (
            <p style={{ fontSize: 11, color: '#9B9B9B', marginTop: 24 }}>
              Código de error: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  )
}
