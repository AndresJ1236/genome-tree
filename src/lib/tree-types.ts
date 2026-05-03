export interface PersonData {
  id:         string
  firstName:  string
  middleName: string | null
  lastName:   string
  birthDate:  string | null   // ISO string
  deathDate:  string | null   // ISO string
  gender:     'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN'
  nodeKind:   'PERSON' | 'PET'
  coverPhoto: string | null
  // Parentesco directo (nuevo modelo)
  fatherId:   string | null
  motherId:   string | null
}

// Relaciones explícitas — SPOUSE / PARTNER / SIBLING (no PARENT_CHILD)
export interface RelationshipData {
  person1Id: string
  person2Id: string
  type: 'SPOUSE' | 'PARTNER' | 'SIBLING'
  endDate: string | null
}

export interface SiblingLink {
  person1Id: string
  person2Id: string
}

export interface LayoutNode extends PersonData {
  x:          number
  y:          number
  generation: number
}

export interface FamilyUnit {
  id:         string
  parent1Id:  string
  parent2Id:  string | null
  childIds:   string[]
  isExCouple?: boolean
}

export interface PetLink {
  petId:   string
  ownerId: string
}

export interface TreeLayout {
  nodes:        LayoutNode[]
  familyUnits:  FamilyUnit[]
  petLinks:     PetLink[]
  siblingLinks: SiblingLink[]
  bounds:       { minX: number; minY: number; maxX: number; maxY: number }
}

export interface TreeLayoutOptions {
  focusPersonId?: string
}
