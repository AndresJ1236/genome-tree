# Hoja de ruta - Fases del proyecto

---

## Fase 1 - Infraestructura y autenticacion

**Estado:** completada

Incluye:
- schema base y multi-tenancy por `Family`
- login con JWT propio
- proteccion de rutas
- seed demo
- base de Docker Compose

---

## Fase 2 - Arbol genealogico visual

**Estado:** completada en base funcional, pendiente refinamiento visual

Incluye hoy:
- arbol visual operativo
- ramas SVG
- nodos interactivos
- pan, zoom y seleccion
- `PersonPanel` reactivado

Pendiente dentro de esta fase:
- mejorar el algoritmo de layout para reducir cruces y ordenar mejor familias
- hacerlo sin volver a bloquear `/tree`

---

## Fase 3 - Perfil, contenido y media

**Estado:** completada en base funcional

Incluye:
- `Schema v2`
- `PersonPanel`
- pagina completa de persona
- tabs de contenido
- subida y gestion de fotos desde UI
- fallback local para imagenes en desarrollo

---

## Fase 4 - CRUD desde UI y administracion

**Estado:** implementada y validada en smoke test funcional base

### Ya conectado y visible

#### Personas
- crear persona
- editar persona
- asignar `fatherId` y `motherId`
- subir fotos desde editor
- elegir portada
- eliminar persona con restricciones

#### Contenido
- rutas `new/edit` para:
  - historias
  - recetas
  - objetos
  - diario
  - entrevistas
  - fuentes
  - relaciones importantes
- subida de imagenes para recetas y objetos

#### Admin
- pagina `/{familySlug}/admin`
- cambio de roles y scopes
- asignacion de `branchRootId`
- asociacion usuario-persona
- creacion y edicion base de `ManagedFamilyUnit`
- preview de personas administradas dentro del dashboard
- activacion de modulos
- auditoria reciente

#### Invitaciones
- generacion de link firmado
- pagina publica de aceptacion

### Pendiente dentro de Fase 4

- ampliar la cobertura funcional a mas tipos de contenido
- validar admin e invitaciones con smoke tests separados
- limpieza de textos con problemas de encoding
- mejoras finas de UX en formularios
- evolucion del modelo de permisos desde `personId` hacia administracion por unidad familiar

### Smoke test validada

Archivo:
- `tests/phase4-smoke.spec.js`

Flujo cubierto:
- login
- arbol
- crear persona
- editar parentesco
- abrir perfil
- crear historia desde UI
- volver al perfil y ver la historia
- eliminar la persona QA de prueba

---

## Fase 5 - Produccion y features avanzadas

**Estado:** en curso

### Ya implementado
- busqueda global en la vista del arbol
- autocomplete con panel desplegable
- resultados agrupados por personas, contenido y relaciones
- endpoint protegido por sesion en `/api/search`
- export JSON de relaciones visibles en `/api/relations/export`
- import JSON de relaciones solo para `ADMIN` desde `/{familySlug}/admin`
- formato inicial limitado a personas existentes y relaciones `fatherId` / `motherId`
- soporte de `moduleSearch`
- `personId` como raiz visual preferida para calcular acceso visible
- parejas directas como contexto sin expansion a familia politica
- `ManagedFamilyUnit` como ampliacion controlada de visibilidad para representantes
- delegacion real de edicion y creacion dentro de `ManagedFamilyUnit`
- UI de administracion para crear, previsualizar y reasignar `ManagedFamilyUnit`
- validacion de representante por pertenencia real y apellido compatible usando `lastName` y apellidos de nacimiento
- `AccessRule` extendido con UI admin para:
  - `VIEW_PERSON`
  - `EDIT_PERSON`
  - `VIEW_CONTENT`
  - `VIEW_MEDIA`
  - `VIEW_PRIVATE`
- modo representante limitado en `/{familySlug}/admin`
- auditoria limitada por unidad administrada

### Pendiente dentro de esta fase
- deploy final con Docker, MinIO y Nginx
- onboarding de familia nueva
- ampliar pruebas funcionales finas de permisos, representantes y reglas cruzadas
- extender import/export a mas casos si hace falta:
  - preview antes de importar
  - resolucion asistida de ids faltantes
  - contenido narrativo en una fase posterior

### Pospuesto para fase posterior
- responsive y movil real para el arbol

---

## Resumen

| Fase | Estado |
|---|---|
| 1 | completada |
| 2 | operativa, pendiente refinamiento del layout |
| 3 | completada en base funcional |
| 4 | implementada en base funcional |
| 5 | en curso |
