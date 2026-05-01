import assert from 'node:assert/strict'
import { auditLogTouchesManagedScope } from '@/lib/managed-audit'

const managedPeople = new Set(['p-child', 'p-grandchild'])
const managedUnits = new Set(['unit-1'])

assert.equal(
  auditLogTouchesManagedScope(
    { entityType: 'Person', entityId: 'p-child' },
    managedPeople,
    managedUnits
  ),
  true,
  'debe incluir auditoria directa sobre personas administradas'
)

assert.equal(
  auditLogTouchesManagedScope(
    { entityType: 'ManagedFamilyUnit', entityId: 'unit-1' },
    managedPeople,
    managedUnits
  ),
  true,
  'debe incluir auditoria directa sobre la unidad administrada'
)

assert.equal(
  auditLogTouchesManagedScope(
    {
      entityType: 'Content',
      entityId: 'content-1',
      newValue: { personId: 'p-grandchild' },
    },
    managedPeople,
    managedUnits
  ),
  true,
  'debe incluir contenido vinculado a personas dentro de la unidad'
)

assert.equal(
  auditLogTouchesManagedScope(
    {
      entityType: 'Content',
      entityId: 'content-2',
      newValue: { personId: 'outside-person' },
    },
    managedPeople,
    managedUnits
  ),
  false,
  'no debe incluir contenido ajeno a la unidad'
)

console.log('managed-audit ok')
