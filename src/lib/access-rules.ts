import type { AccessEffect, AccessPermission } from '@/lib/content-types'

export interface AccessRuleRecord {
  targetPersonId: string
  effect: AccessEffect
  permission: AccessPermission
}

export function applyAccessRulesToVisibleIds(
  visibleIds: ReadonlySet<string>,
  rules: readonly AccessRuleRecord[],
  permission: AccessPermission
) {
  const next = new Set(visibleIds)
  const relevant = rules.filter(rule => rule.permission === permission)

  for (const rule of relevant) {
    if (rule.effect === 'ALLOW') {
      next.add(rule.targetPersonId)
    }
  }

  for (const rule of relevant) {
    if (rule.effect === 'DENY') {
      next.delete(rule.targetPersonId)
    }
  }

  return next
}

export function hasExplicitAccessRule(
  rules: readonly AccessRuleRecord[],
  permission: AccessPermission,
  effect: AccessEffect,
  targetPersonId: string
) {
  return rules.some(
    rule =>
      rule.permission === permission &&
      rule.effect === effect &&
      rule.targetPersonId === targetPersonId
  )
}

export function resolveRuleDecision(
  rules: readonly AccessRuleRecord[],
  permission: AccessPermission,
  targetPersonId: string,
  fallback: boolean
) {
  if (hasExplicitAccessRule(rules, permission, 'DENY', targetPersonId)) return false
  if (hasExplicitAccessRule(rules, permission, 'ALLOW', targetPersonId)) return true
  return fallback
}
