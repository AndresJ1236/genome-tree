# Tree Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar búsqueda global con autocomplete en la vista del árbol, con resultados rápidos agrupados por personas, contenido y relaciones.

**Architecture:** El árbol mostrará un cuadro de búsqueda cliente con debounce y panel desplegable. La consulta se resolverá por un endpoint HTTP protegido por sesión y permisos, reutilizando `familyId`, `scope`, `moduleSearch` y filtros de visibilidad existentes. La lógica reutilizable de normalización y snippets vivirá en un helper puro y testeable.

**Tech Stack:** Next.js App Router, route handlers, Prisma, React client state, PowerShell verification scripts.

---

### Task 1: Helpers puros de búsqueda

**Files:**
- Create: `src/lib/search-utils.ts`
- Create: `tests/search-utils.test.ts`

- [ ] Escribir prueba fallida para normalización, tokenización y snippet.
- [ ] Ejecutar `npx tsx tests/search-utils.test.ts` y confirmar que falle.
- [ ] Implementar helpers mínimos en `src/lib/search-utils.ts`.
- [ ] Ejecutar `npx tsx tests/search-utils.test.ts` y confirmar que pase.

### Task 2: Tipos compartidos y endpoint

**Files:**
- Modify: `src/lib/content-types.ts`
- Create: `src/app/api/search/route.ts`

- [ ] Añadir tipos de resultados de búsqueda.
- [ ] Implementar endpoint `GET /api/search?q=...` con sesión, `moduleSearch`, `familyId`, `scope`, visibilidad y límites por grupo.
- [ ] Probar el endpoint con sesión autenticada y consulta real.

### Task 3: UI del árbol

**Files:**
- Create: `src/components/tree/TreeSearch.tsx`
- Modify: `src/components/tree/FamilyTree.tsx`
- Modify: `src/app/(protected)/[familySlug]/tree/page.tsx`

- [ ] Agregar input con debounce y panel desplegable.
- [ ] Mostrar grupos `Personas`, `Contenido`, `Relaciones`.
- [ ] Hacer que un resultado de persona seleccione la persona en el árbol.
- [ ] Hacer que resultados de contenido o relación naveguen al perfil correspondiente.
- [ ] Mostrar estado deshabilitado si `moduleSearch` está apagado.

### Task 4: Verificación y documentación

**Files:**
- Modify: `docs/estado-actual.md`
- Modify: `docs/fases.md`

- [ ] Ejecutar `.\scripts\start-runner.ps1`
- [ ] Ejecutar `.\scripts\verify-runtime.ps1`
- [ ] Hacer prueba funcional corta: abrir árbol, escribir búsqueda, ver resultados y abrir una persona.
- [ ] Documentar el módulo y crear snapshot si todo pasa.
