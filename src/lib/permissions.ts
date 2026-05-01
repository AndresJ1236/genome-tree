import 'server-only'
import { prisma } from '@/lib/prisma'
import type { SessionPayload } from '@/lib/session'
import type { AccessPermission, ContentVisibility } from '@/lib/content-types'
import {
  applyAccessRulesToVisibleIds,
  hasExplicitAccessRule,
  resolveRuleDecision,
  type AccessRuleRecord,
} from '@/lib/access-rules'
import {
  computeVisiblePersonIdsFromPeople,
  getManagedUnitPersonIdsFromPeople,
  isPersonManagedByUnitsFromPeople,
} from '@/lib/visibility-graph'

type ManagedCapability = 'people' | 'content'

interface ManagedUnitRecord {
  id: string
  parentAId: string
  parentBId: string | null
  canEditPeople: boolean
  canManageContent: boolean
}

async function getAccessRulesForUser(session: SessionPayload): Promise<AccessRuleRecord[]> {
  return prisma.accessRule.findMany({
    where: {
      familyId: session.familyId,
      OR: [
        { userId: session.userId },
        { userId: null },
      ],
    },
    select: {
      targetPersonId: true,
      effect: true,
      permission: true,
    },
  })
}

async function hasRule(
  session: SessionPayload,
  permission: AccessPermission,
  effect: 'ALLOW' | 'DENY',
  personId: string
) {
  const rules = await getAccessRulesForUser(session)
  return hasExplicitAccessRule(rules, permission, effect, personId)
}

export async function canViewPrivatePersonData(
  session: SessionPayload,
  personId: string
): Promise<boolean> {
  if (session.role === 'ADMIN' || session.scope === 'ADMIN') return true
  const rules = await getAccessRulesForUser(session)
  return resolveRuleDecision(rules, 'VIEW_PRIVATE', personId, false)
}

export async function canViewPersonContent(
  session: SessionPayload,
  personId: string
): Promise<boolean> {
  if (session.role === 'ADMIN' || session.scope === 'ADMIN') return true
  const rules = await getAccessRulesForUser(session)
  return resolveRuleDecision(rules, 'VIEW_CONTENT', personId, true)
}

export async function canViewPersonMedia(
  session: SessionPayload,
  personId: string
): Promise<boolean> {
  if (session.role === 'ADMIN' || session.scope === 'ADMIN') return true
  const rules = await getAccessRulesForUser(session)
  return resolveRuleDecision(rules, 'VIEW_MEDIA', personId, true)
}

export async function getContentVisibilityFilterForPerson(
  session: SessionPayload,
  personId: string
): Promise<ContentVisibility[]> {
  if (session.role === 'ADMIN' || session.scope === 'ADMIN') {
    return ['BRANCH', 'FAMILY', 'ADMIN']
  }

  if (!(await canViewPersonContent(session, personId))) {
    return []
  }

  const allowPrivate = await canViewPrivatePersonData(session, personId)
  const allowContent = await hasRule(session, 'VIEW_CONTENT', 'ALLOW', personId)
  const visibility = new Set(getVisibilityFilter(session))

  if (allowContent) visibility.add('FAMILY')
  if (allowPrivate) visibility.add('ADMIN')

  return [...visibility]
}

export function getVisibilityFilter(session: SessionPayload): ContentVisibility[] {
  switch (session.scope) {
    case 'ADMIN':
      return ['BRANCH', 'FAMILY', 'ADMIN']
    case 'FAMILY':
      return ['BRANCH', 'FAMILY']
    case 'BRANCH':
      return ['BRANCH']
  }
}

async function getAllFamilyPeople(familyId: string) {
  return prisma.person.findMany({
    where: { familyId },
    select: { id: true, fatherId: true, motherId: true },
  })
}

async function getAllFamilyPeopleWithAffiliation(familyId: string) {
  return prisma.person.findMany({
    where: { familyId },
    select: { id: true, fatherId: true, motherId: true, unitAffiliationId: true },
  })
}

async function getManagedUnitsForUser(
  session: SessionPayload,
  capability?: ManagedCapability
): Promise<ManagedUnitRecord[]> {
  const units = await prisma.managedFamilyUnit.findMany({
    where: {
      familyId: session.familyId,
      representativeUserId: session.userId,
    },
    select: {
      id: true,
      parentAId: true,
      parentBId: true,
      canEditPeople: true,
      canManageContent: true,
    },
  })

  if (!capability) return units
  if (capability === 'people') return units.filter(unit => unit.canEditPeople)
  return units.filter(unit => unit.canManageContent)
}

export async function userManagesPerson(
  session: SessionPayload,
  personId: string,
  capability: ManagedCapability = 'people'
): Promise<boolean> {
  if (session.role === 'ADMIN' || session.scope === 'ADMIN') return true
  if (await hasRule(session, 'EDIT_PERSON', 'DENY', personId)) return false
  if (await hasRule(session, 'EDIT_PERSON', 'ALLOW', personId)) return true
  if (session.personId === personId) return true

  const units = await getManagedUnitsForUser(session, capability)
  if (units.length === 0) return false

  const people = await getAllFamilyPeople(session.familyId)
  return isPersonManagedByUnitsFromPeople(people, units, personId)
}

export async function getVisiblePersonIds(
  session: SessionPayload
): Promise<Set<string> | null> {
  if (session.role === 'ADMIN' || session.scope === 'ADMIN') return null

  const rootPersonId = session.personId ?? session.branchRootId
  const managedUnits = await getManagedUnitsForUser(session)

  if (!rootPersonId && managedUnits.length === 0) {
    return session.scope === 'FAMILY' ? null : new Set()
  }

  const allPersons = await getAllFamilyPeople(session.familyId)

  const visible = rootPersonId
    ? computeVisiblePersonIdsFromPeople(allPersons, rootPersonId)
    : new Set<string>()

  for (const unit of managedUnits) {
    const managedIds = getManagedUnitPersonIdsFromPeople(allPersons, unit.parentAId, unit.parentBId)
    for (const id of managedIds) visible.add(id)
  }

  const accessRules = await getAccessRulesForUser(session)
  return applyAccessRulesToVisibleIds(visible, accessRules, 'VIEW_PERSON')
}

export async function assertPersonAccess(
  personId: string,
  session: SessionPayload
): Promise<void> {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { familyId: true },
  })

  if (!person || person.familyId !== session.familyId) {
    throw new Error('Persona no encontrada')
  }

  if (session.role !== 'ADMIN' && session.scope !== 'ADMIN') {
    if (await hasRule(session, 'VIEW_PERSON', 'DENY', personId)) {
      throw new Error('No tienes acceso a esta persona')
    }
    const visibleIds = await getVisiblePersonIds(session)
    if (visibleIds && !visibleIds.has(personId)) {
      throw new Error('No tienes acceso a esta persona')
    }
  }
}

export async function assertCanManagePerson(
  personId: string,
  session: SessionPayload,
  capability: ManagedCapability = 'people'
): Promise<void> {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { familyId: true, isCore: true },
  })

  if (!person || person.familyId !== session.familyId) {
    throw new Error('Persona no encontrada')
  }

  if (capability === 'people' && person.isCore && session.role !== 'ADMIN') {
    throw new Error('Esta parte esta protegida para conservar la informacion familiar. Si necesitas corregir algo, contacta al administrador.')
  }

  const canManage = await userManagesPerson(session, personId, capability)
  if (!canManage) {
    throw new Error(
      capability === 'content'
        ? 'No tienes permiso para gestionar contenido de esta persona.'
        : 'No tienes permiso para editar esta persona.'
    )
  }
}

export function assertCanEdit(
  content: { createdById: string; lockedAt: Date },
  session: SessionPayload
): void {
  const isAdmin = session.role === 'ADMIN'
  const isCreator = content.createdById === session.userId
  const isLocked = content.lockedAt < new Date()

  if (isLocked && !isAdmin) {
    throw new Error('Este contenido ya esta bloqueado. Solo un administrador puede modificarlo.')
  }

  if (!isAdmin && !isCreator) {
    throw new Error('No tienes permiso para editar este contenido.')
  }
}

export async function assertCanEditOwnedContentForPerson(
  content: { createdById: string; lockedAt: Date },
  personId: string,
  session: SessionPayload
): Promise<void> {
  const isAdmin = session.role === 'ADMIN'
  if (isAdmin) return

  const managesPerson = await userManagesPerson(session, personId, 'content')
  if (managesPerson) return

  assertCanEdit(content, session)
}

export async function assertCanEditPerson(
  personId: string,
  session: SessionPayload
): Promise<void> {
  await assertCanManagePerson(personId, session, 'people')
}

export function computeLockedAt(): Date {
  const d = new Date()
  d.setDate(d.getDate() + 10)
  return d
}

// Puede modificar fatherId/motherId de una persona.
// Representante: sí, salvo que la persona sea parentA o parentB de su propia unidad.
export async function canChangeRelationships(
  session: SessionPayload,
  personId: string
): Promise<boolean> {
  if (session.role === 'ADMIN' || session.scope === 'ADMIN') return true

  const units = await getManagedUnitsForUser(session, 'people')
  if (units.length === 0) return false

  // Los parentA/parentB de las unidades del representante no los puede tocar
  const isUnitRoot = units.some(u => u.parentAId === personId || u.parentBId === personId)
  if (isUnitRoot) return false

  const people = await getAllFamilyPeopleWithAffiliation(session.familyId)

  // Persona dentro de la unidad por estructura del árbol
  if (isPersonManagedByUnitsFromPeople(people, units, personId)) return true

  // Persona flotante afiliada explícitamente a una de las unidades del representante
  const unitIds = new Set(units.map(u => u.id))
  const person = people.find(p => p.id === personId)
  return !!(person?.unitAffiliationId && unitIds.has(person.unitAffiliationId))
}

export async function assertCanChangeRelationships(
  personId: string,
  session: SessionPayload
): Promise<void> {
  if (session.role === 'ADMIN' || session.scope === 'ADMIN') return

  const units = await getManagedUnitsForUser(session, 'people')
  const isUnitRoot = units.some(u => u.parentAId === personId || u.parentBId === personId)
  if (isUnitRoot) {
    throw new Error(
      'Las relaciones de los padres raíz de tu unidad solo puede modificarlas el administrador.'
    )
  }

  const allowed = await canChangeRelationships(session, personId)
  if (!allowed) {
    throw new Error('No tienes permiso para modificar relaciones familiares de esta persona.')
  }
}

// Determina si el usuario debe crear una propuesta en vez de guardar directamente.
// ADMIN y representantes que gestionan la persona guardan directo.
// MEMBER sin esa capacidad propone.
export async function shouldProposeInsteadOfSave(
  session: SessionPayload,
  personId: string
): Promise<boolean> {
  if (session.role === 'ADMIN' || session.scope === 'ADMIN') return false
  const manages = await userManagesPerson(session, personId, 'people')
  return !manages
}

// Puede crear personas nuevas directamente (sin propuesta).
export async function canCreatePerson(session: SessionPayload): Promise<boolean> {
  if (session.role === 'ADMIN' || session.scope === 'ADMIN') return true
  const units = await getManagedUnitsForUser(session, 'people')
  return units.length > 0
}

// Devuelve el conjunto de IDs de personas que el representante gestiona directamente.
// null = admin, ve todo. Set vacío = no gestiona nada.
export async function getManagedPersonIdSet(
  session: SessionPayload
): Promise<Set<string> | null> {
  if (session.role === 'ADMIN' || session.scope === 'ADMIN') return null

  const units = await getManagedUnitsForUser(session, 'people')
  if (units.length === 0) return new Set()

  const people = await getAllFamilyPeopleWithAffiliation(session.familyId)
  const managed = new Set<string>()

  for (const unit of units) {
    const ids = getManagedUnitPersonIdsFromPeople(people, unit.parentAId, unit.parentBId)
    for (const id of ids) managed.add(id)
  }

  const unitIds = new Set(units.map(u => u.id))
  for (const p of people) {
    if (p.unitAffiliationId && unitIds.has(p.unitAffiliationId)) {
      managed.add(p.id)
    }
  }

  return managed
}
