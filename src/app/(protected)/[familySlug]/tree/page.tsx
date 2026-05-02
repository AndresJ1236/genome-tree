import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { PersonData, RelationshipData } from '@/lib/tree-types'
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

  const [rawPersons, rawRelationships] = await Promise.all([
    prisma.person.findMany({ where: { familyId: family.id } }),
    prisma.relationship.findMany({
      where: { person1: { familyId: family.id } },
      select: { person1Id: true, person2Id: true, type: true, endDate: true },
    }),
  ])

  if (rawPersons.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div style={{ padding: '18px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontFamily: 'Georgia, serif', fontSize: 18, color: '#2D4A3E', margin: 0 }}>
            {family.name}
          </p>
          {session?.role === 'ADMIN' && (
            <Link
              href={`/${familySlug}/person/new`}
              style={{
                textDecoration: 'none',
                border: '1px solid #C8D4CE', color: '#2D4A3E',
                padding: '9px 12px', borderRadius: 2,
                fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase',
                background: '#F8F5EE',
              }}
            >
              + Primera persona
            </Link>
          )}
        </div>
        <div className="flex items-center justify-center h-full">
          <div style={{ textAlign: 'center', maxWidth: 400, padding: '0 24px' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: '#EAF0ED', border: '2px dashed #B5C4BC',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', fontSize: 24, color: '#7aad95',
            }}>
              ○
            </div>
            <p style={{ fontFamily: 'Georgia, serif', fontSize: 18, color: '#2D4A3E', margin: '0 0 8px' }}>
              El árbol está vacío
            </p>
            <p style={{ fontSize: 13, color: '#6B6B6B', margin: '0 0 24px', lineHeight: 1.6 }}>
              {session?.role === 'ADMIN'
                ? 'Agrega la primera persona para comenzar a construir el árbol familiar.'
                : 'El administrador aún no ha agregado personas al árbol.'}
            </p>
            {session?.role === 'ADMIN' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                <Link
                  href={`/${familySlug}/person/new`}
                  style={{
                    textDecoration: 'none',
                    background: '#2D4A3E', color: '#fff',
                    padding: '12px 28px', borderRadius: 2,
                    fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase',
                    fontFamily: 'Georgia, serif',
                  }}
                >
                  Agregar primera persona
                </Link>
                <Link
                  href={`/${familySlug}/admin`}
                  style={{
                    textDecoration: 'none',
                    color: '#6B7B70', fontSize: 12, letterSpacing: '0.06em',
                  }}
                >
                  Ir a administración →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  const relationships: RelationshipData[] = rawRelationships.map(r => ({
    person1Id: r.person1Id,
    person2Id: r.person2Id,
    type: r.type as 'SPOUSE' | 'PARTNER',
    endDate: r.endDate ? r.endDate.toISOString() : null,
  }))

  const persons: PersonData[] = rawPersons.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    middleName: p.middleName,
    lastName: p.lastName,
    birthDate: p.birthDate?.toISOString() ?? null,
    deathDate: p.deathDate?.toISOString() ?? null,
    gender: p.gender,
    nodeKind: p.nodeKind as 'PERSON' | 'PET',
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
            Explora el árbol y agrega nuevas ramas desde aquí.
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
            Nuevo
          </Link>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <FamilyTree
          persons={persons}
          relationships={relationships}
          familySlug={familySlug}
          searchEnabled={modules.moduleSearch}
          focusPersonId={session?.personId ?? undefined}
        />
      </div>
    </div>
  )
}
