export function normalizeSurname(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

export function extractSurnameTokens(lastName: string) {
  return lastName
    .split(/\s+/)
    .map(token => normalizeSurname(token))
    .filter(Boolean)
}

export function hasCompatibleManagedUnitSurname(
  personLastName: string,
  primarySurname: string | null,
  secondarySurname: string | null,
  birthSurname1?: string | null,
  birthSurname2?: string | null
) {
  const allowed = new Set(
    [primarySurname, secondarySurname]
      .filter((value): value is string => Boolean(value && value.trim()))
      .map(value => normalizeSurname(value))
  )

  if (allowed.size === 0) return true

  const sourceTokens = [
    ...extractSurnameTokens(personLastName),
    ...[birthSurname1, birthSurname2]
      .filter((value): value is string => Boolean(value && value.trim()))
      .map(value => normalizeSurname(value)),
  ]

  return sourceTokens.some(token => allowed.has(token))
}
