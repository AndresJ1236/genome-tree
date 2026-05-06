import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { getBirthPlaceClusters } from '@/app/actions/people'
import { OriginMap } from '@/components/ui/OriginMap'

export const metadata = {
  title: 'Mapa de orígenes · Genome Tree',
}

export default async function MapPage({
  params,
}: {
  params: Promise<{ familySlug: string }>
}) {
  const { familySlug } = await params
  const session = await getSession()
  if (!session) notFound()

  const family = await prisma.family.findUnique({ where: { slug: familySlug } })
  if (!family || family.id !== session.familyId) notFound()

  const result = await getBirthPlaceClusters()
  if (!result.ok) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#8B4444' }}>
        Error: {result.error}
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        background: '#2D4A3E',
        color: '#fff',
        padding: '14px 24px',
        flexShrink: 0,
      }}>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 18, fontWeight: 600, margin: 0 }}>
          Orígenes de la familia
        </h1>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: '2px 0 0' }}>
          {result.data.length} lugares · {result.data.reduce((s, c) => s + c.count, 0)} personas
        </p>
      </header>

      <div style={{ flex: 1, minHeight: 0 }}>
        <OriginMap clusters={result.data} familySlug={familySlug} />
      </div>
    </div>
  )
}
