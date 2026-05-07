import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getFamilyActivity } from '@/app/actions/activity'

export const metadata = {
  title: 'Actividad familiar · Genome Tree',
}

const KIND_ICON: Record<string, string> = {
  PERSON_CREATED:  '👤',
  CONTENT_CREATED: '📝',
  MEDIA_UPLOADED:  '📷',
  COMMENT_POSTED:  '💬',
}

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ familySlug: string }>
}) {
  const { familySlug } = await params
  const session = await getSession()
  if (!session) notFound()

  const family = await prisma.family.findUnique({ where: { slug: familySlug } })
  if (!family || family.id !== session.familyId) notFound()

  const result = await getFamilyActivity()
  if (!result.ok) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#8B4444' }}>
        Error: {result.error}
      </div>
    )
  }
  const items = result.data

  return (
    <div style={{
      background: '#F5F0E8',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <header style={{
        background: '#2D4A3E',
        color: '#fff',
        padding: '20px 24px',
        flexShrink: 0,
      }}>
        <Link href={`/${familySlug}/tree`} style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, textDecoration: 'none' }}>
          ← Volver al árbol
        </Link>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 600, margin: '8px 0 4px' }}>
          Actividad familiar
        </h1>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', margin: 0 }}>
          {items.length} eventos recientes — qué ha pasado en el árbol
        </p>
      </header>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {items.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#8B9E94' }}>
            Sin actividad reciente todavía.
          </div>
        )}

        <div style={{ maxWidth: 760, margin: '24px auto', padding: '0 24px 60px' }}>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {items.map(ev => (
              <li key={ev.id}>
                <Link
                  href={ev.href ?? '#'}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: '12px 14px',
                    background: '#FAF7F0',
                    border: '1px solid #E0DAD0',
                    borderRadius: 3,
                    textDecoration: 'none',
                    color: '#2C2C2C',
                  }}
                >
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{KIND_ICON[ev.kind]}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>
                      <strong style={{ color: '#2D4A3E' }}>{ev.actorName}</strong>{' '}
                      <span style={{ color: '#3a3a3a' }}>{ev.message}</span>
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: 10, color: '#8B9E94', letterSpacing: '0.04em' }}>
                      {formatRelative(ev.createdAt)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffSec = Math.floor((now - then) / 1000)
  if (diffSec < 60) return 'ahora mismo'
  if (diffSec < 3600) return `hace ${Math.floor(diffSec / 60)} min`
  if (diffSec < 86400) return `hace ${Math.floor(diffSec / 3600)} h`
  if (diffSec < 86400 * 7) return `hace ${Math.floor(diffSec / 86400)} días`
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })
}
