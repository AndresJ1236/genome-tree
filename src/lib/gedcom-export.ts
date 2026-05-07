import 'server-only'

// GEDCOM 5.5.1 export — formato estándar de Ancestry/MyHeritage/FamilySearch.
// Spec: https://www.familysearch.org/developers/docs/guides/gedcom
//
// Genera un string en formato GEDCOM con:
//   • Header con info del software emisor
//   • INDI (Individual) por cada Person
//   • FAM (Family) por cada par padre/madre con hijos
//   • FAM por cada Relationship explícita (SPOUSE/PARTNER) con start/endDate
//   • Eventos: BIRT (nacimiento), DEAT (defunción), MARR (matrimonio), DIV (separación)
//
// NO exporta: contenido (historias, recetas), media (fotos), comentarios.
// Esos son específicos de Genome Tree y no caben en GEDCOM estándar.

import { prisma } from '@/lib/prisma'

interface PersonRow {
  id: string
  firstName: string
  middleName: string | null
  lastName: string
  birthSurname1: string | null
  birthSurname2: string | null
  birthDate: Date | null
  deathDate: Date | null
  birthPlace: string | null
  gender: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN'
  fatherId: string | null
  motherId: string | null
  fatherKind: 'BIOLOGICAL' | 'ADOPTIVE' | 'STEP' | null
  motherKind: 'BIOLOGICAL' | 'ADOPTIVE' | 'STEP' | null
  bio: string | null
}

interface RelationshipRow {
  id: string
  person1Id: string
  person2Id: string
  type: 'SPOUSE' | 'PARTNER' | 'SIBLING'
  startDate: Date | null
  endDate:   Date | null
}

/**
 * Formato GEDCOM de fecha: "DD MMM YYYY" en inglés, mes en mayúsculas.
 * Si solo hay año disponible (caso edge), devuelve "YYYY".
 */
function gedDate(d: Date): string {
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

function gedSex(g: PersonRow['gender']): 'M' | 'F' | 'U' {
  if (g === 'MALE') return 'M'
  if (g === 'FEMALE') return 'F'
  return 'U'
}

function gedName(p: PersonRow): string {
  // GEDCOM convention: First /Surname/
  const given = [p.firstName, p.middleName].filter(Boolean).join(' ')
  // Surname para genealogía: usar birthSurname1 si está (apellido de soltera),
  // sino el lastName actual.
  const surname = p.birthSurname1 ?? p.lastName
  return `${given} /${surname}/`
}

/**
 * Escapa caracteres especiales de una línea de NOTE/CONT.
 * GEDCOM permite @@ literal pero @ debe ser @@.
 */
function gedEscape(text: string): string {
  return text.replace(/@/g, '@@')
}

/**
 * Parte un texto largo en líneas CONT/CONC para no superar 250 chars/línea.
 * Cada línea adicional usa nivel level+1 con CONT (newline preservado) o
 * CONC (continuación sin newline).
 */
function* gedNoteLines(level: number, text: string): Generator<string> {
  const escaped = gedEscape(text)
  const lines = escaped.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const tag = i === 0 ? 'NOTE' : 'CONT'
    yield `${level + (i === 0 ? 0 : 1)} ${tag} ${lines[i]}`
  }
}

/**
 * Familia "biológica" sintética: dos personas que comparten un hijo.
 * GEDCOM no tiene PARENT_CHILD directo — todo es vía FAM. Construimos las
 * familias agregando todos los hijos por par (fatherId, motherId).
 */
interface BioFamily {
  id: string                  // F1, F2, ...
  husbandId: string | null
  wifeId:    string | null
  childIds:  string[]
}

export async function exportGedcom(familyId: string): Promise<string> {
  const persons: PersonRow[] = await prisma.person.findMany({
    where:  { familyId, deletedAt: null },
    select: {
      id: true, firstName: true, middleName: true, lastName: true,
      birthSurname1: true, birthSurname2: true,
      birthDate: true, deathDate: true, birthPlace: true,
      gender: true, fatherId: true, motherId: true,
      fatherKind: true, motherKind: true,
      bio: true,
    },
  })

  const relationships: RelationshipRow[] = await prisma.relationship.findMany({
    where:  { familyId, type: { in: ['SPOUSE', 'PARTNER'] } },
    select: {
      id: true, person1Id: true, person2Id: true, type: true,
      startDate: true, endDate: true,
    },
  })

  const family = await prisma.family.findUnique({
    where:  { id: familyId },
    select: { name: true },
  })

  // Construir familias biológicas a partir de fatherId/motherId
  const bioFamilies = buildBioFamilies(persons)

  // Construir familias adicionales para Relationships sin hijos en común
  // (parejas sin hijos registrados en el árbol). Skip si la pareja ya tiene
  // una bio family.
  const bioFamPairKey = new Set<string>()
  for (const f of bioFamilies) {
    if (f.husbandId && f.wifeId) {
      bioFamPairKey.add(pairKey(f.husbandId, f.wifeId))
    }
  }
  const extraFamilies: BioFamily[] = []
  for (const r of relationships) {
    if (bioFamPairKey.has(pairKey(r.person1Id, r.person2Id))) continue
    extraFamilies.push({
      id: '',  // assigned below
      husbandId: r.person1Id,
      wifeId: r.person2Id,
      childIds: [],
    })
    bioFamPairKey.add(pairKey(r.person1Id, r.person2Id))
  }

  const allFamilies = [...bioFamilies, ...extraFamilies]
  for (let i = 0; i < allFamilies.length; i++) {
    allFamilies[i].id = `F${i + 1}`
  }

  // Indexar relationships por par para sacar fechas en MARR/DIV
  const relByPair = new Map<string, RelationshipRow>()
  for (const r of relationships) {
    relByPair.set(pairKey(r.person1Id, r.person2Id), r)
  }

  // Indexar por persona qué FAM[s] le corresponden:
  //   FAMS — familias en las que es esposo/a (spouse)
  //   FAMC — familia en la que es hijo/a (child)
  const famsByPerson = new Map<string, string[]>()
  const famcByPerson = new Map<string, { famId: string; pedigree: 'birth' | 'adopted' | 'foster' }>()
  for (const f of allFamilies) {
    if (f.husbandId) {
      const list = famsByPerson.get(f.husbandId) ?? []
      list.push(f.id); famsByPerson.set(f.husbandId, list)
    }
    if (f.wifeId) {
      const list = famsByPerson.get(f.wifeId) ?? []
      list.push(f.id); famsByPerson.set(f.wifeId, list)
    }
    for (const childId of f.childIds) {
      // Para pedigree, miramos el kind del padre/madre del hijo
      const child = persons.find(p => p.id === childId)
      let pedigree: 'birth' | 'adopted' | 'foster' = 'birth'
      const fk = child?.fatherKind, mk = child?.motherKind
      if (fk === 'ADOPTIVE' || mk === 'ADOPTIVE') pedigree = 'adopted'
      else if (fk === 'STEP' || mk === 'STEP') pedigree = 'foster'
      famcByPerson.set(childId, { famId: f.id, pedigree })
    }
  }

  // Construir el output GEDCOM
  const lines: string[] = []
  const now = new Date()
  const exportDate = gedDate(now)

  // Header
  lines.push('0 HEAD')
  lines.push('1 SOUR GenomeTree')
  lines.push('2 NAME Genome Tree')
  lines.push('2 VERS 3.1')
  lines.push('1 GEDC')
  lines.push('2 VERS 5.5.1')
  lines.push('2 FORM LINEAGE-LINKED')
  lines.push('1 CHAR UTF-8')
  lines.push(`1 DATE ${exportDate}`)
  if (family) lines.push(`1 NOTE Familia: ${gedEscape(family.name)}`)

  // INDI por cada persona
  const indiId = (id: string) => `@I${persons.findIndex(p => p.id === id) + 1}@`
  const famId = (id: string) => `@${id}@`

  for (let i = 0; i < persons.length; i++) {
    const p = persons[i]
    lines.push(`0 @I${i + 1}@ INDI`)
    lines.push(`1 NAME ${gedName(p)}`)
    lines.push(`1 SEX ${gedSex(p.gender)}`)

    if (p.birthDate || p.birthPlace) {
      lines.push('1 BIRT')
      if (p.birthDate) lines.push(`2 DATE ${gedDate(p.birthDate)}`)
      if (p.birthPlace) lines.push(`2 PLAC ${gedEscape(p.birthPlace)}`)
    }
    if (p.deathDate) {
      lines.push('1 DEAT')
      lines.push(`2 DATE ${gedDate(p.deathDate)}`)
    }

    // FAMS — familias donde es esposo/a
    for (const fId of famsByPerson.get(p.id) ?? []) {
      lines.push(`1 FAMS ${famId(fId)}`)
    }
    // FAMC — familia donde es hijo/a (max 1)
    const famc = famcByPerson.get(p.id)
    if (famc) {
      lines.push(`1 FAMC ${famId(famc.famId)}`)
      // PEDI: birth | adopted | foster — si no es birth, lo declaramos
      if (famc.pedigree !== 'birth') {
        lines.push(`2 PEDI ${famc.pedigree}`)
      }
    }

    if (p.bio) {
      for (const noteLine of gedNoteLines(1, p.bio)) {
        lines.push(noteLine)
      }
    }
  }

  // FAM por cada familia
  for (const f of allFamilies) {
    lines.push(`0 @${f.id}@ FAM`)
    if (f.husbandId) lines.push(`1 HUSB ${indiId(f.husbandId)}`)
    if (f.wifeId)    lines.push(`1 WIFE ${indiId(f.wifeId)}`)
    for (const cId of f.childIds) {
      lines.push(`1 CHIL ${indiId(cId)}`)
    }

    // Eventos MARR / DIV si la pareja tiene Relationship con fechas
    if (f.husbandId && f.wifeId) {
      const rel = relByPair.get(pairKey(f.husbandId, f.wifeId))
      if (rel?.startDate) {
        lines.push('1 MARR')
        lines.push(`2 DATE ${gedDate(rel.startDate)}`)
      }
      if (rel?.endDate) {
        lines.push('1 DIV')
        lines.push(`2 DATE ${gedDate(rel.endDate)}`)
      }
    }
  }

  // Trailer
  lines.push('0 TRLR')

  return lines.join('\n') + '\n'
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function buildBioFamilies(persons: PersonRow[]): BioFamily[] {
  // Agrupar hijos por (fatherId, motherId)
  const byParents = new Map<string, BioFamily>()

  for (const p of persons) {
    if (!p.fatherId && !p.motherId) continue
    const key = `${p.fatherId ?? 'X'}|${p.motherId ?? 'X'}`
    let fam = byParents.get(key)
    if (!fam) {
      fam = { id: '', husbandId: p.fatherId, wifeId: p.motherId, childIds: [] }
      byParents.set(key, fam)
    }
    fam.childIds.push(p.id)
  }

  return [...byParents.values()]
}
