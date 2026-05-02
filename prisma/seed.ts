import { config } from 'dotenv'
config({ path: '.env' })
config({ path: '.env.local', override: false })

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

async function main() {
  // ── Familia ────────────────────────────────────────────────────────────────
  const family = await prisma.family.upsert({
    where:  { slug: 'familia-demo' },
    update: { name: 'Familia Martínez-Santos' },
    create: { name: 'Familia Martínez-Santos', slug: 'familia-demo' },
  })
  const fid = family.id

  // ── FamilyConfig (límites y módulos por defecto) ───────────────────────────
  await prisma.familyConfig.upsert({
    where:  { familyId: fid },
    update: { moduleSearch: true },
    create: { familyId: fid, moduleSearch: true },
  })

  // ── Generación 0 ──────────────────────────────────────────────────────────
  // fatherId/motherId se setean al crear los hijos, no los padres
  const carlos = await upsertPerson(fid, 'seed-carlos', 'Carlos', 'Martínez Rojas',  'MALE',   1935, 2010)
  const ana    = await upsertPerson(fid, 'seed-ana',    'Ana',    'López Vega',       'FEMALE', 1938, 2015)
  const jorge  = await upsertPerson(fid, 'seed-jorge',  'Jorge',  'Santos Medina',    'MALE',   1932, 2005)
  const carmen = await upsertPerson(fid, 'seed-carmen', 'Carmen', 'Herrera Díaz',     'FEMALE', 1936)

  // ── Generación 1 ──────────────────────────────────────────────────────────
  // Luis y María son hijos de Carlos + Ana
  const luis  = await upsertPerson(fid, 'seed-luis',  'Luis',  'Martínez López', 'MALE',   1962, undefined, carlos.id, ana.id)
  const maria = await upsertPerson(fid, 'seed-maria', 'María', 'Martínez López', 'FEMALE', 1965, undefined, carlos.id, ana.id)

  // Pedro y Sofía son hijos de Jorge + Carmen
  const pedro = await upsertPerson(fid, 'seed-pedro', 'Pedro', 'Santos Herrera', 'MALE',   1963, undefined, jorge.id, carmen.id)
  const sofia = await upsertPerson(fid, 'seed-sofia', 'Sofía', 'Santos Herrera', 'FEMALE', 1968, undefined, jorge.id, carmen.id)

  // Elena se incorpora sin padres conocidos en el árbol
  const elena = await upsertPerson(fid, 'seed-elena', 'Elena', 'Vásquez Ruiz',   'FEMALE', 1965)

  // ── Generación 2 ──────────────────────────────────────────────────────────
  // Diego y Valentina son hijos de Luis + Sofía (matrimonio inter-familiar)
  const diego     = await upsertPerson(fid, 'seed-diego',     'Diego',     'Martínez Santos', 'MALE',   1990, undefined, luis.id, sofia.id)
  const valentina = await upsertPerson(fid, 'seed-valentina', 'Valentina', 'Martínez Santos', 'FEMALE', 1993, undefined, luis.id, sofia.id)

  // Andrés e Isabella son hijos de Pedro + Elena
  const andres   = await upsertPerson(fid, 'seed-andres',   'Andrés',   'Santos Vásquez', 'MALE',   1991, undefined, pedro.id, elena.id)
  const isabella = await upsertPerson(fid, 'seed-isabella', 'Isabella', 'Santos Vásquez', 'FEMALE', 1994, undefined, pedro.id, elena.id)

  // ── Usuario admin ──────────────────────────────────────────────────────────
  const hash      = await bcrypt.hash('admin123', 12)
  const adminUser = await prisma.user.upsert({
    where:  { username: 'admin@demo.com' },
    update: {},
    create: {
      username:     'admin@demo.com',
      passwordHash: hash,
      name:         'Administrador',
      familyId:     fid,
      personId:     carlos.id,
      role:         'ADMIN',
      scope:        'ADMIN',
    },
  })
  const luisHash = await bcrypt.hash('luis123', 12)
  const luisUser = await prisma.user.upsert({
    where: { username: 'luis@demo.com' },
    update: {
      name: 'Luis Martinez',
      familyId: fid,
      personId: luis.id,
      role: 'MEMBER',
      scope: 'FAMILY',
    },
    create: {
      username: 'luis@demo.com',
      passwordHash: luisHash,
      name: 'Luis Martinez',
      familyId: fid,
      personId: luis.id,
      role: 'MEMBER',
      scope: 'FAMILY',
    },
  })
  const uid    = adminUser.id
  const locked = lockDate()

  const managedUnit = await prisma.managedFamilyUnit.findFirst({
    where: {
      familyId: fid,
      label: 'Familia Martinez Santos',
    },
    select: { id: true },
  })

  if (managedUnit) {
    await prisma.managedFamilyUnit.update({
      where: { id: managedUnit.id },
      data: {
        parentAId: luis.id,
        parentBId: sofia.id,
        primarySurname: 'Martinez',
        secondarySurname: 'Santos',
        representativeUserId: luisUser.id,
        canInviteUsers: true,
        canEditPeople: true,
        canManageContent: true,
        canViewAudit: true,
      },
    })
  } else {
    await prisma.managedFamilyUnit.create({
      data: {
        familyId: fid,
        label: 'Familia Martinez Santos',
        parentAId: luis.id,
        parentBId: sofia.id,
        primarySurname: 'Martinez',
        secondarySurname: 'Santos',
        representativeUserId: luisUser.id,
        canInviteUsers: true,
        canEditPeople: true,
        canManageContent: true,
        canViewAudit: true,
        createdById: adminUser.id,
      },
    })
  }

  // ── Contenido de prueba ────────────────────────────────────────────────────

  await upsertContent('seed-story-carlos-1', {
    personId: carlos.id, familyId: fid, type: 'STORY',
    title: 'El taller de carpintería',
    body:  'Carlos aprendió carpintería a los doce años junto a su padre en un pequeño taller en Guadalajara. Construyó la mesa del comedor familiar con sus propias manos el año que se casó con Ana. Esa mesa sigue en pie.',
    source: 'Entrevista con Luis Martínez, mayo 2024', confidence: 'MEDIUM',
    approximateDate: 'Alrededor de 1947', authorName: 'Luis Martínez',
    visibility: 'FAMILY', createdById: uid, lockedAt: locked,
  })

  await upsertContent('seed-story-carlos-2', {
    personId: carlos.id, familyId: fid, type: 'STORY',
    title: 'La travesía de 1960',
    body:  'En 1960 Carlos viajó solo desde Guadalajara a la Ciudad de México buscando trabajo. Tardó tres días en tren. Decía que en ese viaje aprendió que el miedo y la valentía son lo mismo visto desde lados distintos.',
    source: 'Diario personal de Carlos Martínez', confidence: 'HIGH',
    approximateDate: '1960', authorName: 'Carlos Martínez',
    visibility: 'FAMILY', createdById: uid, lockedAt: locked,
  })

  await upsertContent('seed-recipe-ana-1', {
    personId: ana.id, familyId: fid, type: 'RECIPE',
    title: 'Tamales de rajas de Ana',
    body:  'Esta receta viene de la abuela Consuelo. Ana la adaptó usando chiles poblanos en lugar de serranos porque Carlos no toleraba el picante fuerte.',
    source: 'Cuaderno de recetas de Ana López, circa 1970', confidence: 'HIGH',
    ingredients: JSON.stringify(['1 kg de masa para tamales','500 g de rajas de chile poblano','300 g de queso Oaxaca','200 g de manteca de cerdo','1 cucharadita de sal','Hojas de maíz remojadas']),
    steps:       JSON.stringify(['Remojar las hojas de maíz en agua caliente por 30 minutos.','Batir la manteca hasta que esté esponjosa. Incorporar la masa y la sal.','Extender una capa delgada de masa sobre cada hoja.','Colocar rajas y queso en el centro.','Doblar y cocer en vaporera por 1 hora y 15 minutos.']),
    notes: 'Si la masa está lista, al poner un trozo en agua fría debe flotar.',
    visibility: 'FAMILY', createdById: uid, lockedAt: locked,
  })

  await upsertContent('seed-diary-carmen-1', {
    personId: carmen.id, familyId: fid, type: 'DIARY',
    title: 'El día que llegaron a la ciudad',
    body:  'Hoy llegamos a Monterrey. Jorge dice que aquí habrá trabajo para los dos. Los niños no entienden bien por qué dejamos Saltillo. Yo tampoco lo entiendo del todo, pero confío en él.',
    entryDate: new Date(1968, 2, 15),
    visibility: 'FAMILY', createdById: uid, lockedAt: locked,
  })

  await upsertContent('seed-interview-jorge-1', {
    personId: jorge.id, familyId: fid, type: 'INTERVIEW',
    title:    'Sobre el trabajo en la fábrica',
    question: '¿Cómo fue llegar a trabajar a la fábrica de acero siendo tan joven?',
    body:     'Tenía dieciséis años. El primer día no podía ni cargar los sacos, pero no dije nada para que no me mandaran de vuelta. Al tercer mes ya era de los más rápidos del turno de la mañana.',
    source: 'Entrevista grabada por Pedro Santos, 1998', confidence: 'HIGH',
    approximateDate: '1998, relatando eventos de circa 1948', authorName: 'Pedro Santos',
    visibility: 'FAMILY', createdById: uid, lockedAt: locked,
  })

  await upsertContent('seed-object-carlos-1', {
    personId: carlos.id, familyId: fid, type: 'OBJECT',
    title: 'El reloj de bolsillo',
    body:  'Reloj Longines de plata, modelo 1920. Carlos lo recibió de su padre el día que cumplió 18 años. Lo usó todos los días hasta su muerte. Hoy está en manos de Luis.',
    notes: 'Estado: funciona, cristal levemente rayado. Grabado en la tapa: "CMR 1953".',
    source: 'Confirmado por Luis Martínez', confidence: 'HIGH',
    visibility: 'FAMILY', createdById: uid, lockedAt: locked,
  })

  await upsertContent('seed-source-jorge-1', {
    personId: jorge.id, familyId: fid, type: 'SOURCE',
    title: 'Acta de nacimiento — Jorge Santos Medina',
    body:  'Registro Civil de Saltillo, Coahuila. Tomo 12, folio 347. Fecha de emisión: 3 de enero de 1933.',
    source: 'Registro Civil de Saltillo', confidence: 'HIGH',
    visibility: 'FAMILY', createdById: uid, lockedAt: locked,
  })

  await upsertImportantLink('seed-link-carlos-1', {
    personId: carlos.id, familyId: fid,
    externalName: 'Don Aurelio Fuentes', label: 'Mentor',
    notes: 'Maestro carpintero que le enseñó el oficio a Carlos entre 1947 y 1952. Sin él, Carlos nunca habría podido abrir su propio taller.',
    source: 'Historia relatada por Carlos al final de su vida', confidence: 'MEDIUM',
    visibility: 'FAMILY', createdById: uid, lockedAt: locked,
  })

  await upsertImportantLink('seed-link-luis-1', {
    personId: luis.id, familyId: fid,
    relatedPersonId: maria.id, label: 'Mejor amiga de infancia',
    notes: 'Más allá de ser hermanos, Luis y María fueron inseparables hasta la adolescencia. Compartían todo.',
    confidence: 'MEDIUM', visibility: 'FAMILY', createdById: uid, lockedAt: locked,
  })

  console.log('Seed completado:')
  console.log('  13 personas, 3 generaciones (parentesco via fatherId/motherId)')
  console.log('  2 historias (Carlos), 1 receta (Ana)')
  console.log('  1 diario (Carmen), 1 entrevista (Jorge)')
  console.log('  1 objeto (Carlos), 1 fuente (Jorge)')
  console.log('  2 relaciones importantes (Carlos, Luis)')
  console.log('  1 FamilyConfig con defaults')
  console.log('  Usuario: admin@demo.com / admin123')
  console.log('  Usuario representante demo: luis@demo.com / luis123')

  // Suppress unused variable warnings
  void [sofia, elena, diego, valentina, andres, isabella, pedro, maria]
}

// ── Helpers ────────────────────────────────────────────────────────────────

function lockDate(): Date {
  const d = new Date()
  d.setDate(d.getDate() + 10)
  return d
}

async function upsertPerson(
  familyId: string, id: string,
  firstName: string, lastName: string,
  gender: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN',
  birthYear?: number, deathYear?: number,
  fatherId?: string, motherId?: string,
) {
  const surnameTokens = lastName.split(/\s+/).filter(Boolean)
  return prisma.person.upsert({
    where:  { id },
    update: {
      fatherId: fatherId ?? null,
      motherId: motherId ?? null,
      birthSurname1: surnameTokens[0] ?? null,
      birthSurname2: surnameTokens[1] ?? null,
    },
    create: {
      id, familyId, firstName, lastName, gender,
      birthSurname1: surnameTokens[0] ?? null,
      birthSurname2: surnameTokens[1] ?? null,
      birthDate: birthYear ? new Date(birthYear, 0, 1) : null,
      deathDate: deathYear ? new Date(deathYear, 0, 1) : null,
      fatherId:  fatherId ?? null,
      motherId:  motherId ?? null,
    },
  })
}

type ContentInput = {
  personId: string; familyId: string
  type: 'STORY' | 'RECIPE' | 'OBJECT' | 'DIARY' | 'INTERVIEW' | 'SOURCE'
  title: string; body?: string
  visibility: 'BRANCH' | 'FAMILY' | 'ADMIN'
  createdById: string; lockedAt: Date
  source?: string; confidence?: 'HIGH' | 'MEDIUM' | 'LOW'
  approximateDate?: string; authorName?: string
  ingredients?: string; steps?: string; notes?: string
  entryDate?: Date; question?: string
}

async function upsertContent(id: string, data: ContentInput) {
  return prisma.content.upsert({
    where:  { id },
    update: {},
    create: { id, ...data },
  })
}

type ImportantLinkInput = {
  personId: string; familyId: string
  relatedPersonId?: string; externalName?: string
  label: string; notes?: string; source?: string
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW'
  visibility: 'BRANCH' | 'FAMILY' | 'ADMIN'
  createdById: string; lockedAt: Date
}

async function upsertImportantLink(id: string, data: ImportantLinkInput) {
  return prisma.importantLink.upsert({
    where:  { id },
    update: {},
    create: { id, ...data },
  })
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
