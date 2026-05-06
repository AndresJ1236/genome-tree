import { describe, it, expect } from 'vitest'
import { calculateKinship, type PersonNode, type CoupleEdge } from '@/lib/kinship'

function p(id: string, over: Partial<PersonNode> = {}): PersonNode {
  return {
    id,
    fatherId:  over.fatherId  ?? null,
    motherId:  over.motherId  ?? null,
    gender:    over.gender    ?? 'UNKNOWN',
    firstName: over.firstName ?? id,
    lastName:  over.lastName  ?? '',
  }
}

describe('calculateKinship', () => {
  it('returns "self" when fromId === toId', () => {
    const r = calculateKinship('a', 'a', [p('a')])
    expect(r.category).toBe('self')
  })

  it('detects parent (1, 0) — male', () => {
    const people = [p('me', { fatherId: 'dad' }), p('dad', { gender: 'MALE' })]
    const r = calculateKinship('me', 'dad', people)
    expect(r.category).toBe('parent')
    expect(r.label).toBe('tu papá')
  })

  it('detects parent (1, 0) — female', () => {
    const people = [p('me', { motherId: 'mom' }), p('mom', { gender: 'FEMALE' })]
    const r = calculateKinship('me', 'mom', people)
    expect(r.label).toBe('tu mamá')
  })

  it('detects child (0, 1)', () => {
    const people = [p('me'), p('kid', { fatherId: 'me', gender: 'MALE' })]
    const r = calculateKinship('me', 'kid', people)
    expect(r.category).toBe('child')
    expect(r.label).toBe('tu hijo')
  })

  it('detects grandparent (2, 0)', () => {
    const people = [
      p('me', { fatherId: 'dad' }),
      p('dad', { fatherId: 'gp' }),
      p('gp', { gender: 'MALE' }),
    ]
    const r = calculateKinship('me', 'gp', people)
    expect(r.category).toBe('grandparent')
    expect(r.label).toBe('tu abuelo')
  })

  it('detects sibling (1, 1)', () => {
    const people = [
      p('me', { fatherId: 'dad' }),
      p('sib', { fatherId: 'dad', gender: 'FEMALE' }),
      p('dad'),
    ]
    const r = calculateKinship('me', 'sib', people)
    expect(r.category).toBe('sibling')
    expect(r.label).toBe('tu hermana')
  })

  it('detects uncle/aunt (2, 1)', () => {
    const people = [
      p('me', { fatherId: 'dad' }),
      p('dad', { fatherId: 'gp' }),
      p('uncle', { fatherId: 'gp', gender: 'MALE' }),
      p('gp'),
    ]
    const r = calculateKinship('me', 'uncle', people)
    expect(r.category).toBe('aunt-uncle')
    expect(r.label).toBe('tu tío')
  })

  it('detects niece/nephew (1, 2)', () => {
    const people = [
      p('me', { fatherId: 'gp' }),
      p('sib', { fatherId: 'gp' }),
      p('niece', { fatherId: 'sib', gender: 'FEMALE' }),
      p('gp'),
    ]
    const r = calculateKinship('me', 'niece', people)
    expect(r.category).toBe('niece-nephew')
    expect(r.label).toBe('tu sobrina')
  })

  it('detects 1st cousin (2, 2)', () => {
    const people = [
      p('me', { fatherId: 'dad' }),
      p('cousin', { fatherId: 'uncle' }),
      p('dad', { fatherId: 'gp' }),
      p('uncle', { fatherId: 'gp' }),
      p('gp'),
    ]
    const r = calculateKinship('me', 'cousin', people)
    expect(r.category).toBe('cousin')
    expect(r.label).toContain('primer primo')
  })

  it('detects spouse via Relationship', () => {
    const people = [p('me'), p('partner', { gender: 'FEMALE' })]
    const couples: CoupleEdge[] = [{ p1: 'me', p2: 'partner' }]
    const r = calculateKinship('me', 'partner', people, couples)
    expect(r.category).toBe('spouse')
    expect(r.label).toBe('tu esposa')
  })

  it('detects in-law: parent of partner', () => {
    const people = [
      p('me'),
      p('partner', { fatherId: 'fil' }),
      p('fil', { gender: 'MALE' }),
    ]
    const couples: CoupleEdge[] = [{ p1: 'me', p2: 'partner' }]
    const r = calculateKinship('me', 'fil', people, couples)
    expect(r.category).toBe('in-law')
    expect(r.label).toBe('tu suegro')
  })

  it('returns unrelated when no path exists', () => {
    const people = [p('me'), p('stranger')]
    const r = calculateKinship('me', 'stranger', people)
    expect(r.category).toBe('unrelated')
  })

  it('does not crash with cyclic data (defensive)', () => {
    // Datos malformados — no debería lanzar excepción
    const people = [
      p('a', { fatherId: 'b' }),
      p('b', { fatherId: 'a' }),
    ]
    // No queremos que estalle aunque los datos sean inválidos
    const r = calculateKinship('a', 'b', people)
    expect(r).toBeDefined()
  })
})
