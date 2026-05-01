# Plan de migración — Schema v2

**Contexto:** Las reglas de negocio definen un modelo de parentesco basado en `fatherId`/`motherId` en `Person`, no en una tabla `Relationship` con tipo `PARENT_CHILD`. Este documento detalla qué cambia y cómo migrar.

---

## Diferencias entre schema actual y requerido

### ❌ Problema 1: Relaciones padre-hijo en tabla separada

**Actual:**
```prisma
model Relationship {
  type  RelationshipType  // PARENT_CHILD | SPOUSE | PARTNER
  person1Id  // padre/madre
  person2Id  // hijo/a
}
```

**Requerido:**
```prisma
model Person {
  fatherId  String?
  motherId  String?
  father    Person? @relation("father", ...)
  mother    Person? @relation("mother", ...)
}
```

**Impacto:** tree-layout.ts, permissions.ts, content.ts, seed.ts, PersonPanel

---

### ❌ Problema 2: SPOUSE/PARTNER explícito vs inferido

**Actual:** Se guarda `SPOUSE`/`PARTNER` en Relationship.

**Requerido:** La pareja parental se infiere de hijos compartidos. No se necesita guardar explícitamente para la lógica del árbol.

**Decisión:** Mantener una tabla `PartnerEvent` opcional para eventos formales (matrimonios con fecha) en el futuro, pero el layout no depende de ella.

---

### ❌ Problema 3: isCore ausente

**Agregar a Person:**
```prisma
isCore  Boolean  @default(false)
```

---

### ❌ Problema 4: AuditLog ausente

**Agregar:**
```prisma
model AuditLog {
  id         String   @id @default(cuid())
  familyId   String
  userId     String
  action     String   // "CREATE_PERSON", "EDIT_PERSON", "UPLOAD_MEDIA", etc.
  entityType String   // "Person", "Content", "Media", etc.
  entityId   String
  oldValue   Json?
  newValue   Json?
  createdAt  DateTime @default(now())
  family     Family   @relation(...)
  user       User     @relation(...)
}
```

---

### ❌ Problema 5: Configuración de módulos/límites ausente

**Agregar:**
```prisma
model FamilyConfig {
  id              String  @id @default(cuid())
  familyId        String  @unique
  // Límites
  maxMediaPerPerson    Int @default(100)
  maxFeaturedMedia     Int @default(9)
  maxStories           Int @default(30)
  maxStoryChars        Int @default(10000)
  maxRecipeMedia       Int @default(3)
  // Módulos
  moduleStories        Boolean @default(true)
  moduleDiary          Boolean @default(true)
  moduleRecipes        Boolean @default(true)
  moduleMedia          Boolean @default(true)
  moduleObjects        Boolean @default(true)
  moduleLinks          Boolean @default(true)
  moduleAudioVideo     Boolean @default(false)
  moduleExportImport   Boolean @default(false)
  moduleSearch         Boolean @default(false)
  family  Family @relation(...)
}
```

---

## Plan de migración por bloques

### Bloque A — Schema fatherId/motherId (PRIORITARIO)
Impacto: todo el árbol genealógico

1. Agregar `fatherId` y `motherId` a `Person`
2. Migrar datos de `Relationship PARENT_CHILD` → `fatherId`/`motherId`
3. Eliminar `PARENT_CHILD` del enum `RelationshipType`
4. Actualizar `tree-layout.ts` para usar `fatherId`/`motherId`
5. Actualizar `permissions.ts` (BFS usa fatherId/motherId)
6. Actualizar `content.ts` (getPersonProfile usa la nueva estructura)
7. Actualizar `PersonPanel` y `PersonPage` (parents/children)
8. Actualizar seed.ts

**Nota:** `SPOUSE`/`PARTNER` se puede mantener en Relationship por ahora para relaciones formales futuras, pero el layout no las necesita.

### Bloque B — isCore y FamilyConfig
Impacto: permisos y UI de admin

1. Agregar `isCore` a Person
2. Crear modelo `FamilyConfig`
3. Actualizar `permissions.ts` para respetar `isCore`
4. Crear `FamilyConfig` con defaults en seed

### Bloque C — AuditLog
Impacto: auditoría

1. Crear modelo `AuditLog`
2. Agregar llamadas a `logAction()` helper en todas las Server Actions de escritura

### Bloque D — Distancia de sangre
Impacto: permisos BRANCH

1. Reemplazar BFS simple por algoritmo que calcula distancia ≤ 3 desde `branchRootId`
2. El algoritmo camina subiendo por fatherId/motherId y bajando por hijos

---

## Orden recomendado de ejecución

```
Bloque A (schema fatherId/motherId)  ← más impacto, hacerlo primero
Bloque B (isCore + FamilyConfig)
Bloque D (distancia de sangre)
Bloque C (AuditLog)                  ← menor urgencia
```

