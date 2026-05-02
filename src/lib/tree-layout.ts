import type { PersonData, RelationshipData, LayoutNode, FamilyUnit, TreeLayout } from './tree-types'

export const NODE_W = 72
export const NODE_H = 72
const GEN_H      = 250
const H_GAP      = 150
const COUPLE_GAP = 120

export function computeTreeLayout(persons: PersonData[], relationships: RelationshipData[] = []): TreeLayout {
  if (persons.length === 0) {
    return { nodes: [], familyUnits: [], bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }
  }

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
  const likelyRealCouple = (a: string, b: string) => {
    const ay = ownYear(a)
    const by = ownYear(b)
    return ay === 9999 || by === 9999 || Math.abs(ay - by) <= 35
  }

  for (const p of persons) {
    const fid = p.fatherId && personSet.has(p.fatherId) ? p.fatherId : null
    const mid = p.motherId && personSet.has(p.motherId) ? p.motherId : null
    if (fid && mid && likelyRealCouple(fid, mid)) {
      const k = coupleKey(fid, mid)
      if (!inferredCouples.has(k)) inferredCouples.set(k, { p1: fid, p2: mid })
    }
  }

  // Merge explicit relationships into inferredCouples
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

  const gen = new Map<string, number>()
  const visiting = new Set<string>()

  function deriveGeneration(id: string): number {
    if (gen.has(id)) return gen.get(id)!
    if (visiting.has(id)) return 0

    visiting.add(id)
    const parents = parentsOf.get(id) ?? []
    const value =
      parents.length === 0
        ? 0
        : Math.max(...parents.map(parentId => deriveGeneration(parentId) + 1))
    visiting.delete(id)
    gen.set(id, value)
    return value
  }

  for (const p of persons) deriveGeneration(p.id)

  const hasKnownParents = (id: string) => (parentsOf.get(id)?.length ?? 0) > 0
  const likelySameGenerationSpouses = (a: string, b: string) => {
    const ay = ownYear(a)
    const by = ownYear(b)
    return ay === 9999 || by === 9999 || Math.abs(ay - by) <= 35
  }

  for (const { p1, p2 } of inferredCouples.values()) {
    if (!likelySameGenerationSpouses(p1, p2)) continue

    const g1 = gen.get(p1) ?? 0
    const g2 = gen.get(p2) ?? 0

    if (!hasKnownParents(p1) && hasKnownParents(p2)) {
      gen.set(p1, g2)
    } else if (!hasKnownParents(p2) && hasKnownParents(p1)) {
      gen.set(p2, g1)
    }
  }

  const byGen = new Map<number, string[]>()
  for (const [id, g] of gen.entries()) {
    if (!byGen.has(g)) byGen.set(g, [])
    byGen.get(g)!.push(id)
  }
  const maxGen = Math.max(...gen.values())
  const xPos = new Map<string, number>()

  type GenUnit = { members: string[]; sortKey: number }

  function buildGenerationUnits(ids: string[]): GenUnit[] {
    const inGen = new Set(ids)
    const seen = new Set<string>()
    const units: GenUnit[] = []

    const sortedIds = [...ids].sort((a, b) => {
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

      component.sort((a, b) => ownYear(a) - ownYear(b))
      units.push({
        members: component,
        sortKey: Math.min(...component.map(member => Math.min(minParentYear(member), ownYear(member)))),
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

  const orderedByGen = new Map<number, string[]>()

  for (let g = maxGen; g >= 0; g--) {
    const ids = byGen.get(g) ?? []
    const units = buildGenerationUnits(ids)
    const fallbackCenters = new Map<GenUnit, number>()
    const orderedByFallback = [...units].sort((a, b) => a.sortKey - b.sortKey)

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
    const ordered: string[] = []

    for (const unit of units) {
      const offsets = memberOffsets(unit.members)
      const desiredCenter = desiredCenterForUnit(unit.members) ?? fallbackCenters.get(unit) ?? 0
      const desiredLeftmost = desiredCenter + offsets[0]

      let center = desiredCenter
      if (previousRightmost !== null) {
        const minLeftmost = previousRightmost + H_GAP
        if (desiredLeftmost < minLeftmost) {
          center += minLeftmost - desiredLeftmost
        }
      }

      for (let i = 0; i < unit.members.length; i++) {
        xPos.set(unit.members[i], center + offsets[i])
        ordered.push(unit.members[i])
      }

      previousRightmost = center + offsets[offsets.length - 1]
    }

    orderedByGen.set(g, ordered)
  }

  const nodes: LayoutNode[] = persons.map(p => ({
    ...p,
    x:          xPos.get(p.id) ?? 0,
    y:          (gen.get(p.id) ?? 0) * GEN_H,
    generation: gen.get(p.id) ?? 0,
  }))

  const allX    = nodes.map(n => n.x)
  const centerX = (Math.min(...allX) + Math.max(...allX)) / 2
  for (const n of nodes) n.x -= centerX

  const familyUnits: FamilyUnit[] = []
  const processedUnits = new Set<string>()

  for (const [key, { p1, p2 }] of inferredCouples.entries()) {
    if (processedUnits.has(key)) continue
    processedUnits.add(key)

    const kids = new Set<string>()
    for (const p of persons) {
      const fid = p.fatherId && personSet.has(p.fatherId) ? p.fatherId : null
      const mid = p.motherId && personSet.has(p.motherId) ? p.motherId : null
      if (
        (fid === p1 && mid === p2) ||
        (fid === p2 && mid === p1)
      ) {
        kids.add(p.id)
      }
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
      if (existing) {
        existing.childIds.push(p.id)
      } else {
        familyUnits.push({ id: key, parent1Id: fid, parent2Id: null, childIds: [p.id] })
      }
    } else if (!fid && mid) {
      const key = 'solo-' + mid
      const existing = familyUnits.find(u => u.id === key)
      if (existing) {
        existing.childIds.push(p.id)
      } else {
        familyUnits.push({ id: key, parent1Id: mid, parent2Id: null, childIds: [p.id] })
      }
    }
  }

  const xs = nodes.map(n => n.x)
  const ys = nodes.map(n => n.y)

  return {
    nodes,
    familyUnits,
    bounds: {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs) + NODE_W,
      maxY: Math.max(...ys) + NODE_H,
    },
  }
}
