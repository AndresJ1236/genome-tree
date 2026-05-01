# PersonId Visibility Root Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que `user.personId` sea la raiz real del acceso visual, manteniendo `branchRootId` como compatibilidad temporal.

**Architecture:** La sesion ya transporta `personId`, asi que el cambio se concentra en `permissions.ts`. Se extraen helpers puros para descendencia, contexto de sangre y parejas directas, se prueba la nueva expansion de visibilidad con TDD y luego se integra en `getVisiblePersonIds()` sin tocar todavia `ManagedFamilyUnit` ni `AccessRule`.

**Tech Stack:** Next.js 16, Prisma, TypeScript, `tsx` para pruebas ligeras.

---

### Task 1: Probar la nueva expansion visual

**Files:**
- Create: `tests/person-visibility-root.test.ts`
- Modify: `src/lib/permissions.ts`

- [ ] **Step 1: Write the failing test**

Crear una prueba ligera que modele:
- una persona raiz `carlos`
- su descendencia completa
- contexto de sangre hasta distancia 3
- pareja directa visible de una persona ya visible
- familia politica de esa pareja que NO debe entrar

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/person-visibility-root.test.ts`
Expected: FAIL porque la funcion nueva aun no existe o no cumple el comportamiento.

- [ ] **Step 3: Implement minimal pure helpers**

Agregar helpers exportados en `src/lib/permissions.ts` para:
- indexar hijos
- construir grafo de sangre
- obtener descendencia
- obtener contexto de sangre
- obtener parejas directas sin expansion adicional
- combinar todo desde `personId`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx tests/person-visibility-root.test.ts`
Expected: PASS

### Task 2: Integrar la nueva raiz visual en permisos reales

**Files:**
- Modify: `src/lib/permissions.ts`

- [ ] **Step 1: Update runtime behavior**

Cambiar `getVisiblePersonIds(session)` para:
- devolver `null` solo para `ADMIN`
- usar `session.personId ?? session.branchRootId` como raiz
- si no hay raiz, mantener compatibilidad:
  - `FAMILY` -> `null`
  - `BRANCH` -> `new Set()`
- incluir:
  - descendencia completa
  - contexto de sangre distancia <= 3
  - parejas directas del conjunto visible

- [ ] **Step 2: Keep existing edit guards intact**

No cambiar todavia:
- lock de 10 dias
- `isCore`
- `assertCanEdit`

Solo permitir que `assertPersonAccess` y consumidores de `getVisiblePersonIds()` hereden la nueva visibilidad.

### Task 3: Verificacion y documentacion

**Files:**
- Modify: `docs\estado-actual.md`
- Modify: `docs\fases.md` (si aplica)
- Modify: `docs\reconstruccion.md` (si aplica)

- [ ] **Step 1: Sync and start runner**

Run:
```powershell
cd "LOCAL_REPO_PATH"
.\scripts\sync-runner.ps1
.\scripts\start-runner.ps1
```

- [ ] **Step 2: Verify runtime**

Run:
```powershell
.\scripts\verify-runtime.ps1
```
Expected:
- `GET /login` OK
- login OK
- `GET /familia-demo/tree` OK

- [ ] **Step 3: Update docs**

Documentar:
- que `personId` ya es la raiz visual preferida
- que `branchRootId` queda como compatibilidad temporal
- que `ManagedFamilyUnit` y `AccessRule` siguen pendientes

- [ ] **Step 4: Create snapshot**

Run:
```powershell
.\scripts\create-version-snapshot.ps1
```
