import assert from 'node:assert/strict'
import {
  computeVisiblePersonIdsFromPeople,
  getManagedUnitPersonIdsFromPeople,
  isPersonManagedByUnitsFromPeople,
} from '@/lib/visibility-graph'

const people = [
  { id: 'root', fatherId: 'parent', motherId: null },
  { id: 'partner', fatherId: null, motherId: null },
  { id: 'child', fatherId: 'root', motherId: 'partner' },
  { id: 'grandchild', fatherId: 'child', motherId: null },
  { id: 'parent', fatherId: 'grandparent', motherId: null },
  { id: 'sibling', fatherId: 'parent', motherId: null },
  { id: 'uncle', fatherId: 'grandparent', motherId: null },
  { id: 'grandparent', fatherId: null, motherId: null },
  { id: 'partner-parent', fatherId: null, motherId: null },
  { id: 'partner-sibling', fatherId: 'partner-parent', motherId: null },
] as const

const visible = computeVisiblePersonIdsFromPeople(people, 'root')

assert.equal(visible.has('child'), true, 'debe incluir hijos')
assert.equal(visible.has('grandchild'), true, 'debe incluir descendencia completa')
assert.equal(visible.has('parent'), true, 'debe incluir padres por contexto de sangre')
assert.equal(visible.has('sibling'), true, 'debe incluir hermanos por contexto de sangre')
assert.equal(visible.has('grandparent'), true, 'debe incluir abuelos por contexto de sangre')
assert.equal(visible.has('uncle'), true, 'debe incluir tios dentro de distancia 3')
assert.equal(visible.has('partner'), true, 'debe incluir pareja directa como contexto')
assert.equal(visible.has('partner-parent'), false, 'no debe expandir hacia la familia politica de la pareja')
assert.equal(visible.has('partner-sibling'), false, 'no debe incluir hermanos de la pareja')

const managedPeople = [
  { id: 'parent-a', fatherId: null, motherId: null },
  { id: 'parent-b', fatherId: null, motherId: null },
  { id: 'shared-child', fatherId: 'parent-a', motherId: 'parent-b' },
  { id: 'shared-grandchild', fatherId: 'shared-child', motherId: null },
  { id: 'other-partner', fatherId: null, motherId: null },
  { id: 'other-child', fatherId: 'parent-a', motherId: 'other-partner' },
] as const

const managedIds = getManagedUnitPersonIdsFromPeople(managedPeople, 'parent-a', 'parent-b')

assert.equal(managedIds.has('parent-a'), true, 'la unidad debe incluir parentA')
assert.equal(managedIds.has('parent-b'), true, 'la unidad debe incluir parentB')
assert.equal(managedIds.has('shared-child'), true, 'la unidad debe incluir hijos compartidos')
assert.equal(managedIds.has('shared-grandchild'), true, 'la unidad debe incluir descendencia de hijos compartidos')
assert.equal(managedIds.has('other-child'), false, 'la unidad no debe incluir hijos de otra union')
assert.equal(managedIds.has('other-partner'), false, 'la unidad no debe incluir la pareja externa')
assert.equal(
  isPersonManagedByUnitsFromPeople(
    managedPeople,
    [{ parentAId: 'parent-a', parentBId: 'parent-b' }],
    'shared-grandchild'
  ),
  true,
  'la unidad debe marcar como gestionable a un descendiente compartido'
)
assert.equal(
  isPersonManagedByUnitsFromPeople(
    managedPeople,
    [{ parentAId: 'parent-a', parentBId: 'parent-b' }],
    'other-child'
  ),
  false,
  'la unidad no debe marcar como gestionable a un hijo de otra union'
)

console.log('person-visibility-root ok')
