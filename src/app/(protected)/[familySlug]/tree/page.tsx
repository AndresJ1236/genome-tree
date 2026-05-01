import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { PersonData } from '@/lib/tree-types'
import { FamilyTree } from '@/components/tree/FamilyTree'
import { getFamilyModules } from '@/lib/family-config'

export default async function TreePage({
  params,
}: {
  params: Promise<{ familySlug: string }>
}) {
  const { familySlug } = await params
  const session = await getSession()

  const family = await prisma.family.findUnique({ where: { slug: familySlug } })
  if (!family || family.id !== session?.familyId) notFound()
  const modules = await getFamilyModules(session.familyId)

  const rawPersons = await prisma.person.findMany({ where: { familyId: family.id } })

  if (rawPersons.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div style={{ padding: '18px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontFamily: 'Georgia, serif', fontSize: 18, color: '#2D4A3E', margin: 0 }}>
              {family.name}
            </p>
          </div>
          <Link
            href={`/${familySlug}/person/new`}
            style={{
              textDecoration: 'none',
              border: '1px solid #C8D4CE',
              color: '#2D4A3E',
              padding: '9px 12px',
              borderRadius: 2,
              fontSize: 12,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              background: '#F8F5EE',
            }}
          >
            Nueva persona
          </Link>
        </div>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <p style={{ fontSize: 14, color: '#6B6B6B' }}>Aun no hay personas registradas.</p>
          </div>
        </div>
      </div>
    )
  }

  const persons: PersonData[] = rawPersons.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    middleName: p.middleName,
    lastName: p.lastName,
    birthDate: p.birthDate?.toISOString() ?? null,
    deathDate: p.deathDate?.toISOString() ?? null,
    gender: p.gender,
    coverPhoto: p.coverPhoto,
    fatherId: p.fatherId,
    motherId: p.motherId,
  }))

  return (
    <div className="h-full flex flex-col">
        <div
          style={{
            padding: '18px 24px 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#F5F0E8',
          }}
        >
        <div>
          <p
            style={{
              margin: 0,
              fontFamily: 'Georgia, serif',
              fontSize: 18,
              color: '#2D4A3E',
            }}
          >
            {family.name}
          </p>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 12,
              color: '#8B9E94',
            }}
          >
            Explora el arbol y agrega nuevas ramas desde aqui.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <a
            href="/api/relations/export"
            style={{
              textDecoration: 'none',
              border: '1px solid #C8D4CE',
              color: '#2D4A3E',
              padding: '9px 12px',
              borderRadius: 2,
              fontSize: 12,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              background: '#FFFDF9',
            }}
          >
            Exportar relaciones JSON
          </a>
          <Link
            href={`/${familySlug}/person/new`}
            style={{
              textDecoration: 'none',
              border: '1px solid #C8D4CE',
              color: '#2D4A3E',
              padding: '9px 12px',
              borderRadius: 2,
              fontSize: 12,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              background: '#F8F5EE',
            }}
          >
            Nueva persona
          </Link>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <FamilyTree persons={persons} familySlug={familySlug} searchEnabled={modules.moduleSearch} />
      </div>
    </div>
  )
}
