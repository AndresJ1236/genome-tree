import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { computeTreeLayout } from '../src/lib/tree-layout'

async function main() {
  console.log('debug: start')

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: 'postgresql://genome_tree:devpassword@localhost:5432/genome_tree',
    }),
  })

  const family = await prisma.family.findUnique({ where: { slug: 'familia-demo' } })
  console.log('debug: family', !!family)
  if (!family) throw new Error('family not found')

  const rawPersons = await prisma.person.findMany({ where: { familyId: family.id } })
  console.log('debug: rawPersons', rawPersons.length)

  const persons = rawPersons.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    middleName: p.middleName,
    lastName: p.lastName,
    birthDate: p.birthDate?.toISOString() ?? null,
    deathDate: p.deathDate?.toISOString() ?? null,
    gender: p.gender,
    nodeKind: (p.nodeKind ?? 'PERSON') as 'PERSON' | 'PET',
    coverPhoto: p.coverPhoto,
    fatherId: p.fatherId,
    motherId: p.motherId,
  }))

  console.log('debug: before layout')
  const result = computeTreeLayout(persons)
  console.log('debug: after layout', result.nodes.length, result.familyUnits.length)

  await prisma.$disconnect()
  console.log('debug: done')
}

main().catch((error) => {
  console.error('debug: error', error)
  process.exit(1)
})
