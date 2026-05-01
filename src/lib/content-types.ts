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
}

export interface PersonOption {
  id: string
  firstName: string
  middleName: string | null
  lastName: string
  birthDate: string | null
  deathDate: string | null
}

export interface MediaItem {
  id: string
  url: string
  alt: string | null
  caption: string | null
  featured: boolean
  order: number
  mimeType: string
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
}

export interface InterviewItem extends ContentBase {
  question: string
  body: string
  approximateDate: string | null
  authorName: string | null
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
  bio: string | null
  coverPhoto: string | null
  isCore: boolean
  canManage: boolean
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
  }
}

export interface PersonFull extends PersonProfile {
  allMedia: MediaItem[]
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
  bio: string
  fatherId: string
  motherId: string
  coverPhoto: string
  isCore: boolean
}

export interface PersonEditorPayload {
  familySlug: string
  person: PersonFormData | null
  candidates: PersonOption[]
  media: MediaItem[]
}

export interface AdminUserItem {
  id: string
  name: string
  email: string
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
  representativeUserEmail: string | null
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

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string }
