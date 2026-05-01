import assert from 'node:assert/strict'
import { buildSearchSnippet, normalizeSearchQuery, splitSearchTerms } from '../src/lib/search-utils'

assert.equal(normalizeSearchQuery('  María   López  '), 'maría lópez')
assert.deepEqual(splitSearchTerms('  Carlos   Martinez  '), ['carlos', 'martinez'])

const snippet = buildSearchSnippet(
  'Carlos aprendio carpinteria junto a su padre en un pequeno taller familiar.',
  'carpinteria'
)

assert.equal(snippet !== null, true)
assert.equal((snippet ?? '').includes('carpinteria'), true)
assert.equal((snippet ?? '').length <= 120, true)

console.log('search-utils ok')
