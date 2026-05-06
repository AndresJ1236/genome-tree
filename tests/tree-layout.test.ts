/**
 * Tests para src/lib/tree-layout.ts
 *
 * Estos tests existen para protegerse contra las regresiones que sufrimos
 * múltiples veces en el algoritmo del árbol — particularmente:
 *   - Pass 2 oscillation (paterno termina arriba/abajo según iteración)
 *   - Disconnected people offset infinito
 *   - Side-bounded layout no funciona si solo hay un parent
 *   - Inferred couples mal detectados por threshold de edad
 *
 * Si algún test rompe, NO MERGEES — la última vez que ignoramos esto el
 * usuario reportó "no veo a nadie" y tuvimos que revertir en producción.
 */
import { describe, it, expect } from 'vitest'
import { computeTreeLayout } from '@/lib/tree-layout'
import type { PersonData, RelationshipData } from '@/lib/tree-types'

// ── Helpers ──────────────────────────────────────────────────────────────

function person(over: Partial<PersonData> & { id: string }): PersonData {
  return {
    id:         over.id,
    firstName:  over.firstName  ?? `First-${over.id}`,
    middleName: over.middleName ?? null,
    lastName:   over.lastName   ?? `Last-${over.id}`,
    birthDate:  over.birthDate  ?? null,
    deathDate:  over.deathDate  ?? null,
    gender:     over.gender     ?? 'UNKNOWN',
    nodeKind:   over.nodeKind   ?? 'PERSON',
    coverPhoto: over.coverPhoto ?? null,
    fatherId:   over.fatherId   ?? null,
    motherId:   over.motherId   ?? null,
  }
}

const ymd = (s: string) => new Date(s).toISOString()

// ── Tests ────────────────────────────────────────────────────────────────

describe('computeTreeLayout', () => {
  it('returns empty layout for empty input', () => {
    const result = computeTreeLayout([], [])
    expect(result.nodes).toEqual([])
    expect(result.familyUnits).toEqual([])
    expect(result.bounds).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 })
  })

  it('places a single person at origin', () => {
    const persons = [person({ id: 'a' })]
    const result = computeTreeLayout(persons, [], { focusPersonId: 'a' })
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].id).toBe('a')
    // Después del centering, el focus debe estar en x=0
    expect(result.nodes[0].x).toBe(0)
  })

  it('REGRESSION: disconnected people do NOT push connected family off-screen', () => {
    // El bug del v2.0: gen = tempDepth - 1000 hacía que después de normalizar,
    // la gente conectada terminaba en gen ≈ 1000, y = 250.000 px (off-screen).
    // Ahora deben quedar en gen 0.
    const persons = [
      person({ id: 'me' }),
      person({ id: 'unrelated-1' }),
      person({ id: 'unrelated-2' }),
    ]
    const result = computeTreeLayout(persons, [], { focusPersonId: 'me' })
    // Todos los y deben ser razonables (< 10000 px)
    for (const node of result.nodes) {
      expect(Math.abs(node.y)).toBeLessThan(10000)
    }
  })

  it('places paternal family on the LEFT and maternal on the RIGHT', () => {
    //   gpa  gpm   ggpa  ggpm
    //     \  /        \  /
    //     dad         mom
    //       \         /
    //          me
    const persons = [
      person({ id: 'me',  fatherId: 'dad', motherId: 'mom' }),
      person({ id: 'dad', fatherId: 'gpa', motherId: 'gpm' }),
      person({ id: 'mom', fatherId: 'ggpa', motherId: 'ggpm' }),
      person({ id: 'gpa' }),
      person({ id: 'gpm' }),
      person({ id: 'ggpa' }),
      person({ id: 'ggpm' }),
    ]
    const result = computeTreeLayout(persons, [], { focusPersonId: 'me' })
    const byId = new Map(result.nodes.map(n => [n.id, n]))

    const dad = byId.get('dad')!
    const mom = byId.get('mom')!
    const gpa = byId.get('gpa')!
    const ggpa = byId.get('ggpa')!

    // Padre y abuelo paterno: x negativo
    expect(dad.x).toBeLessThan(0)
    expect(gpa.x).toBeLessThan(0)
    // Madre y abuelo materno: x positivo
    expect(mom.x).toBeGreaterThan(0)
    expect(ggpa.x).toBeGreaterThan(0)
  })

  it('REGRESSION: siblings of the focus parent share his/her generation', () => {
    // Los hermanos del padre deben estar en la misma fila (mismo gen) que él,
    // no una fila arriba ni abajo. Este es el bug que reportó Andrés con
    // Wilson Jácome y sus hermanos.
    //   gpa - gpm
    //   /  |   \
    //  uncle dad  aunt
    //         \
    //          me
    const persons = [
      person({ id: 'gpa' }),
      person({ id: 'gpm' }),
      person({ id: 'uncle', fatherId: 'gpa', motherId: 'gpm' }),
      person({ id: 'dad',   fatherId: 'gpa', motherId: 'gpm' }),
      person({ id: 'aunt',  fatherId: 'gpa', motherId: 'gpm' }),
      person({ id: 'me',    fatherId: 'dad' }),
    ]
    const result = computeTreeLayout(persons, [], { focusPersonId: 'me' })
    const byId = new Map(result.nodes.map(n => [n.id, n]))

    expect(byId.get('uncle')!.generation).toBe(byId.get('dad')!.generation)
    expect(byId.get('aunt')!.generation).toBe(byId.get('dad')!.generation)
  })

  it('detects implicit couple from shared child even without Relationship', () => {
    // Si dos personas comparten hijo, son pareja a efectos del layout.
    const persons = [
      person({ id: 'mom', birthDate: ymd('1960-01-01') }),
      person({ id: 'dad', birthDate: ymd('1958-01-01') }),
      person({ id: 'kid', fatherId: 'dad', motherId: 'mom' }),
    ]
    const result = computeTreeLayout(persons, [], { focusPersonId: 'kid' })

    // Debería haber un FamilyUnit con dad y mom como parents
    const unit = result.familyUnits.find(u =>
      (u.parent1Id === 'dad' && u.parent2Id === 'mom') ||
      (u.parent1Id === 'mom' && u.parent2Id === 'dad')
    )
    expect(unit).toBeDefined()
    expect(unit!.childIds).toContain('kid')
  })

  it('handles ex-couples (endDate set on Relationship) without crashing', () => {
    const persons = [
      person({ id: 'a' }),
      person({ id: 'b' }),
      person({ id: 'kid', fatherId: 'a', motherId: 'b' }),
    ]
    const rels: RelationshipData[] = [
      { person1Id: 'a', person2Id: 'b', type: 'SPOUSE', endDate: ymd('2010-01-01') },
    ]
    const result = computeTreeLayout(persons, rels, { focusPersonId: 'kid' })
    const unit = result.familyUnits.find(u => u.childIds.includes('kid'))
    expect(unit?.isExCouple).toBe(true)
  })

  it('explicit SIBLING relationship places siblings at same generation', () => {
    const persons = [
      person({ id: 'me' }),
      person({ id: 'sib1' }),
      person({ id: 'sib2' }),
    ]
    const rels: RelationshipData[] = [
      { person1Id: 'me', person2Id: 'sib1', type: 'SIBLING', endDate: null },
      { person1Id: 'me', person2Id: 'sib2', type: 'SIBLING', endDate: null },
    ]
    const result = computeTreeLayout(persons, rels, { focusPersonId: 'me' })
    const byId = new Map(result.nodes.map(n => [n.id, n]))
    expect(byId.get('sib1')!.generation).toBe(byId.get('me')!.generation)
    expect(byId.get('sib2')!.generation).toBe(byId.get('me')!.generation)
  })

  it('emits siblingLinks ONLY for siblings without registered shared parents', () => {
    // sib1 y sib2 con parents → no link (ya conectados)
    // sib3 sin parents pero con SIBLING explícito → SÍ link
    const persons = [
      person({ id: 'sib1', fatherId: 'dad', motherId: 'mom' }),
      person({ id: 'sib2', fatherId: 'dad', motherId: 'mom' }),
      person({ id: 'sib3' }),
      person({ id: 'dad' }),
      person({ id: 'mom' }),
    ]
    const rels: RelationshipData[] = [
      { person1Id: 'sib1', person2Id: 'sib3', type: 'SIBLING', endDate: null },
    ]
    const result = computeTreeLayout(persons, rels, { focusPersonId: 'sib1' })
    // Debería haber EXACTAMENTE 1 link (sib1-sib3) y NO sib1-sib2
    expect(result.siblingLinks).toHaveLength(1)
    expect(result.siblingLinks[0].person1Id === 'sib1' || result.siblingLinks[0].person2Id === 'sib1').toBe(true)
    expect(result.siblingLinks[0].person1Id === 'sib3' || result.siblingLinks[0].person2Id === 'sib3').toBe(true)
  })

  it('pets are excluded from the generation grid', () => {
    const persons = [
      person({ id: 'me' }),
      person({ id: 'rex', nodeKind: 'PET', fatherId: 'me' }),
    ]
    const result = computeTreeLayout(persons, [], { focusPersonId: 'me' })
    // El nodo del pet existe pero NO debe afectar maxGen del árbol humano
    const me = result.nodes.find(n => n.id === 'me')!
    const rex = result.nodes.find(n => n.id === 'rex')!
    expect(me).toBeDefined()
    expect(rex).toBeDefined()
    // PetLink debe existir
    expect(result.petLinks.find(l => l.petId === 'rex' && l.ownerId === 'me')).toBeDefined()
  })
})
