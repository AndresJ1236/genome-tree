# ManagedFamilyUnit Design

## Objetivo

Agregar delegacion de administracion por nucleo familiar sin reemplazar la visibilidad base por `personId`.

La idea central queda asi:

- `personId` sigue siendo la raiz normal de acceso visual
- `ManagedFamilyUnit` puede ampliar la vista del representante
- esa ampliacion solo cubre la unidad exacta administrada
- la unidad no abre otras parejas de `parentA` o `parentB`
- la unidad no abre familia politica externa

## Regla de unidad

Una `ManagedFamilyUnit` visible y administrable incluye:

- `parentA`
- `parentB` si existe
- hijos compartidos de `parentA` y `parentB`
- descendencia completa de esos hijos

No incluye:

- hijos de `parentA` con otra pareja
- hijos de `parentB` con otra pareja
- ancestros de `parentA` o `parentB`
- familia politica externa de descendientes

## Integracion con permisos

La visibilidad final de un usuario no admin queda conceptualmente asi:

```txt
visible =
baseVisibleByPersonId
+ managedFamilyUnitVisible
+ directPartners(visible)
```

Con estas reglas:

- `baseVisibleByPersonId` ya existe
- `managedFamilyUnitVisible` suma personas administradas si el usuario representa una o mas unidades
- `directPartners(visible)` sigue siendo solo contexto visual
- no entra todavia `AccessRule`

## Implementacion por bloques

### Bloque 1

Agregar el modelo y usarlo para ampliar visibilidad:

- schema Prisma para `ManagedFamilyUnit`
- tipos compartidos minimos
- helper puro para calcular personas de una unidad
- integracion en `getVisiblePersonIds()`

### Bloque 2

Agregar administracion delegada:

- `userManagesPerson()`
- integracion en `assertCanEditPerson()`
- permisos de contenido dentro de la unidad

### Bloque 3

Agregar UI y flujos admin:

- crear unidad
- asignar representante
- preview de personas administradas
- transferencia de representacion

## Archivos objetivo

- `prisma/schema.prisma`
- `src/lib/content-types.ts`
- `src/lib/visibility-graph.ts`
- `src/lib/permissions.ts`
- `src/app/actions/admin.ts`
- `src/components/admin/AdminDashboard.tsx`

## Riesgos y guardrails

- no tocar auth ni runner en este bloque
- no mezclar `ManagedFamilyUnit` con `AccessRule` todavia
- no cambiar todavia reglas de edicion en el Bloque 1
- verificar runtime completo despues de integrar visibilidad
