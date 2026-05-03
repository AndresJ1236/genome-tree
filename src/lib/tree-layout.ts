import type { PersonData, RelationshipData, LayoutNode, FamilyUnit, PetLink, TreeLayout, TreeLayoutOptions } from './tree-types'

export const NODE_W = 72
export const NODE_H = 72
const GEN_H      = 250
const H_GAP      = 150
const COUPLE_GAP = 120
const ORBIT_R    = 110
// Preferred orbit angles (degrees, 0=right, clockwise in screen space)
const ORBIT_ANGLES = [80, 35, 125, -35, 145, -80, 170]

// ── Focus-centered lateral score ──────────────────────────────────────────
// BFS upward from the focus person.
// Going via fatherId → LEFT (negative scores)
// Going via motherId → RIGHT (positive scores)
// Paternal ancestors stay negative, maternal ancestors stay positive.
function computeFocusLateralScores(
  focusId: string,
  personMap: Map<string, PersonData>,
  personSet: Set<string>,
  spousesOf: Map<string, string[]>,
): Map<string, number> {
  const scores = new Map<string, number>()
  scores.set(focusId, 0)

  type QueueItem = { id: string; score: number }
  const queue: QueueItem[] = [{ id: focusId, score: 0 }]

  while (queue.length > 0) {
    const { id, score } = queue.shift()!
    const person = personMap.get(id)
    if (!person) continue

    if (person.fatherId && personSet.has(person.fatherId) && !scores.has(person.fatherId)) {
      // Father → LEFT. Already on left: full step. On right: half step.
      const next = score <= 0 ? score - 1 : score - 0.5
      scores.set(person.fatherId, next)
      queue.push({ id: person.fatherId, score: next })
    }

    if (person.motherId && personSet.has(person.motherId) && !scores.has(person.motherId)) {
      // Mother → RIGHT. Already on right: full step. On left: half step.
      const next = score >= 0 ? score + 1 : score + 0.5
      scores.set(person.motherId, next)
      queue.push({ id: person.motherId, score: next })
    }
  }

  // Propagate scores to spouses of scored people
  let changed = true
  while (changed) {
    changed = false
    for (const [id, s] of [...scores.entries()]) {
      for (const sid of (spousesOf.get(id) ?? [])) {
        if (!scores.has(sid)) {
          scores.set(sid, s)
          changed = true
        }
      }
    }
  }

  // Score siblings of the focus person: spread them around the focus (score=0)
  // by birth order, so the focus person ends up in the middle of their siblings.
  const fp = personMap.get(focusId)
  if (fp) {
    const sibIds: string[] = []
    for (const id of personSet) {
      if (id === focusId || scores.has(id)) continue
      const p = personMap.get(id)
      if (!p) continue
      if ((fp.fatherId && p.fatherId === fp.fatherId) ||
          (fp.motherId && p.motherId === fp.motherId)) {
        sibIds.push(id)
      }
    }
    if (sibIds.length > 0) {
      const getYear = (id: string) => {
        const bd = id === focusId ? fp.birthDate : personMap.get(id)?.birthDate
        return bd ? new Date(bd).getFullYear() : 9999
      }
      const allOrdered = [...sibIds, focusId].sort((a, b) => getYear(a) - getYear(b))
      const focusIdx = allOrdered.indexOf(focusId)
      for (let i = 0; i < allOrdered.length; i++) {
        const id = allOrdered[i]
        if (id === focusId) continue
        scores.set(id, (i - focusIdx) * 0.45)
      }
    }
  }

  // ── Branch propagation through siblings, spouses, children, parents ──
  // Without this, ancestors' siblings (and their descendants/spouses) end up
  // at score 0 — placed in the center, mixing paternal & maternal branches.
  // Propagate the lateral score outward through the family graph so each
  // connected branch lands fully on one side.
  const fatherChildren = new Map<string, string[]>()
  const motherChildren = new Map<string, string[]>()
  for (const id of personSet) {
    const p = personMap.get(id)
    if (!p) continue
    if (p.fatherId && personSet.has(p.fatherId)) {
      if (!fatherChildren.has(p.fatherId)) fatherChildren.set(p.fatherId, [])
      fatherChildren.get(p.fatherId)!.push(id)
    }
    if (p.motherId && personSet.has(p.motherId)) {
      if (!motherChildren.has(p.motherId)) motherChildren.set(p.motherId, [])
      motherChildren.get(p.motherId)!.push(id)
    }
  }

  let propagated = true
  let safety = 50
  while (propagated && safety-- > 0) {
    propagated = false

    // Spouses (married into the family → same side as partner)
    for (const [id, s] of [...scores.entries()]) {
      for (const sid of (spousesOf.get(id) ?? [])) {
        if (!scores.has(sid)) {
          scores.set(sid, s)
          propagated = true
        }
      }
    }

    // Siblings (same parents → same side)
    for (const [id, s] of [...scores.entries()]) {
      const p = personMap.get(id)
      if (!p) continue
      const sibs = new Set<string>()
      if (p.fatherId) (fatherChildren.get(p.fatherId) ?? []).forEach(c => { if (c !== id) sibs.add(c) })
      if (p.motherId) (motherChildren.get(p.motherId) ?? []).forEach(c => { if (c !== id) sibs.add(c) })
      for (const sib of sibs) {
        if (!scores.has(sib)) {
          scores.set(sib, s)
          propagated = true
        }
      }
    }

    // Children inherit from scored parents (avg if both scored)
    for (const id of personSet) {
      if (scores.has(id)) continue
      const p = personMap.get(id)
      if (!p) continue
      let inherited: number | null = null
      if (p.fatherId && scores.has(p.fatherId)) inherited = scores.get(p.fatherId)!
      if (p.motherId && scores.has(p.motherId)) {
        const ms = scores.get(p.motherId)!
        inherited = inherited === null ? ms : (inherited + ms) / 2
      }
      if (inherited !== null) {
        scores.set(id, inherited)
        propagated = true
      }
    }

    // Parents of scored people inherit (catches in-laws of scored relatives)
    for (const [id, s] of [...scores.entries()]) {
      const p = personMap.get(id)
      if (!p) continue
      if (p.fatherId && personSet.has(p.fatherId) && !scores.has(p.fatherId)) {
        scores.set(p.fatherId, s)
        propagated = true
      }
      if (p.motherId && personSet.has(p.motherId) && !scores.has(p.motherId)) {
        scores.set(p.motherId, s)
        propagated = true
      }
    }
  }

  // Unscored people (truly disconnected) default to 0
  for (const id of personSet) {
    if (!scores.has(id)) scores.set(id, 0)
  }

  return scores
}

// ── Auto-focus detection ──────────────────────────────────────────────────
// When no explicit focusPersonId is provided, pick the most "interior" person:
// the deepest in the tree (by generation) who also has at least one parent
// AND at least one child in the dataset. This ensures the focus-centered
// algorithm always runs and separates paternal/maternal branches.
function findAutoFocus(
  persons: PersonData[],
  parentsOf: Map<string, string[]>,
  childrenOf: Map<string, Set<string>>,
  gen: Map<string, number>,
): string {
  let bestId    = persons[0].id
  let bestScore = -Infinity

  // Phase 1: prefer someone with BOTH known parents AND at least one child.
  // Among those, pick the deepest (higher generation = deeper = more interior).
  for (const p of persons) {
    const parentCount = parentsOf.get(p.id)?.length ?? 0
    const childCount  = childrenOf.get(p.id)?.size  ?? 0
    if (parentCount === 0 || childCount === 0) continue  // must be a bridge
    const depth = gen.get(p.id) ?? 0
    const s = depth * 100 + parentCount * 10 + childCount
    if (s > bestScore) { bestScore = s; bestId = p.id }
  }
  if (bestScore > -Infinity) return bestId

  // Phase 2 fallback: deepest person with any known parent (a leaf with parents
  // is still better than a root with no parents).
  bestScore = -Infinity
  for (const p of persons) {
    const parentCount = parentsOf.get(p.id)?.length ?? 0
    if (parentCount === 0) continue
    const depth = gen.get(p.id) ?? 0
    const s = depth * 100 + parentCount
    if (s > bestScore) { bestScore = s; bestId = p.id }
  }

  return bestId
}

// ── Main layout function ──────────────────────────────────────────────────

export function computeTreeLayout(
  persons: PersonData[],
  relationships: RelationshipData[] = [],
  options?: TreeLayoutOptions,
): TreeLayout {
  if (persons.length === 0) {
    return { nodes: [], familyUnits: [], petLinks: [], bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }
  }

  // Separate pets — they don't participate in the generation grid
  const pets    = persons.filter(p => p.nodeKind === 'PET')
  const nonPets = persons.filter(p => p.nodeKind !== 'PET')

  persons = nonPets

  const personSet = new Set(persons.map(p => p.id))
  const personMap = new Map(persons.map(p => [p.id, p]))
  const ownYear = (id: string) => {
    const p = personMap.get(id)
    return p?.birthDate ? new Date(p.birthDate).getFullYear() : 9999
  }

  const childrenOf = new Map<string, Set<string>>()
  const parentsOf  = new Map<string, string[]>()

  for (const p of persons) {
    const known: string[] = []
    if (p.fatherId && personSet.has(p.fatherId)) {
      known.push(p.fatherId)
      if (!childrenOf.has(p.fatherId)) childrenOf.set(p.fatherId, new Set())
      childrenOf.get(p.fatherId)!.add(p.id)
    }
    if (p.motherId && personSet.has(p.motherId)) {
      known.push(p.motherId)
      if (!childrenOf.has(p.motherId)) childrenOf.set(p.motherId, new Set())
      childrenOf.get(p.motherId)!.add(p.id)
    }
    if (known.length > 0) parentsOf.set(p.id, known)
  }

  const coupleKey = (a: string, b: string) => [a, b].sort().join('|')
  const inferredCouples = new Map<string, { p1: string; p2: string }>()

  // ── Pass 0: detect implicit couples from shared children ──────────────────
  // If two people share a child (fatherId = X, motherId = Y) they are treated
  // as a couple for generation-alignment purposes even without a Relationship
  // record. Threshold raised to 60 years to tolerate data-entry errors and
  // unusual (but real) age gaps.
  const likelyRealCouple = (a: string, b: string) => {
    const ay = ownYear(a)
    const by = ownYear(b)
    return ay === 9999 || by === 9999 || Math.abs(ay - by) <= 60
  }

  for (const p of persons) {
    const fid = p.fatherId && personSet.has(p.fatherId) ? p.fatherId : null
    const mid = p.motherId && personSet.has(p.motherId) ? p.motherId : null
    if (fid && mid && likelyRealCouple(fid, mid)) {
      const k = coupleKey(fid, mid)
      if (!inferredCouples.has(k)) inferredCouples.set(k, { p1: fid, p2: mid })
    }
  }

  const explicitCoupleData = new Map<string, { isEx: boolean }>()
  for (const rel of relationships) {
    if (!personSet.has(rel.person1Id) || !personSet.has(rel.person2Id)) continue
    const k = coupleKey(rel.person1Id, rel.person2Id)
    explicitCoupleData.set(k, { isEx: rel.endDate !== null })
    if (!inferredCouples.has(k)) {
      inferredCouples.set(k, { p1: rel.person1Id, p2: rel.person2Id })
    }
  }

  const spousesOf = new Map<string, string[]>()
  for (const { p1, p2 } of inferredCouples.values()) {
    if (!spousesOf.has(p1)) spousesOf.set(p1, [])
    if (!spousesOf.has(p2)) spousesOf.set(p2, [])
    if (!spousesOf.get(p1)!.includes(p2)) spousesOf.get(p1)!.push(p2)
    if (!spousesOf.get(p2)!.includes(p1)) spousesOf.get(p2)!.push(p1)
  }

  const minParentYear = (id: string): number => {
    const p = personMap.get(id)
    if (!p) return 9999
    const fy = p.fatherId && personSet.has(p.fatherId) ? ownYear(p.fatherId) : 9999
    const my = p.motherId && personSet.has(p.motherId) ? ownYear(p.motherId) : 9999
    return Math.min(fy, my)
  }

  // ── Generation assignment ─────────────────────────────────────────────────
  const gen = new Map<string, number>()
  const visiting = new Set<string>()

  function deriveGeneration(id: string): number {
    if (gen.has(id)) return gen.get(id)!
    if (visiting.has(id)) return 0
    visiting.add(id)
    const parents = parentsOf.get(id) ?? []
    const value = parents.length === 0
      ? 0
      : Math.max(...parents.map(pid => deriveGeneration(pid) + 1))
    visiting.delete(id)
    gen.set(id, value)
    return value
  }

  for (const p of persons) deriveGeneration(p.id)

  const hasKnownParents = (id: string) => (parentsOf.get(id)?.length ?? 0) > 0

  // Used in Pass 2 only (both members have parents — guard against truly
  // unrelated people being merged by mistake). Threshold matches likelyRealCouple.
  const likelySameGenerationSpouses = (a: string, b: string) => {
    const ay = ownYear(a)
    const by = ownYear(b)
    return ay === 9999 || by === 9999 || Math.abs(ay - by) <= 60
  }

  // Pass 1: align couples where one lacks parents.
  // No age guard here — if someone has NO parents and is a known couple of an
  // anchored person, we must always align them regardless of birth-year difference.
  for (const { p1, p2 } of inferredCouples.values()) {
    const g1 = gen.get(p1) ?? 0
    const g2 = gen.get(p2) ?? 0
    if (!hasKnownParents(p1) && hasKnownParents(p2)) gen.set(p1, g2)
    else if (!hasKnownParents(p2) && hasKnownParents(p1)) gen.set(p2, g1)
  }

  // Pass 2: iterative alignment for couples where BOTH have parents but at
  // different depths (e.g. one side has more recorded generations than the other).
  // Push the shallower person DOWN to match their spouse (use max generation).
  // Then re-derive children so nothing is left at a stale level.
  //
  // IMPORTANT: re-derivation only INCREASES generations, never decreases.
  // Without this, a couple-aligned person (pushed up to their spouse's deeper
  // generation) would be pulled back down to gen(their own parents)+1, causing
  // the loop to oscillate and the safety counter to abort with wrong results.
  {
    let changed = true
    let safety = 15
    while (changed && safety-- > 0) {
      changed = false
      for (const { p1, p2 } of inferredCouples.values()) {
        if (!likelySameGenerationSpouses(p1, p2)) continue
        const g1 = gen.get(p1) ?? 0
        const g2 = gen.get(p2) ?? 0
        if (g1 === g2) continue
        const aligned = Math.max(g1, g2)
        if ((gen.get(p1) ?? 0) !== aligned) { gen.set(p1, aligned); changed = true }
        if ((gen.get(p2) ?? 0) !== aligned) { gen.set(p2, aligned); changed = true }
      }
      // Re-derive children — only increase, never decrease.
      // Couple alignment always wins over parent-depth constraints.
      for (const p of persons) {
        const parents = parentsOf.get(p.id)
        if (!parents || parents.length === 0) continue
        const expected = Math.max(...parents.map(pid => (gen.get(pid) ?? 0))) + 1
        if (expected > (gen.get(p.id) ?? 0)) { gen.set(p.id, expected); changed = true }
      }
    }
  }

  const byGen = new Map<number, string[]>()
  for (const [id, g] of gen.entries()) {
    if (!byGen.has(g)) byGen.set(g, [])
    byGen.get(g)!.push(id)
  }
  const maxGen = Math.max(...gen.values())

  // ── Score computation ─────────────────────────────────────────────────────
  // Always use focus-centered lateral scores.
  // Focus priority: (1) explicit focusPersonId from session, (2) auto-detected
  // most-interior person (deepest with known parents + children).
  const focusId: string =
    options?.focusPersonId && personSet.has(options.focusPersonId)
      ? options.focusPersonId
      : findAutoFocus(persons, parentsOf, childrenOf, gen)

  const score: Map<string, number> = computeFocusLateralScores(focusId, personMap, personSet, spousesOf)

  // ── X-position layout ─────────────────────────────────────────────────────
  const unitScore = (members: string[]) => {
    const ss = members.map(id => score.get(id) ?? 0)
    return ss.reduce((a, b) => a + b, 0) / ss.length
  }

  type GenUnit = { members: string[]; sortKey: number }

  function buildGenerationUnits(ids: string[]): GenUnit[] {
    const inGen = new Set(ids)
    const seen  = new Set<string>()
    const units: GenUnit[] = []

    const sortedIds = [...ids].sort((a, b) => {
      const sa = score.get(a) ?? 0
      const sb = score.get(b) ?? 0
      if (sa !== sb) return sa - sb
      const pyA = minParentYear(a)
      const pyB = minParentYear(b)
      if (pyA !== pyB) return pyA - pyB
      return ownYear(a) - ownYear(b)
    })

    for (const id of sortedIds) {
      if (seen.has(id)) continue
      const queue = [id]
      const component: string[] = []
      seen.add(id)

      while (queue.length > 0) {
        const current = queue.shift()!
        component.push(current)
        for (const sid of spousesOf.get(current) ?? []) {
          if (!inGen.has(sid) || seen.has(sid)) continue
          seen.add(sid)
          queue.push(sid)
        }
      }

      component.sort((a, b) => {
        const sa = score.get(a) ?? 0
        const sb = score.get(b) ?? 0
        if (sa !== sb) return sa - sb
        return ownYear(a) - ownYear(b)
      })
      units.push({
        members: component,
        sortKey: Math.min(...component.map(m => Math.min(minParentYear(m), ownYear(m)))),
      })
    }

    return units
  }

  function memberOffsets(members: string[]): number[] {
    if (members.length === 1) return [0]
    if (members.length === 2) return [-COUPLE_GAP / 2, COUPLE_GAP / 2]
    const offsets: number[] = []
    const start = -((members.length - 1) * H_GAP) / 2
    for (let i = 0; i < members.length; i++) offsets.push(start + i * H_GAP)
    return offsets
  }

  const xPos = new Map<string, number>()

  function desiredCenterForUnit(members: string[]): number | null {
    const childXes: number[] = []
    for (const member of members) {
      for (const cid of childrenOf.get(member) ?? []) {
        if (xPos.has(cid)) childXes.push(xPos.get(cid)!)
      }
    }
    if (childXes.length > 0) {
      return (Math.min(...childXes) + Math.max(...childXes)) / 2
    }
    return null
  }

  for (let g = maxGen; g >= 0; g--) {
    const ids   = byGen.get(g) ?? []
    const units = buildGenerationUnits(ids)

    const fallbackCenters = new Map<GenUnit, number>()
    const orderedByFallback = [...units].sort((a, b) => {
      const sa = unitScore(a.members)
      const sb = unitScore(b.members)
      if (Math.abs(sa - sb) > 1e-9) return sa - sb
      return a.sortKey - b.sortKey
    })
    orderedByFallback.forEach((unit, index) => {
      fallbackCenters.set(unit, index * H_GAP)
    })

    units.sort((a, b) => {
      const centerA = desiredCenterForUnit(a.members) ?? fallbackCenters.get(a) ?? 0
      const centerB = desiredCenterForUnit(b.members) ?? fallbackCenters.get(b) ?? 0
      if (centerA !== centerB) return centerA - centerB
      return a.sortKey - b.sortKey
    })

    let previousRightmost: number | null = null

    for (const unit of units) {
      const offsets       = memberOffsets(unit.members)
      const desiredCenter = desiredCenterForUnit(unit.members) ?? fallbackCenters.get(unit) ?? 0
      const desiredLeft   = desiredCenter + offsets[0]

      let center = desiredCenter
      if (previousRightmost !== null) {
        const minLeft = previousRightmost + H_GAP
        if (desiredLeft < minLeft) center += minLeft - desiredLeft
      }

      for (let i = 0; i < unit.members.length; i++) {
        xPos.set(unit.members[i], center + offsets[i])
      }

      previousRightmost = center + offsets[offsets.length - 1]
    }
  }

  // ── Build nodes ───────────────────────────────────────────────────────────
  const nodes: LayoutNode[] = persons.map(p => ({
    ...p,
    x:          xPos.get(p.id) ?? 0,
    y:          (gen.get(p.id) ?? 0) * GEN_H,
    generation: gen.get(p.id) ?? 0,
  }))

  // Center the canvas on the focus person
  const focusX = xPos.get(focusId) ?? 0
  for (const n of nodes) n.x -= focusX

  // ── Place pets orbiting their owner ──────────────────────────────────────
  const nodeById     = new Map(nodes.map(n => [n.id, n]))
  const petsByOwner  = new Map<string, string[]>()
  for (const pet of pets) {
    const ownerId = pet.fatherId ?? pet.motherId
    if (!ownerId || !nodeById.has(ownerId)) continue
    if (!petsByOwner.has(ownerId)) petsByOwner.set(ownerId, [])
    petsByOwner.get(ownerId)!.push(pet.id)
  }

  const petLinks:    PetLink[] = []
  const petXOverride = new Map<string, number>()
  const petYOverride = new Map<string, number>()

  for (const [ownerId, petIds] of petsByOwner.entries()) {
    const owner   = nodeById.get(ownerId)!
    const ownerCx = owner.x + NODE_W / 2
    const ownerCy = owner.y + NODE_H / 2
    for (let i = 0; i < petIds.length; i++) {
      const angleDeg = ORBIT_ANGLES[i % ORBIT_ANGLES.length]
      const angleRad = (angleDeg * Math.PI) / 180
      petXOverride.set(petIds[i], ownerCx + ORBIT_R * Math.cos(angleRad) - NODE_W / 2)
      petYOverride.set(petIds[i], ownerCy + ORBIT_R * Math.sin(angleRad) - NODE_H / 2)
    }
  }

  const leftmostX = nodes.length > 0 ? Math.min(...nodes.map(n => n.x)) : 0
  let orphanPetIndex = 0
  for (const pet of pets) {
    const ownerId = pet.fatherId ?? pet.motherId
    if (!ownerId || !nodeById.has(ownerId)) {
      petXOverride.set(pet.id, leftmostX - 120 - orphanPetIndex * 80)
      petYOverride.set(pet.id, 0)
      orphanPetIndex++
    }
  }

  for (const pet of pets) {
    const ownerId = pet.fatherId ?? pet.motherId
    if (ownerId && personSet.has(ownerId)) petLinks.push({ petId: pet.id, ownerId })
    nodes.push({
      ...pet,
      x:          petXOverride.get(pet.id) ?? 0,
      y:          petYOverride.get(pet.id) ?? 0,
      generation: gen.get(pet.fatherId ?? pet.motherId ?? '') ?? 0,
    })
  }

  // ── Family units (for edge drawing) ──────────────────────────────────────
  const familyUnits: FamilyUnit[] = []
  const processedUnits = new Set<string>()

  for (const [key, { p1, p2 }] of inferredCouples.entries()) {
    if (processedUnits.has(key)) continue
    processedUnits.add(key)

    const kids = new Set<string>()
    for (const p of persons) {
      const fid = p.fatherId && personSet.has(p.fatherId) ? p.fatherId : null
      const mid = p.motherId && personSet.has(p.motherId) ? p.motherId : null
      if ((fid === p1 && mid === p2) || (fid === p2 && mid === p1)) kids.add(p.id)
    }

    familyUnits.push({
      id:         'unit-' + key,
      parent1Id:  p1,
      parent2Id:  p2,
      childIds:   [...kids],
      isExCouple: explicitCoupleData.get(key)?.isEx ?? false,
    })
  }

  for (const p of persons) {
    const fid = p.fatherId && personSet.has(p.fatherId) ? p.fatherId : null
    const mid = p.motherId && personSet.has(p.motherId) ? p.motherId : null
    if (fid && !mid) {
      const key = 'solo-' + fid
      const existing = familyUnits.find(u => u.id === key)
      if (existing) existing.childIds.push(p.id)
      else familyUnits.push({ id: key, parent1Id: fid, parent2Id: null, childIds: [p.id] })
    } else if (!fid && mid) {
      const key = 'solo-' + mid
      const existing = familyUnits.find(u => u.id === key)
      if (existing) existing.childIds.push(p.id)
      else familyUnits.push({ id: key, parent1Id: mid, parent2Id: null, childIds: [p.id] })
    }
  }

  const xs = nodes.map(n => n.x)
  const ys = nodes.map(n => n.y)

  return {
    nodes,
    familyUnits,
    petLinks,
    bounds: {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs) + NODE_W,
      maxY: Math.max(...ys) + NODE_H,
    },
  }
}
