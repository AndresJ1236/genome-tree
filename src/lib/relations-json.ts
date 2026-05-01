export interface RelationsJsonPerson {
  id: string
  firstName: string
  middleName: string | null
  lastName: string
  birthSurname1: string | null
  birthSurname2: string | null
  fatherId: string | null
  motherId: string | null
}

export interface RelationsJsonPayload {
  familySlug: string
  exportedAt: string
  people: RelationsJsonPerson[]
}

type SourcePerson = {
  id: string
  firstName: string
  middleName: string | null
  lastName: string
  birthSurname1: string | null
  birthSurname2: string | null
  fatherId: string | null
  motherId: string | null
}

function normalizeNullableId(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function buildRelationsExportPayload(
  familySlug: string,
  people: readonly SourcePerson[],
  visibleIds: Set<string> | null
): RelationsJsonPayload {
  const visibleIdSet = visibleIds ?? new Set(people.map(person => person.id))
  const visiblePeople = people.filter(person => visibleIdSet.has(person.id))

  return {
    familySlug,
    exportedAt: new Date().toISOString(),
    people: visiblePeople.map(person => ({
      id: person.id,
      firstName: person.firstName,
      middleName: person.middleName,
      lastName: person.lastName,
      birthSurname1: person.birthSurname1,
      birthSurname2: person.birthSurname2,
      fatherId: person.fatherId && visibleIdSet.has(person.fatherId) ? person.fatherId : null,
      motherId: person.motherId && visibleIdSet.has(person.motherId) ? person.motherId : null,
    })),
  }
}

export function parseRelationsJsonPayload(jsonText: string): RelationsJsonPayload {
  let parsed: unknown

  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new Error('El archivo JSON no es valido.')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('El JSON debe ser un objeto.')
  }

  const payload = parsed as Record<string, unknown>
  if (typeof payload.familySlug !== 'string' || payload.familySlug.trim().length === 0) {
    throw new Error('El JSON debe incluir `familySlug`.')
  }

  if (!Array.isArray(payload.people)) {
    throw new Error('El JSON debe incluir un arreglo `people`.')
  }

  const people = payload.people.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`La persona en posicion ${index + 1} no es valida.`)
    }

    const person = item as Record<string, unknown>
    if (typeof person.id !== 'string' || person.id.trim().length === 0) {
      throw new Error(`La persona en posicion ${index + 1} no tiene un id valido.`)
    }

    return {
      id: person.id.trim(),
      firstName: typeof person.firstName === 'string' ? person.firstName.trim() : '',
      middleName: typeof person.middleName === 'string' && person.middleName.trim().length > 0 ? person.middleName.trim() : null,
      lastName: typeof person.lastName === 'string' ? person.lastName.trim() : '',
      birthSurname1: typeof person.birthSurname1 === 'string' && person.birthSurname1.trim().length > 0 ? person.birthSurname1.trim() : null,
      birthSurname2: typeof person.birthSurname2 === 'string' && person.birthSurname2.trim().length > 0 ? person.birthSurname2.trim() : null,
      fatherId: normalizeNullableId(person.fatherId),
      motherId: normalizeNullableId(person.motherId),
    } satisfies RelationsJsonPerson
  })

  return {
    familySlug: payload.familySlug.trim(),
    exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : new Date(0).toISOString(),
    people,
  }
}

export function planRelationsImport(
  payload: RelationsJsonPayload,
  existingIds: Set<string>
) {
  const seenIds = new Set<string>()
  const duplicateIds: string[] = []
  const missingPersonIds: string[] = []
  const missingReferenceIds = new Set<string>()
  const selfReferenceIds = new Set<string>()

  const updates = payload.people.map(person => {
    if (seenIds.has(person.id)) {
      duplicateIds.push(person.id)
    }
    seenIds.add(person.id)

    if (!existingIds.has(person.id)) {
      missingPersonIds.push(person.id)
    }

    if (person.fatherId && !existingIds.has(person.fatherId)) {
      missingReferenceIds.add(person.fatherId)
    }
    if (person.motherId && !existingIds.has(person.motherId)) {
      missingReferenceIds.add(person.motherId)
    }
    if (person.fatherId === person.id || person.motherId === person.id) {
      selfReferenceIds.add(person.id)
    }

    return {
      id: person.id,
      fatherId: person.fatherId,
      motherId: person.motherId,
    }
  })

  return {
    updates,
    duplicateIds,
    missingPersonIds,
    missingReferenceIds: [...missingReferenceIds],
    selfReferenceIds: [...selfReferenceIds],
  }
}
