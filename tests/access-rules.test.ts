import assert from 'node:assert/strict'
import { applyAccessRulesToVisibleIds, hasExplicitAccessRule, resolveRuleDecision } from '@/lib/access-rules'

const base = new Set(['root', 'child'])
const rules = [
  { targetPersonId: 'outsider', effect: 'ALLOW', permission: 'VIEW_PERSON' },
  { targetPersonId: 'child', effect: 'DENY', permission: 'VIEW_PERSON' },
  { targetPersonId: 'root', effect: 'ALLOW', permission: 'EDIT_PERSON' },
] as const

const visible = applyAccessRulesToVisibleIds(base, rules, 'VIEW_PERSON')

assert.equal(visible.has('outsider'), true, 'ALLOW debe sumar personas visibles fuera del conjunto base')
assert.equal(visible.has('child'), false, 'DENY debe remover personas incluso si ya eran visibles')
assert.equal(
  hasExplicitAccessRule(rules, 'EDIT_PERSON', 'ALLOW', 'root'),
  true,
  'debe detectar reglas explicitas por permiso y efecto'
)
assert.equal(
  hasExplicitAccessRule(rules, 'EDIT_PERSON', 'DENY', 'root'),
  false,
  'no debe inventar reglas inexistentes'
)

assert.equal(
  resolveRuleDecision(rules, 'VIEW_CONTENT', 'root', true),
  true,
  'sin regla explicita, VIEW_CONTENT debe conservar su fallback permitido'
)

assert.equal(
  resolveRuleDecision(
    [
      { targetPersonId: 'root', effect: 'DENY', permission: 'VIEW_MEDIA' },
      { targetPersonId: 'root', effect: 'ALLOW', permission: 'VIEW_PRIVATE' },
    ],
    'VIEW_MEDIA',
    'root',
    true
  ),
  false,
  'VIEW_MEDIA debe respetar DENY explicito'
)

assert.equal(
  resolveRuleDecision(
    [
      { targetPersonId: 'root', effect: 'ALLOW', permission: 'VIEW_PRIVATE' },
    ],
    'VIEW_PRIVATE',
    'root',
    false
  ),
  true,
  'VIEW_PRIVATE debe poder elevar acceso con ALLOW explicito'
)

console.log('access-rules ok')
