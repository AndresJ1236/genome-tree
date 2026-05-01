import assert from 'node:assert/strict'
import {
  buildRelationsExportPayload,
  parseRelationsJsonPayload,
  planRelationsImport,
} from '@/lib/relations-json'

const people = [
  {
    id: 'parent',
    firstName: 'Carlos',
    middleName: null,
    lastName: 'Martinez',
    birthSurname1: 'Martinez',
    birthSurname2: 'Rojas',
    fatherId: null,
    motherId: null,
  },
  {
    id: 'child',
    firstName: 'Luis',
    middleName: null,
    lastName: 'Martinez',
    birthSurname1: 'Martinez',
    birthSurname2: 'Lopez',
    fatherId: 'parent',
    motherId: 'hidden-mother',
  },
]

const visiblePayload = buildRelationsExportPayload('familia-demo', people, new Set(['parent', 'child']))
assert.equal(visiblePayload.people.length, 2)
assert.equal(visiblePayload.people.find(person => person.id === 'child')?.fatherId, 'parent')
assert.equal(visiblePayload.people.find(person => person.id === 'child')?.motherId, null)

const parsed = parseRelationsJsonPayload(JSON.stringify(visiblePayload))
assert.equal(parsed.familySlug, 'familia-demo')
assert.equal(parsed.people[1]?.id, 'child')

const plan = planRelationsImport(parsed, new Set(['parent', 'child']))
assert.equal(plan.duplicateIds.length, 0)
assert.equal(plan.missingPersonIds.length, 0)
assert.equal(plan.missingReferenceIds.length, 0)
assert.equal(plan.selfReferenceIds.length, 0)

const badPlan = planRelationsImport({
  familySlug: 'familia-demo',
  exportedAt: new Date().toISOString(),
  people: [
    {
      id: 'child',
      firstName: 'Luis',
      middleName: null,
      lastName: 'Martinez',
      birthSurname1: 'Martinez',
      birthSurname2: 'Lopez',
      fatherId: 'missing-parent',
      motherId: 'child',
    },
    {
      id: 'child',
      firstName: 'Luis',
      middleName: null,
      lastName: 'Martinez',
      birthSurname1: 'Martinez',
      birthSurname2: 'Lopez',
      fatherId: null,
      motherId: null,
    },
  ],
}, new Set(['child']))

assert.deepEqual(badPlan.duplicateIds, ['child'])
assert.deepEqual(badPlan.missingReferenceIds, ['missing-parent'])
assert.deepEqual(badPlan.selfReferenceIds, ['child'])

console.log('relations-json ok')
