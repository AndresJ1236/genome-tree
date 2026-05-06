import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { buildWeeklyDigest, renderDigestHtml } from '@/lib/digest'

export const metadata = { title: 'Resumen semanal · Genome Tree' }

/**
 * Vista on-demand del resumen semanal. Muestra el mismo HTML que se
 * enviaría por email, encerrado en un iframe para verlo tal como llegará
 * a los miembros cuando el sistema de email esté activo.
 *
 * Mientras tanto, el admin puede:
 *   - Visitar esta página para ver qué pasó esta semana
 *   - Compartir el link de esta página por WhatsApp (lo más rápido para
 *     una familia ya conectada)
 *   - Botón "Copiar HTML" para pegarlo en cualquier cliente de email manualmente
 */
export default async function DigestPage({
  params,
}: {
  params: Promise<{ familySlug: string }>
}) {
  const { familySlug } = await params
  const session = await getSession()
  if (!session) notFound()

  const family = await prisma.family.findUnique({ where: { slug: familySlug } })
  if (!family || family.id !== session.familyId) notFound()

  const digest = await buildWeeklyDigest(family.id, 7)
  if (!digest) notFound()

  // Construir baseUrl absoluta para los links del email (usa APP_HOSTNAME en producción)
  const host = process.env.APP_HOSTNAME ?? 'localhost:3000'
  const protocol = host.includes('localhost') ? 'http' : 'https'
  const baseUrl = `${protocol}://${host}`
  const html = renderDigestHtml(digest, baseUrl)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#F5F0E8' }}>
      <header style={{
        background: '#2D4A3E',
        color: '#fff',
        padding: '14px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
        flexShrink: 0,
      }}>
        <div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 18, fontWeight: 600, margin: 0 }}>
            Resumen semanal
          </h1>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: '2px 0 0' }}>
            {digest.totalEvents} eventos en los últimos 7 días
          </p>
        </div>
        <a
          href={`/${familySlug}/tree`}
          style={{
            color: 'rgba(255,255,255,0.85)',
            fontSize: 12,
            textDecoration: 'none',
            border: '1px solid rgba(255,255,255,0.3)',
            padding: '6px 12px',
            borderRadius: 2,
          }}
        >
          ← Volver al árbol
        </a>
      </header>

      <div style={{
        padding: '12px 24px',
        background: '#FFF8E6',
        borderBottom: '1px solid #E8D68A',
        fontSize: 12,
        color: '#8B6411',
        textAlign: 'center',
      }}>
        Esta es la vista previa de cómo se vería el resumen semanal por email.
        El envío automático se activa cuando configures <code>RESEND_API_KEY</code>.
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 24, display: 'flex', justifyContent: 'center' }}>
        <iframe
          srcDoc={html}
          style={{
            width: '100%',
            maxWidth: 640,
            minHeight: 600,
            border: '1px solid #E0DAD0',
            background: '#FFFDF9',
            borderRadius: 4,
          }}
          title="Vista previa del resumen semanal"
        />
      </div>
    </div>
  )
}
