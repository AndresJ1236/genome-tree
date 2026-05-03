/**
 * Agrega la rama paterna Jácome-Sandoval al árbol.
 * Ejecutar con: npx tsx scripts/add-jacome-family.ts
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  const family = await prisma.family.findFirst()
  if (!family) throw new Error('No se encontró ninguna familia en la base de datos.')
  const fid = family.id
  console.log(`Familia: ${family.name} (${family.slug})`)

  // ── Abuelos paternos ─────────────────────────────────────────────────
  const abuelo = await prisma.person.create({
    data: {
      familyId: fid,
      firstName:    'Luis',
      middleName:   'Eduardo',
      lastName:     'Jácome',
      gender:       'MALE',
    },
  })
  console.log('✓ Luis Eduardo Jácome')

  const abuela = await prisma.person.create({
    data: {
      familyId: fid,
      firstName:  'Ana',
      middleName: 'Lourdes',
      lastName:   'Sandoval',
      gender:     'FEMALE',
    },
  })
  console.log('✓ Ana Lourdes Sandoval')

  // ── Hijos de Luis Eduardo + Ana Lourdes ──────────────────────────────
  const wilson = await prisma.person.create({
    data: {
      familyId:     fid,
      firstName:    'Wilson',
      middleName:   'Eduardo',
      lastName:     'Jácome',
      birthSurname1: 'Jácome',
      birthSurname2: 'Sandoval',
      birthDate:    new Date('1960-01-01'),
      birthPlace:   'Quito',
      gender:       'MALE',
      fatherId:     abuelo.id,
      motherId:     abuela.id,
    },
  })
  console.log('✓ Wilson Eduardo Jácome Sandoval')

  const yolanda = await prisma.person.create({
    data: {
      familyId:      fid,
      firstName:     'Yolanda',
      lastName:      'Jácome',
      birthSurname1: 'Jácome',
      birthSurname2: 'Sandoval',
      gender:        'FEMALE',
      fatherId:      abuelo.id,
      motherId:      abuela.id,
    },
  })
  console.log('✓ Yolanda Jácome Sandoval')

  await prisma.person.create({
    data: {
      familyId:      fid,
      firstName:     'Betzabé',
      lastName:      'Jácome',
      birthSurname1: 'Jácome',
      birthSurname2: 'Sandoval',
      gender:        'FEMALE',
      fatherId:      abuelo.id,
      motherId:      abuela.id,
    },
  })
  console.log('✓ Betzabé Jácome Sandoval')

  const carlos = await prisma.person.create({
    data: {
      familyId:      fid,
      firstName:     'Carlos',
      lastName:      'Jácome',
      birthSurname1: 'Jácome',
      birthSurname2: 'Sandoval',
      gender:        'MALE',
      fatherId:      abuelo.id,
      motherId:      abuela.id,
    },
  })
  console.log('✓ Carlos Jácome Sandoval')

  // ── Cónyuges ─────────────────────────────────────────────────────────
  const ivan = await prisma.person.create({
    data: {
      familyId:  fid,
      firstName: 'Iván',
      lastName:  '',       // apellido desconocido — actualizar en la app
      gender:    'MALE',
    },
  })
  console.log('✓ Iván (esposo de Yolanda)')

  const narcisa = await prisma.person.create({
    data: {
      familyId:  fid,
      firstName: 'Narcisa',
      lastName:  '',       // apellido desconocido — actualizar en la app
      gender:    'FEMALE',
    },
  })
  console.log('✓ Narcisa (esposa de Carlos)')

  // Relaciones de pareja explícitas
  await prisma.relationship.create({
    data: { familyId: fid, person1Id: yolanda.id, person2Id: ivan.id,   type: 'SPOUSE' },
  })
  await prisma.relationship.create({
    data: { familyId: fid, person1Id: carlos.id,  person2Id: narcisa.id, type: 'SPOUSE' },
  })
  console.log('✓ Relaciones de pareja registradas')

  // ── Hijos de Carlos + Narcisa ────────────────────────────────────────
  await prisma.person.create({
    data: {
      familyId:  fid,
      firstName: 'Dani',
      lastName:  'Jácome',   // segundo apellido (de Narcisa) desconocido
      gender:    'FEMALE',
      fatherId:  carlos.id,
      motherId:  narcisa.id,
    },
  })
  console.log('✓ Dani Jácome')

  await prisma.person.create({
    data: {
      familyId:  fid,
      firstName: 'Joy',
      lastName:  'Jácome',
      gender:    'FEMALE',
      fatherId:  carlos.id,
      motherId:  narcisa.id,
    },
  })
  console.log('✓ Joy Jácome')

  // ── Hermanos de Ana Lourdes (Sandoval) ───────────────────────────────
  // Sin padres conocidos → aparecen como nodos independientes en el árbol.
  // Para conectarlos como hermanos de Ana Lourdes hay que agregar
  // los padres de ella cuando se conozcan.
  await prisma.person.create({
    data: { familyId: fid, firstName: 'Fabiola',  lastName: 'Sandoval', gender: 'FEMALE' },
  })
  await prisma.person.create({
    data: { familyId: fid, firstName: 'Santiago', lastName: 'Sandoval', gender: 'MALE'   },
  })
  await prisma.person.create({
    data: { familyId: fid, firstName: 'Lupe',     lastName: 'Sandoval', gender: 'FEMALE' },
  })
  console.log('✓ Fabiola, Santiago y Lupe Sandoval')

  // ── Conectar Wilson como padre del usuario (Andrés Jácome) ───────────
  const andres = await prisma.person.findFirst({
    where: { familyId: fid, firstName: 'Andrés', lastName: 'Jácome' },
  })
  if (andres) {
    await prisma.person.update({
      where: { id: andres.id },
      data:  { fatherId: wilson.id },
    })
    console.log('✓ Wilson asignado como padre de Andrés Jácome')
  } else {
    console.log('⚠ No se encontró a Andrés Jácome — asigna a Wilson como padre manualmente en la app.')
  }

  console.log('\n✅ Familia Jácome-Sandoval agregada correctamente.')
  console.log('   Recuerda completar los apellidos de Iván y Narcisa en la app.')
}

main()
  .catch(err => { console.error('Error:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
