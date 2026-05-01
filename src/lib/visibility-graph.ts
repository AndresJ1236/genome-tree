export interface VisibilityGraphPerson {
  id: string
  fatherId: string | null
  motherId: string | null
}

export interface VisibilityManagedUnit {
  parentAId: string
  parentBId: string | null
}

export function buildChildrenIndex(people: readonly VisibilityGraphPerson[]) {
  const childrenOf = new Map<string, string[]>()

  for (const person of people) {
    if (person.fatherId) {
      if (!childrenOf.has(person.fatherId)) childrenOf.set(person.fatherId, [])
      childrenOf.get(person.fatherId)!.push(person.id)
    }
    if (person.motherId) {
      if (!childrenOf.has(person.motherId)) childrenOf.set(person.motherId, [])
      childrenOf.get(person.motherId)!.push(person.id)
    }
  }

  return childrenOf
}

export function buildBloodGraph(people: readonly VisibilityGraphPerson[]) {
  const graph = new Map<string, Set<string>>()

  function ensure(id: string) {
    if (!graph.has(id)) graph.set(id, new Set())
    return graph.get(id)!
  }

  for (const person of people) {
    ensure(person.id)

    for (const parentId of [person.fatherId, person.motherId]) {
      if (!parentId) continue
      ensure(person.id).add(parentId)
      ensure(parentId).add(person.id)
    }
  }

  return graph
}

export function getDescendantIdsFromPeople(
  people: readonly VisibilityGraphPerson[],
  rootPersonId: string
) {
  const childrenOf = buildChildrenIndex(people)
  const result = new Set<string>()
  const queue = [rootPersonId]

  while (queue.length > 0) {
    const current = queue.shift()!
    for (const childId of childrenOf.get(current) ?? []) {
      if (!result.has(childId)) {
        result.add(childId)
        queue.push(childId)
      }
    }
  }

  return result
}

export function getBloodContextIdsFromPeople(
  people: readonly VisibilityGraphPerson[],
  rootPersonId: string,
  maxDistance: number
) {
  const graph = buildBloodGraph(people)
  const result = new Set<string>()
  const visited = new Set<string>([rootPersonId])
  const queue: Array<{ id: string; distance: number }> = [{ id: rootPersonId, distance: 0 }]

  while (queue.length > 0) {
    const { id, distance } = queue.shift()!
    result.add(id)
    if (distance >= maxDistance) continue

    for (const next of graph.get(id) ?? []) {
      if (!visited.has(next)) {
        visited.add(next)
        queue.push({ id: next, distance: distance + 1 })
      }
    }
  }

  return result
}

export function getDirectPartnerIdsFromPeople(
  people: readonly VisibilityGraphPerson[],
  visibleIds: ReadonlySet<string>
) {
  const partners = new Set<string>()

  for (const person of people) {
    if (person.fatherId && visibleIds.has(person.fatherId) && person.motherId && !visibleIds.has(person.motherId)) {
      partners.add(person.motherId)
    }

    if (person.motherId && visibleIds.has(person.motherId) && person.fatherId && !visibleIds.has(person.fatherId)) {
      partners.add(person.fatherId)
    }
  }

  return partners
}

export function computeVisiblePersonIdsFromPeople(
  people: readonly VisibilityGraphPerson[],
  rootPersonId: string,
  maxBloodDistance = 3
) {
  const descendants = getDescendantIdsFromPeople(people, rootPersonId)
  const bloodContext = getBloodContextIdsFromPeople(people, rootPersonId, maxBloodDistance)
  const visible = new Set<string>([...descendants, ...bloodContext])
  const partners = getDirectPartnerIdsFromPeople(people, visible)

  for (const partnerId of partners) visible.add(partnerId)

  return visible
}

export function getManagedUnitPersonIdsFromPeople(
  people: readonly VisibilityGraphPerson[],
  parentAId: string,
  parentBId: string | null
) {
  const result = new Set<string>([parentAId])
  if (parentBId) result.add(parentBId)

  const childrenOf = buildChildrenIndex(people)

  if (!parentBId) {
    const descendants = getDescendantIdsFromPeople(people, parentAId)
    for (const id of descendants) result.add(id)
    return result
  }

  const fatherChildren = new Set(childrenOf.get(parentAId) ?? [])
  const motherChildren = new Set(childrenOf.get(parentBId) ?? [])

  for (const childId of fatherChildren) {
    if (!motherChildren.has(childId)) continue
    result.add(childId)

    const descendants = getDescendantIdsFromPeople(people, childId)
    for (const id of descendants) result.add(id)
  }

  return result
}

export function isPersonManagedByUnitsFromPeople(
  people: readonly VisibilityGraphPerson[],
  units: readonly VisibilityManagedUnit[],
  personId: string
) {
  for (const unit of units) {
    const ids = getManagedUnitPersonIdsFromPeople(people, unit.parentAId, unit.parentBId)
    if (ids.has(personId)) return true
  }

  return false
}
