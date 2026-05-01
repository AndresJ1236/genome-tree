# ManagedFamilyUnit Block 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar `ManagedFamilyUnit` al modelo y usarlo para ampliar la visibilidad de representantes sin abrir otras ramas o familia politica.

**Architecture:** El bloque 1 solo toca schema, tipos y permisos de vista. La visibilidad base por `personId` se mantiene, y se le suma la unidad administrada exacta calculada desde `parentA + parentB + hijos compartidos + descendencia`.

**Tech Stack:** Prisma, Next.js 16, TypeScript, `tsx`, scripts de runner y verificacion.

---

### Task 1: Modelo y tipos minimos

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/content-types.ts`

- [ ] Agregar `ManagedFamilyUnit` al schema con:
  - `familyId`
  - `label`
  - `parentAId`
  - `parentBId?`
  - `primarySurname?`
  - `secondarySurname?`
  - `representativeUserId?`
  - flags `canInviteUsers`, `canEditPeople`, `canManageContent`, `canViewAudit`
  - `createdAt`, `createdById?`

- [ ] Conectar relaciones minimas en `Family`, `Person` y `User`.

- [ ] Agregar tipos minimos compartidos para unidad administrada si hacen falta en backend.

### Task 2: Test rojo para calculo de unidad

**Files:**
- Modify: `tests/person-visibility-root.test.ts`
- Modify: `src/lib/visibility-graph.ts`

- [ ] Agregar caso de prueba donde:
  - `parentA` y `parentB` tienen hijos compartidos
  - `parentA` tiene otro hijo con tercera persona
  - la unidad solo devuelve `parentA`, `parentB`, hijos compartidos y descendencia
  - el hijo de otra union queda fuera

- [ ] Ejecutar:
  - `npx tsx tests/person-visibility-root.test.ts`
  - confirmar fallo por helper faltante

### Task 3: Helper puro de unidad administrada

**Files:**
- Modify: `src/lib/visibility-graph.ts`

- [ ] Implementar helper puro:
  - `getManagedUnitPersonIdsFromPeople(...)`

- [ ] Regla:
  - incluir `parentA`
  - incluir `parentB` si existe
  - encontrar solo hijos compartidos
  - sumar descendencia completa de esos hijos

- [ ] Re-ejecutar:
  - `npx tsx tests/person-visibility-root.test.ts`
  - confirmar verde

### Task 4: Integracion en permisos reales

**Files:**
- Modify: `src/lib/permissions.ts`

- [ ] Cargar unidades donde `representativeUserId === session.userId`

- [ ] Para cada unidad:
  - sumar `getManagedUnitPersonIdsFromPeople(...)` al visible set base

- [ ] Mantener intacto:
  - login
  - session payload
  - reglas de edicion
  - `AccessRule`

### Task 5: Verificacion del bloque

**Files:**
- Modify: `docs/estado-actual.md`
- Modify: `docs/fases.md`
- Modify: `docs/reconstruccion.md`

- [ ] Ejecutar snapshot previo:
  - `.\scripts\create-version-snapshot.ps1`

- [ ] Sincronizar y aplicar schema:
  - `.\scripts\sync-runner.ps1`
  - `npx prisma db push`

- [ ] Levantar y verificar:
  - `.\scripts\start-runner.ps1`
  - `.\scripts\verify-runtime.ps1`

- [ ] Documentar:
  - que `ManagedFamilyUnit` ya amplía visibilidad
  - que todavia no delega edicion

- [ ] Crear snapshot posterior si todo pasa
