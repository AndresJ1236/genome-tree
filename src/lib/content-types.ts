// Shared content and editorial types for Genome Tree

export type ContentVisibility = 'BRANCH' | 'FAMILY' | 'ADMIN'
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW'
export type ContentType = 'STORY' | 'RECIPE' | 'OBJECT' | 'DIARY' | 'INTERVIEW' | 'SOURCE'
export type UserScope = 'ADMIN' | 'FAMILY' | 'BRANCH'
export type UserRole = 'ADMIN' | 'MEMBER'
export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN'
export type AccessEffect = 'ALLOW' | 'DENY'
export type AccessPermission = 'VIEW_PERSON' | 'EDIT_PERSON' | 'VIEW_MEDIA' | 'VIEW_PRIVATE' | 'VIEW_CONTENT'

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  HIGH: 'Alta - documento o registro oficial',
  MEDIUM: 'Media - testimonio directo',
  LOW: 'Baja - recuerdo indirecto',
}

export interface PersonBasic {
  id: string
  firstName: string
  middleName: string | null
  lastName: string
  birthDate: string | null
  deathDate: string | null
  coverPhoto: string | null
  gender: Gender
}

export interface PersonOption {
  id: string
  firstName: string
  middleName: string | null
  lastName: string
  birthDate: string | null
  deathDate: string | null
  gender: Gender
  fatherId: string | null
  motherId: string | null
  nodeKind: PersonKind
}

export interface MediaItem {
  id: string
  url: string                  // original (capeado a 4K)
  thumbUrl: string | null      // 150px WebP — null en filas legacy pre-backfill
  mediumUrl: string | null     // 400px WebP
  largeUrl: string | null      // 1600px WebP
  alt: string | null
  caption: string | null
  featured: boolean
  order: number
  mimeType: string
  width: number | null
  height: number | null
}

/**
 * Devuelve la URL de la variante preferida con fallback gracioso al original.
 * Permite que filas legacy (pre-backfill) sigan funcionando aunque carguen
 * más pesado.
 *
 *  - 'thumb'    → 150px (nodos del árbol, micro-thumbnails)
 *  - 'medium'   → 400px (galería en grid, avatar de perfil)
 *  - 'large'    → 1600px (vista expandida, lightbox modesto)
 *  - 'original' → tal cual subido (lightbox máxima calidad, descargas)
 */
export function pickMediaUrl(
  m: { url: string; thumbUrl?: string | null; mediumUrl?: string | null; largeUrl?: string | null },
  prefer: 'thumb' | 'medium' | 'large' | 'original'
): string {
  if (prefer === 'thumb'    && m.thumbUrl)  return m.thumbUrl
  if (prefer === 'medium'   && m.mediumUrl) return m.mediumUrl
  if (prefer === 'large'    && m.largeUrl)  return m.largeUrl
  return m.url
}

export interface ContentBase {
  id: string
  title: string
  visibility: ContentVisibility
  createdAt: string
  lockedAt: string
  isLocked: boolean
  source: string | null
  confidence: ConfidenceLevel | null
  createdBy: { id: string; name: string }
  canEdit: boolean
}

export interface StoryItem extends ContentBase {
  body: string
  approximateDate: string | null
  authorName: string | null
  media: MediaItem[]
}

export interface RecipeItem extends ContentBase {
  body: string | null
  ingredients: string[]
  steps: string[]
  notes: string | null
  media: MediaItem[]
}

export interface DiaryItem extends ContentBase {
  body: string
  entryDate: string | null
  media: MediaItem[]
}

export interface InterviewItem extends ContentBase {
  question: string
  body: string
  approximateDate: string | null
  authorName: string | null
  media: MediaItem[]
}

export interface ObjectItem extends ContentBase {
  body: string | null
  notes: string | null
  media: MediaItem[]
}

export interface SourceItem extends ContentBase {
  body: string | null
}

export interface ImportantLinkItem {
  id: string
  label: string
  notes: string | null
  source: string | null
  confidence: ConfidenceLevel | null
  visibility: ContentVisibility
  createdAt: string
  lockedAt: string
  isLocked: boolean
  canEdit: boolean
  relatedPerson: PersonBasic | null
  externalName: string | null
}

export interface PersonProfile {
  id: string
  firstName: string
  lastName: string
  birthDate: string | null
  deathDate: string | null
  birthPlace: string | null
  gender: Gender
  nodeKind: PersonKind
  bio: string | null
  coverPhoto: string | null
  isCore: boolean
  canManage: boolean
  canAddContent: boolean
  modules: FamilyConfigData
  parents: PersonBasic[]
  spouses: PersonBasic[]
  children: PersonBasic[]
  featuredMedia: MediaItem[]
  counts: {
    stories: number
    recipes: number
    diary: number
    interviews: number
    objects: number
    sources: number
    importantLinks: number
    media: number
    audioVideo: number
  }
  claimedRelation: ClaimedRelation | null
  claimedRelationOf: PersonBasic | null
  unitAffiliationLabel: string | null
}

export interface AudioVideoItem {
  id:          string
  url:         string
  mimeType:    string
  kind:        'AUDIO' | 'VIDEO'
  caption:     string | null
  durationSec: number | null
  createdAt:   string
}

export interface PersonFull extends PersonProfile {
  allMedia: MediaItem[]
  audioVideo: AudioVideoItem[]
  stories: StoryItem[]
  recipes: RecipeItem[]
  diaryEntries: DiaryItem[]
  interviews: InterviewItem[]
  objects: ObjectItem[]
  sources: SourceItem[]
  importantLinks: ImportantLinkItem[]
}

export interface CreateStoryInput {
  personId: string
  title: string
  body: string
  source?: string
  confidence?: ConfidenceLevel
  approximateDate?: string
  authorName?: string
  visibility: ContentVisibility
}

export interface CreateRecipeInput {
  personId: string
  title: string
  body?: string
  ingredients: string[]
  steps: string[]
  notes?: string
  source?: string
  confidence?: ConfidenceLevel
  visibility: ContentVisibility
}

export interface CreateDiaryInput {
  personId: string
  title: string
  body: string
  entryDate?: string
  visibility: ContentVisibility
}

export interface CreateInterviewInput {
  personId: string
  title: string
  question: string
  body: string
  source?: string
  confidence?: ConfidenceLevel
  approximateDate?: string
  authorName?: string
  visibility: ContentVisibility
}

export interface CreateObjectInput {
  personId: string
  title: string
  body?: string
  notes?: string
  source?: string
  confidence?: ConfidenceLevel
  visibility: ContentVisibility
}

export interface CreateSourceInput {
  personId: string
  title: string
  body?: string
  source?: string
  confidence?: ConfidenceLevel
  visibility: ContentVisibility
}

export interface CreateImportantLinkInput {
  personId: string
  label: string
  notes?: string
  source?: string
  confidence?: ConfidenceLevel
  visibility: ContentVisibility
  relatedPersonId?: string
  externalName?: string
}

export type PersonKind = 'PERSON' | 'PET'

export type RelationKind = 'BIOLOGICAL' | 'ADOPTIVE' | 'STEP'

export const RELATION_KIND_LABELS: Record<RelationKind, string> = {
  BIOLOGICAL: 'Biológico',
  ADOPTIVE:   'Adoptivo',
  STEP:       'Padrastro/Madrastra',
}

export interface PersonFormData {
  id: string
  firstName: string
  middleName: string
  lastName: string
  birthSurname1: string
  birthSurname2: string
  birthDate: string
  deathDate: string
  birthPlace: string
  gender: Gender
  nodeKind: PersonKind
  bio: string
  fatherId: string
  motherId: string
  fatherKind: RelationKind | ''  // '' cuando fatherId está vacío
  motherKind: RelationKind | ''
  coverPhoto: string
  isCore: boolean
  unitAffiliationId: string
  claimedRelation: string
  claimedRelationOfId: string
}

export interface ManagedUnitOption {
  id: string
  label: string
}

export interface RelationshipItem {
  id: string
  type: 'SPOUSE' | 'PARTNER' | 'SIBLING'
  partnerId: string
  partnerName: string
  startDate: string | null
  endDate: string | null
}

export interface PersonEditorPayload {
  familySlug: string
  person: PersonFormData | null
  candidates: PersonOption[]
  media: MediaItem[]
  viewerMode: 'ADMIN' | 'REPRESENTATIVE' | 'MEMBER'
  canChangeRelationships: boolean
  managedUnits: ManagedUnitOption[]
  relationships: RelationshipItem[]
}

export interface AdminUserItem {
  id: string
  name: string
  username: string
  role: UserRole
  scope: UserScope
  branchRootId: string | null
  personId: string | null
}

export interface ManagedFamilyUnitPreviewPerson {
  id: string
  firstName: string
  middleName: string | null
  lastName: string
}

export interface ManagedFamilyUnitItem {
  id: string
  label: string
  parentA: ManagedFamilyUnitPreviewPerson
  parentB: ManagedFamilyUnitPreviewPerson | null
  representativeUserId: string | null
  representativeUserName: string | null
  representativeUserUsername: string | null
  primarySurname: string | null
  secondarySurname: string | null
  canInviteUsers: boolean
  canEditPeople: boolean
  canManageContent: boolean
  canViewAudit: boolean
  managedPeople: ManagedFamilyUnitPreviewPerson[]
}

export interface FamilyConfigData {
  moduleStories: boolean
  moduleDiary: boolean
  moduleRecipes: boolean
  moduleMedia: boolean
  moduleObjects: boolean
  moduleLinks: boolean
  moduleAudioVideo: boolean
  moduleExportImport: boolean
  moduleSearch: boolean
}

export type SearchResultKind = 'PERSON' | 'CONTENT' | 'IMPORTANT_LINK'

export interface SearchResultItem {
  id: string
  kind: SearchResultKind
  personId: string
  title: string
  subtitle: string
  snippet: string | null
  href: string
}

export interface SearchResultsData {
  query: string
  people: SearchResultItem[]
  content: SearchResultItem[]
  links: SearchResultItem[]
}

export interface AuditLogItem {
  id: string
  action: string
  entityType: string
  entityId: string
  createdAt: string
  userName: string
  oldValue?: unknown
  newValue?: unknown
}

export interface AccessRuleItem {
  id: string
  userId: string | null
  userName: string | null
  targetPersonId: string
  targetPersonName: string
  effect: AccessEffect
  permission: AccessPermission
  reason: string | null
  createdAt: string
}

export interface AdminDashboardData {
  familySlug: string
  viewerMode: 'ADMIN' | 'REPRESENTATIVE'
  users: AdminUserItem[]
  people: PersonOption[]
  managedUnits: ManagedFamilyUnitItem[]
  accessRules: AccessRuleItem[]
  config: FamilyConfigData
  auditLogs: AuditLogItem[]
  proposals: PersonProposalItem[]
  creationProposals: PersonCreationProposalItem[]
}

export interface ContentEditorData {
  personId: string
  familySlug: string
  type: ContentType | 'IMPORTANT_LINK'
  title: string
  body: string
  source: string
  confidence: '' | ConfidenceLevel
  visibility: ContentVisibility
  approximateDate: string
  authorName: string
  entryDate: string
  question: string
  notes: string
  ingredientsText: string
  stepsText: string
  relatedPersonId: string
  externalName: string
  label: string
  media: MediaItem[]
}

export interface RelationsImportPreviewChange {
  personId: string
  personName: string
  currentFatherId: string | null
  currentFatherName: string | null
  newFatherId: string | null
  newFatherName: string | null
  currentMotherId: string | null
  currentMotherName: string | null
  newMotherId: string | null
  newMotherName: string | null
}

export interface RelationsImportPreview {
  totalInFile: number
  changesCount: number
  changes: RelationsImportPreviewChange[]
}

export type ProposalStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export type ClaimedRelation =
  | 'SIBLING'
  | 'HALF_SIBLING'
  | 'UNCLE_AUNT'
  | 'GREAT_UNCLE_AUNT'
  | 'COUSIN'
  | 'NEPHEW_NIECE'
  | 'ANCESTOR'
  | 'EXTENDED_FAMILY'

export const CLAIMED_RELATION_LABELS: Record<ClaimedRelation, string> = {
  SIBLING:          'Hermano/a',
  HALF_SIBLING:     'Medio hermano/a',
  UNCLE_AUNT:       'Tío/Tía',
  GREAT_UNCLE_AUNT: 'Tío abuelo / Tía abuela',
  COUSIN:           'Primo/Prima',
  NEPHEW_NIECE:     'Sobrino/Sobrina',
  ANCESTOR:         'Antepasado (conexión no determinada)',
  EXTENDED_FAMILY:  'Familiar (parentesco no determinado)',
}

export const CLAIMED_RELATION_REQUIRES_REF: Set<ClaimedRelation> = new Set([
  'SIBLING',
  'HALF_SIBLING',
  'UNCLE_AUNT',
  'GREAT_UNCLE_AUNT',
  'COUSIN',
  'NEPHEW_NIECE',
])

export interface PersonProposalItem {
  id: string
  personId: string
  personName: string
  proposedByName: string
  status: ProposalStatus
  createdAt: string
  reviewedAt: string | null
  rejectionReason: string | null
  // campos propuestos vs actuales
  fields: {
    key: string
    label: string
    currentValue: string | null
    proposedValue: string | null
  }[]
}

export interface NotificationItem {
  id: string
  type: string
  title: string
  body: string | null
  href: string | null
  read: boolean
  createdAt: string
}

export interface PersonCreationProposalItem {
  id: string
  proposedByName: string
  status: ProposalStatus
  createdAt: string
  reviewedAt: string | null
  rejectionReason: string | null
  firstName: string
  lastName: string | null
  middleName: string | null
  gender: string | null
  birthDate: string | null
  nodeKind: PersonKind
  notes: string | null
  fatherName: string | null
  motherName: string | null
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string }
