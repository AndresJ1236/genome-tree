import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getTimelineEvents } from '@/app/actions/people'

export const metadata = {
  title: 'Línea de tiempo · Genome Tree',
}

const KIND_ICONS: Record<string, string> = {
  BIRTH:      '👶',
  DEATH:      '🕊️',
  MARRIAGE:   '💍',
  SEPARATION: '💔',
}

const KIND_COLORS: Record<string, { bg: string; border: string; fg: string }> = {
  BIRTH:      { bg: '#EAF0ED', border: '#B5C4BC', fg: '#2D4A3E' },
  DEATH:      { bg: '#F0EDE5', border: '#D4C7A8', fg: '#6B5A35' },
  MARRIAGE:   { bg: '#FFF8E6', border: '#E8D68A', fg: '#8B6411' },
  SEPARATION: { bg: '#FAEBEB', border: '#E6C1C1', fg: '#8B4444' },
}

const MONTH_NAMES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

export default async function TimelinePage({
  params,
}: {
  params: Promise<{ familySlug: string }>
}) {
  const { familySlug } = await params
  const session = await getSession()
  if (!session) notFound()

  const family = await prisma.family.findUnique({ where: { slug: familySlug } })
  if (!family || family.id !== session.familyId) notFound()

  const result = await getTimelineEvents()
  if (!result.ok) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#8B4444' }}>
        Error: {result.error}
      </div>
    )
  }
  const events = result.data

  // Agrupar por década → año
  const byDecade = new Map<number, Map<number, typeof events>>()
  for (const ev of events) {
    if (!byDecade.has(ev.decade)) byDecade.set(ev.decade, new Map())
    const yearMap = byDecade.get(ev.decade)!
    if (!yearMap.has(ev.year)) yearMap.set(ev.year, [])
    yearMap.get(ev.year)!.push(ev)
  }
  const decades = [...byDecade.keys()].sort((a, b) => b - a)  // más recientes primero

  return (
    <div style={{ background: '#F5F0E8', minHeight: '100%', overflowY: 'auto' }}>
      <header style={{
        background: '#2D4A3E',
        color: '#fff',
        padding: '20px 24px',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <Link href={`/${familySlug}/tree`} style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, textDecoration: 'none' }}>
          ← Volver al árbol
        </Link>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 600, margin: '8px 0 4px' }}>
          Línea de tiempo familiar
        </h1>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', margin: 0 }}>
          {events.length} eventos · {decades.length > 0 ? `${decades[decades.length - 1]}–${decades[0] + 9}` : 'sin eventos'}
        </p>
      </header>

      {events.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#8B9E94' }}>
          No hay eventos con fecha registrada todavía.
        </div>
      )}

      <div style={{ maxWidth: 760, margin: '24px auto', padding: '0 24px 60px' }}>
        {decades.map(dec => {
          const yearMap = byDecade.get(dec)!
          const years = [...yearMap.keys()].sort((a, b) => b - a)
          return (
            <section key={dec} style={{ marginBottom: 36 }}>
              <h2 style={{
                fontFamily: 'Georgia, serif',
                fontSize: 28,
                color: '#2D4A3E',
                margin: '0 0 14px',
                paddingBottom: 6,
                borderBottom: '2px solid #C8D4CE',
              }}>
                {dec}s
              </h2>
              {years.map(year => {
                const yEvents = yearMap.get(year)!
                return (
                  <div key={year} style={{ marginBottom: 20 }}>
                    <div style={{
                      fontFamily: 'Georgia, serif',
                      fontSize: 18,
                      color: '#5B6E61',
                      fontWeight: 500,
                      marginBottom: 6,
                    }}>
                      {year}
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                      {yEvents.map((ev, i) => {
                        const colors = KIND_COLORS[ev.kind]
                        const dt = new Date(ev.date)
                        const monthDay = `${dt.getDate()} ${MONTH_NAMES[dt.getMonth()]}`
                        const linkPersonId = ev.personIds[0]
                        return (
                          <li key={`${ev.kind}-${ev.date}-${i}`}>
                            <Link
                              href={`/${familySlug}/person/${linkPersonId}`}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: '10px 14px',
                                background: colors.bg,
                                border: `1px solid ${colors.border}`,
                                borderRadius: 3,
                                textDecoration: 'none',
                                color: colors.fg,
                              }}
                            >
                              <span style={{ fontSize: 18, flexShrink: 0 }}>{KIND_ICONS[ev.kind]}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ margin: 0, fontSize: 13, color: '#2C2C2C', lineHeight: 1.4 }}>
                                  {ev.label}
                                </p>
                                <p style={{ margin: '2px 0 0', fontSize: 10, color: colors.fg, letterSpacing: '0.04em' }}>
                                  {monthDay}
                                </p>
                              </div>
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </section>
          )
        })}
      </div>
    </div>
  )
}
