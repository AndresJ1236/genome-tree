export interface ManagedScopeAuditLogRecord {
  entityType: string
  entityId: string
  oldValue?: unknown
  newValue?: unknown
}

function getCandidatePersonIds(value: unknown) {
  if (!value || typeof value !== 'object') return []

  const record = value as Record<string, unknown>
  return [record.personId, record.targetPersonId, record.relatedPersonId].filter(
    (candidate): candidate is string => typeof candidate === 'string'
  )
}

export function auditLogTouchesManagedScope(
  log: ManagedScopeAuditLogRecord,
  managedPersonIds: ReadonlySet<string>,
  managedUnitIds: ReadonlySet<string>
) {
  if (log.entityType === 'Person') return managedPersonIds.has(log.entityId)
  if (log.entityType === 'ManagedFamilyUnit') return managedUnitIds.has(log.entityId)

  return [...getCandidatePersonIds(log.oldValue), ...getCandidatePersonIds(log.newValue)].some(id =>
    managedPersonIds.has(id)
  )
}
