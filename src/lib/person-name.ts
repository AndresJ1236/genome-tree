export interface PersonNameParts {
  firstName: string
  middleName?: string | null
  lastName: string
}

export function getPersonDisplayName(person: PersonNameParts) {
  return [person.firstName, person.middleName ?? '', person.lastName]
    .map(part => part.trim())
    .filter(Boolean)
    .join(' ')
}
