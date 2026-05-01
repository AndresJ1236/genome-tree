import assert from 'node:assert/strict'
import { getManagedUnitPersonIdsFromPeople } from '@/lib/visibility-graph'

const people = [
  { id: 'parent-a', fatherId: null, motherId: null },
  { id: 'parent-b', fatherId: null, motherId: null },
  { id: 'shared-child-1', fatherId: 'parent-a', motherId: 'parent-b' },
  { id: 'shared-child-2', fatherId: 'parent-a', motherId: 'parent-b' },
  { id: 'shared-grandchild', fatherId: 'shared-child-1', motherId: null },
  { id: 'other-partner', fatherId: null, motherId: null },
  { id: 'other-child', fatherId: 'parent-a', motherId: 'other-partner' },
  { id: 'other-grandchild', fatherId: 'other-child', motherId: null },
] as const

const ids = getManagedUnitPersonIdsFromPeople(people, 'parent-a', 'parent-b')

assert.equal(ids.has('parent-a'), true, 'debe incluir parentA')
assert.equal(ids.has('parent-b'), true, 'debe incluir parentB')
assert.equal(ids.has('shared-child-1'), true, 'debe incluir el primer hijo compartido')
assert.equal(ids.has('shared-child-2'), true, 'debe incluir el segundo hijo compartido')
assert.equal(ids.has('shared-grandchild'), true, 'debe incluir descendencia de hijos compartidos')
assert.equal(ids.has('other-child'), false, 'no debe incluir hijos de otra union')
assert.equal(ids.has('other-grandchild'), false, 'no debe incluir descendientes de otra union')

console.log('managed-family-unit ok')
