# Estado actual del proyecto

**Ultima actualizacion:** 2026-05-01  
**Estado operativo recomendado:** correr siempre desde el runner estable, no desde `OneDrive`

---

## Estado real hoy

La aplicacion tiene una base funcional estable para:
- login
- rutas protegidas
- arbol visual
- busqueda global en la vista del arbol
- panel lateral de persona
- perfil completo
- edicion de personas
- rutas CRUD de contenido
- panel de administracion
- invitaciones

El punto importante es este:
- `OneDrive` queda como fuente del codigo
- `USER_HOME\Documents\New project\genome-tree` queda como copia runner
- el arranque oficial es `.\scripts\start-runner.ps1`

---

## Que esta estable

### Infraestructura y auth
- login con email y contrasena
- cookie de sesion `httpOnly`
- redireccion correcta a `/{familySlug}/tree`
- proteccion de rutas con `proxy.ts`
- `personId` en sesion ya se usa como raiz visual preferida cuando existe
- `branchRootId` queda como fallback temporal de compatibilidad

### Arbol visual
- el arbol vuelve a abrir y responder
- pan y zoom funcionan
- cuadro de busqueda con autocomplete y panel desplegable
- el cuadro de busqueda ya no tapa el header ni bloquea el acceso a `Administracion`
- `PersonPanel` esta reactivado
- desde el panel se puede entrar a perfil completo y a edicion
- las parejas validas vuelven a ordenarse como bloque
- se mantiene la separacion minima entre circulos
- el layout ya tolera ciclos raros en parentesco sin colgar Node

### Perfil y CRUD base
- pagina completa de persona
- tabs de contenido
- editor de persona
- rutas de crear/editar contenido
- admin
- invitaciones
- smoke test funcional de Fase 4 validada para el flujo base

### Fase 5 - Busqueda
- endpoint `GET /api/search`
- filtro por `familyId`, `scope` y `visibility`
- agrupacion rapida por `Personas`, `Contenido`, `Relaciones`
- integracion visual en la vista del arbol
- modulo `moduleSearch` soportado y habilitado para la familia demo actual

### Fase 5 - Export / import de relaciones JSON
- `GET /api/relations/export` disponible para cualquier usuario autenticado
- el export solo incluye:
  - personas visibles para esa sesion
  - identidad minima
  - `fatherId`
  - `motherId`
- no incluye:
  - historias
  - fotos
  - recetas
  - objetos
  - diario
  - entrevistas
  - fuentes
  - relaciones importantes
- la importacion vive en `/{familySlug}/admin`
- solo `ADMIN` puede importar
- la importacion:
  - no crea personas nuevas
  - solo actualiza `fatherId` y `motherId`
  - falla si el JSON trae personas o referencias que no existen en la familia actual

---

## Limitacion importante del arbol

El layout del arbol ya salio de la version minima de emergencia, pero todavia no es el refinamiento visual final.

Situacion actual:
- las parejas validas se agrupan como bloque para reducir cruces
- la separacion entre nodos sigue protegida por la regla minima actual
- el calculo de generaciones ya no debe escalar sin fin si aparece un ciclo en `fatherId/motherId`
- las parejas imposibles entre generaciones muy lejanas ya no se usan como pareja visual

Conclusión:
- hoy el arbol **abre**
- la organizacion visual es mejor que la version simple anterior
- todavia puede requerir ajuste fino en ramas complejas, pero sin volver a sacrificar estabilidad

Archivo clave:
- `src/lib/tree-layout.ts`

## Evolucion de permisos en curso

Primera migracion ya aplicada:
- `getVisiblePersonIds()` ya no parte solo de `branchRootId`
- para usuarios no admin, la raiz visual pasa a ser:
  - `session.personId`, si existe
  - si no, `session.branchRootId`
- la expansion visual incluye:
  - descendencia completa
  - contexto de sangre hasta distancia 3
- parejas directas como contexto, sin expandir su familia politica

Segunda migracion ya aplicada:
- existe el modelo `ManagedFamilyUnit`
- si un usuario representa una unidad, su visibilidad se amplia con:
  - `parentA`
  - `parentB`
  - hijos compartidos
  - descendencia de esos hijos
- esa ampliacion no abre hijos de otras uniones ni pareja externa
- este bloque solo afecta visibilidad, no delega todavia edicion

Tercera migracion ya aplicada:
- ya existe distincion real entre `ver` y `gestionar`
- un representante puede:
  - editar personas dentro de su unidad
  - crear contenido para personas dentro de su unidad
  - abrir rutas de edicion dentro de su unidad
- no puede:
  - editar personas visibles fuera de su unidad
  - crear contenido para personas visibles fuera de su unidad

Caso demo cargado en seed:
- usuario: `luis@demo.com`
- contrasena: `luis123`
- unidad administrada: `Luis + Sofia + hijos compartidos + descendencia`

Pendiente de esta evolucion:
- ampliar pruebas funcionales con mas escenarios y reglas cruzadas
- revisar si hacen falta mas permisos finos sobre entidades futuras de export/onboarding

Cuarta migracion ya aplicada:
- `/{familySlug}/admin` ya muestra `ManagedFamilyUnit`
- el admin puede:
  - crear una unidad
  - asignar o cambiar representante
  - ajustar flags de `canInviteUsers`, `canEditPeople`, `canManageContent`, `canViewAudit`
  - ver preview de personas administradas antes de guardar
- la vista de admin ya renderiza la unidad demo `Familia Martinez Santos`
- el backend valida que el representante pertenezca a la unidad administrada
- el backend valida ademas compatibilidad de apellido usando `lastName` normalizado como aproximacion temporal

Quinta migracion ya aplicada:
- existe el modelo `AccessRule`
- el admin ya puede crear reglas manuales desde `/{familySlug}/admin`
- version activa para:
  - `VIEW_PERSON`
  - `EDIT_PERSON`
  - `VIEW_CONTENT`
  - `VIEW_MEDIA`
  - `VIEW_PRIVATE`
- prioridad actual:
  - `DENY` explicito gana
  - `ALLOW` explicito puede sumar vista o habilitar edicion
  - despues siguen las reglas automaticas por `ManagedFamilyUnit`, creador y raiz visual

Sexta migracion ya aplicada:
- `Person` ya guarda:
  - `birthSurname1`
  - `birthSurname2`
- la compatibilidad de representante ya no depende solo de `lastName`
- tambien puede validarse por apellidos de nacimiento

Septima migracion ya aplicada:
- `/{familySlug}/admin` tiene dos modos:
  - `ADMIN`
  - `REPRESENTATIVE`
- un representante con `canViewAudit` puede entrar a admin en modo limitado
- en ese modo:
  - ve sus nucleos familiares
  - puede transferir la representacion
  - ve auditoria limitada a personas y unidades dentro de su alcance
- no ve:
  - `Access rules`
  - invitaciones
  - configuracion global de familia

Proceso oficial de verificacion:
- `docs/verificacion-runtime.md`
- script: `scripts/verify-runtime.ps1`

---

## Forma correcta de ejecutar

Usar siempre:

```powershell
cd "LOCAL_REPO_PATH"
.\scripts\start-runner.ps1
```

Para apagar:

```powershell
cd "LOCAL_REPO_PATH"
.\scripts\stop-runner.ps1
```

No usar:
- `next dev` dentro de `OneDrive`
- `next build` dentro de `OneDrive`
- `next start` dentro de `OneDrive`

---

## Snapshots y respaldo

Carpeta de versiones:
- `USER_HOME\Documents\GenomeTreeVersions`

Ultimo snapshot manual creado:
- `USER_HOME\Documents\GenomeTreeVersions\phase4-working-20260501-122540`

---

## Siguiente trabajo recomendado

1. Mantener esta base estable sin tocar el arranque.
2. Extender la cobertura funcional a mas tipos de contenido y a admin/invitaciones.
3. Seguir Fase 5 por bloques: terminar verificacion fina de import JSON, luego deploy y onboarding.
4. Rehacer el layout del arbol en una iteracion aparte, con una regla: no aceptar ningun cambio que vuelva a colgar `/tree` o `/login`.

---

## Verificacion funcional reciente

Fecha:
- 2026-04-30

Validado con Playwright sobre el runner estable:
- login
- acceso al arbol
- apertura de `Nueva persona`
- creacion de persona
- edicion de padre y madre
- entrada al perfil de la nueva persona
- creacion de historia desde UI
- retorno al perfil y visualizacion de la historia
- eliminacion final de la persona QA de prueba

Archivo de prueba:
- `tests/phase4-smoke.spec.js`

Verificacion corta adicional:
- login real
- arbol con sesion
- presencia del enlace `/${familySlug}/admin` en el HTML del arbol
- carga efectiva de `GET /familia-demo/admin` con estado `200`

Nota:
- el bug de acceso a `Administracion` no estaba en la ruta
- el problema era visual: `TreeSearch` estaba posicionado contra la ventana completa y podia montarse sobre el header
- la correccion fue anclar el buscador al contenedor relativo de `FamilyTree`

Verificacion corta adicional de `ManagedFamilyUnit`:
- `GET /familia-demo/admin` con sesion real devuelve `200`
- el HTML incluye `Nucleos familiares administrados`
- el HTML incluye la unidad demo `Familia Martinez Santos`

Verificacion corta adicional de permisos finos:
- `npx tsx tests/access-rules.test.ts`
- `npx tsx tests/managed-family-unit-transfer.test.ts`
- `npx tsx tests/managed-audit.test.ts`
- `POST /auth/login` con admin deja cookie de sesion
- `GET /familia-demo/admin` con admin devuelve `200` y contiene:
  - `Access rules`
  - `VIEW_CONTENT`
  - `VIEW_MEDIA`
  - `VIEW_PRIVATE`
- `GET /familia-demo/admin` con `luis@demo.com` devuelve `200` y contiene:
  - `Revisa tus nucleos familiares`
  - `Transferir representacion`
  - sin exponer `Access rules`, invitaciones ni configuracion global
