# Reconstruccion

## Paso 1 - Base estable

Objetivo:
- Tener una sola carpeta para ejecutar la app
- Dejar OneDrive como fuente del codigo
- Dejar una copia estable fuera de OneDrive para correr Next

Carpetas:
- Fuente: `C:\Users\andre\OneDrive\Estudio\USFQ\genome-tree`
- Runner: `C:\Users\andre\Documents\New project\genome-tree`
- Snapshots: `C:\Users\andre\Documents\GenomeTreeVersions`

Regla:
- No correr `next dev`, `next build` ni `next start` dentro de OneDrive
- OneDrive se usa para editar y guardar el codigo fuente
- La app se ejecuta solo desde la carpeta runner

Comandos oficiales:

```powershell
cd "C:\Users\andre\OneDrive\Estudio\USFQ\genome-tree"
.\scripts\start-runner.ps1
```

Para apagar:

```powershell
cd "C:\Users\andre\OneDrive\Estudio\USFQ\genome-tree"
.\scripts\stop-runner.ps1
```

Que valida `start-runner.ps1`:
- sincroniza el codigo al runner
- regenera Prisma
- arranca Next en modo local estable
- verifica `GET /login`
- verifica login real con `admin@demo.com`
- verifica acceso a `/familia-demo/tree`

Si este paso funciona, el siguiente paso de reconstruccion es:
- auth y rutas con verificacion manual

## Paso 2 - Auth y rutas

Objetivo:
- validar login
- validar cookie de sesion
- validar redireccion a `/${familySlug}/tree`
- validar `proxy.ts`

Estado:
- validado

Resultados verificados:
- `GET /login` responde `200`
- `POST /auth/login` responde `303`
- el login correcto redirige a `http://127.0.0.1:3000/familia-demo/tree`
- la respuesta de login emite `Set-Cookie: session=...`
- la cookie queda como `HttpOnly`, `SameSite=lax`, sin `Secure` en local
- `GET /familia-demo/tree` sin sesion responde `307` a `/login?from=%2Ffamilia-demo%2Ftree`
- `GET /login` con sesion responde `307` a `/familia-demo/tree`

Archivos clave:
- `src/app/auth/login/route.ts`
- `src/lib/session.ts`
- `src/proxy.ts`

Nota:
- para entorno local se reemplazo el login basado en Server Action por un `route handler` clasico en `POST /auth/login`
- esto evita el fallo de cookie que aparecia al ejecutar la app fuera del navegador de desarrollo de Next

Siguiente paso:
- reconstruir el arbol visual en una capa separada, sin tocar auth

## Paso 3 - Arbol visual

Objetivo:
- recuperar el canvas visual del arbol
- mantener estable `login -> tree`
- aislar las piezas que vuelvan a colgar la ruta

Estado:
- validado en version estable

Resultados verificados:
- `GET /familia-demo/tree` responde `200`
- la vista vuelve a renderizar el canvas visual con `FamilyTree`
- el layout del arbol primero se estabilizo en una version simple
- luego se mejoro para volver a agrupar parejas validas como bloque
- el runtime sigue pasando aun cuando aparezcan ciclos raros en `fatherId/motherId`

Decisiones de estabilizacion:
- `computeTreeLayout()` ya no usa un recorrido que pueda escalar sin fin por relaciones ciclicas
- las parejas se agrupan por bloque solo cuando tienen sentido generacional
- se mantuvo la regla de separacion minima entre nodos para evitar superposicion de circulos
- el objetivo del paso sigue siendo el mismo: mejorar el arbol sin volver a romper auth ni la ruta base

Archivos clave:
- `src/app/(protected)/[familySlug]/tree/page.tsx`
- `src/components/tree/FamilyTree.tsx`
- `src/components/tree/PersonNode.tsx`
- `src/components/tree/FamilyEdges.tsx`
- `src/lib/tree-layout.ts`

Pendiente para refinamiento posterior:
- afinar el orden horizontal en ramas complejas
- seguir evitando cualquier cambio que vuelva a colgar `/tree` o incluso `/login`

## Paso 4 - CRUD desde UI

Objetivo:
- volver a conectar el arbol con el perfil y la edicion
- mantener vivas las rutas CRUD ya construidas en Fase 4
- validar que la base estable siga respondiendo despues de reactivar esa integracion

Estado:
- validado en base estable

Resultados verificados:
- `GET /familia-demo/tree` responde `200`
- `GET /familia-demo/person/seed-carlos` responde `200`
- `GET /familia-demo/person/seed-carlos/edit` responde `200`
- `GET /familia-demo/person/seed-carlos/content/new?type=STORY` responde `200`
- `GET /familia-demo/admin` responde `200`
- el arbol vuelve a montar `PersonPanel`
- el panel ya permite entrar a perfil completo y a edicion de persona

Decisiones de estabilizacion:
- se reactivo `PersonPanel` sobre el arbol ya simplificado
- el panel ahora limpia su estado al cerrar o cambiar de persona
- el fondo del panel se dejo transparente para no oscurecer el canvas del arbol

Archivos clave:
- `src/components/tree/FamilyTree.tsx`
- `src/components/tree/PersonPanel.tsx`
- `src/components/forms/PersonEditor.tsx`
- `src/components/forms/ContentEditor.tsx`
- `src/components/admin/AdminDashboard.tsx`

Pendiente para refinamiento posterior:
- ampliar la cobertura funcional mas alla de la smoke test base de Fase 4
- limpieza de textos con problemas de encoding heredados
- mantener el buscador del arbol anclado al contenedor de `FamilyTree`, no al viewport global, para no tapar el header superior

Smoke test cubierta:
- `tests/phase4-smoke.spec.js`
- login
- arbol
- crear persona
- editar parentesco
- abrir perfil
- crear historia
- volver al perfil y ver historia
- eliminar persona QA

## Nota operativa importante

Durante los intentos de refinar el layout del arbol se comprobo un riesgo concreto:
- si `computeTreeLayout()` entra en logica mala o demasiado costosa, la peticion a `/familia-demo/tree` bloquea el proceso de Node
- cuando eso pasa, hasta `/login` puede parecer muerto aunque el servidor siga "Ready"

Por eso, el criterio actual es:
- preferir el layout simple estable
- no volver a tocar el algoritmo fino sin una prueba directa de respuesta HTTP sobre `/tree`

Proceso oficial:
- ver `docs/verificacion-runtime.md`

## Nota posterior - Acceso a Administracion

Incidente:
- despues de integrar la busqueda global, la ruta `/${familySlug}/admin` seguia viva, pero el acceso desde la UI podia parecer roto

Root cause:
- `TreeSearch` estaba con `position: absolute` sin un contenedor relativo en `FamilyTree`
- eso hacia que el buscador se posicionara contra la ventana completa y pudiera montarse sobre el header del layout protegido
- el enlace `Administracion` existia, pero podia quedar tapado visualmente

Correccion aplicada:
- `FamilyTree` ahora monta todo dentro de un contenedor `position: relative`
- `TreeSearch` queda anclado al area del arbol y deja libre el header

Verificacion corta:
- `GET /familia-demo/tree` con sesion devuelve `200`
- el HTML del arbol contiene `/${familySlug}/admin`
- `GET /familia-demo/admin` con sesion devuelve `200`

## Nota posterior - Raiz visual por personId

Cambio aplicado:
- la visibilidad ya no toma `branchRootId` como unica raiz
- ahora se usa:
  - `session.personId` como raiz preferida
  - `session.branchRootId` como compatibilidad temporal

Regla visual actual:
- descendencia completa
- contexto de sangre hasta distancia 3
- parejas directas como contexto
- sin expansion hacia la familia politica de esas parejas

Limite actual:
- esto resuelve solo la parte de acceso visual
- todavia no incorpora `ManagedFamilyUnit` ni `AccessRule`

## Nota posterior - Relaciones JSON

Cambio aplicado:
- existe export de relaciones familiares en `GET /api/relations/export`
- cualquier usuario autenticado puede descargar un JSON limitado a las personas y parentescos que puede ver
- existe import de relaciones JSON en `/{familySlug}/admin`
- solo `ADMIN` puede importar

Alcance actual:
- se exporta e importa solo:
  - personas visibles o existentes
  - `fatherId`
  - `motherId`
- no se importan ni exportan historias, fotos, recetas, objetos, diario, entrevistas, fuentes ni relaciones importantes
- la importacion no crea personas nuevas

Validaciones:
- el `familySlug` del archivo debe coincidir con la familia actual
- todas las personas del payload deben existir ya en la familia
- todas las referencias de padre y madre deben existir ya en la familia
- nadie puede quedar como padre o madre de si mismo

## Nota posterior - ManagedFamilyUnit Bloque 1

Cambio aplicado:
- ya existe el modelo `ManagedFamilyUnit`
- un usuario representante ahora puede ampliar su vista con su unidad administrada

Unidad incluida:
- `parentA`
- `parentB`
- hijos compartidos de `parentA` y `parentB`
- descendencia de esos hijos

Unidad excluida:
- hijos de otras uniones de `parentA`
- hijos de otras uniones de `parentB`
- pareja externa de esas otras uniones

Limite actual:
- este bloque solo amplia visibilidad
- todavia no concede edicion delegada
- todavia no hay UI para crear o transferir unidades

## Nota posterior - ManagedFamilyUnit Bloque 2

Cambio aplicado:
- ya existe una diferencia efectiva entre visibilidad y gestion
- un representante de unidad ahora puede editar personas y gestionar contenido dentro de su unidad

Comportamiento validado:
- `luis@demo.com` puede abrir:
  - `/familia-demo/person/seed-diego/edit`
  - `/familia-demo/person/seed-diego/content/new?type=STORY`
- `luis@demo.com` no puede abrir:
  - `/familia-demo/person/seed-carlos/edit`
  - `/familia-demo/person/seed-carlos/content/new?type=STORY`

Cobertura actual:
- personas
- contenido
- media
- rutas de editor alineadas con permisos

Pendiente:
- UI de administracion para crear unidades
- preview de acceso
- transferencia de representante
- `AccessRule`

## Nota posterior - ManagedFamilyUnit Bloque 3

Cambio aplicado:
- `/{familySlug}/admin` ya permite operar `ManagedFamilyUnit` desde UI

Capacidades nuevas:
- crear unidad con `parentA`, `parentB` opcional y representante
- preview previo a guardar
- ver personas administradas dentro del dashboard
- reasignar representante
- editar flags de gestion de la unidad

Validaciones activas:
- el representante debe ser un usuario de la misma familia
- el representante debe tener `personId`
- `representativeUser.personId` debe pertenecer a la unidad calculada

Verificacion corta:
- `npx tsx tests/managed-family-unit.test.ts`
- `npx tsc --noEmit`
- `.\scripts\start-runner.ps1`
- `.\scripts\verify-runtime.ps1`
- `GET /familia-demo/admin` con sesion real devuelve `200`
- el HTML contiene:
  - `Nucleos familiares administrados`
  - `Familia Martinez Santos`
  - `Personas administradas`

Pendiente:
- `AccessRule`
- transferencia con validacion fina por apellido compatible
- auditoria limitada por unidad

## Nota posterior - Transferencia con apellido compatible

Cambio aplicado:
- la asignacion o reasignacion de representante ya no valida solo pertenencia a la unidad
- ahora tambien exige compatibilidad de apellido usando `lastName` del `personId` vinculado

Regla actual:
- se normalizan apellidos sin tildes y en minusculas
- se separa `lastName` por tokens
- al menos un token del `lastName` del representante debe coincidir con:
  - `primarySurname`
  - o `secondarySurname`

Limite actual:
- esto es una aproximacion temporal porque el modelo todavia no tiene `birthSurname1` y `birthSurname2`
- cuando esos campos existan, esta validacion debe migrar a apellidos de nacimiento reales

Verificacion corta:
- `npx tsx tests/managed-family-unit-transfer.test.ts`
- `npx tsc --noEmit`
- `.\scripts\start-runner.ps1`
- `.\scripts\verify-runtime.ps1`
- `GET /familia-demo/admin` con sesion real devuelve `200`

## Nota posterior - AccessRule extendido y auditoria limitada

Cambio aplicado:
- existe ya una version extendida de `AccessRule`
- el admin puede crear y eliminar reglas desde `/{familySlug}/admin`

Cobertura actual:
- `VIEW_PERSON`
- `EDIT_PERSON`
- `VIEW_CONTENT`
- `VIEW_MEDIA`
- `VIEW_PRIVATE`

Prioridad activa en backend:
- `DENY` explicito gana
- `ALLOW` explicito se aplica antes de reglas automaticas
- luego siguen:
  - `ManagedFamilyUnit`
  - creador / lock
  - raiz visual por `personId`

Cambios adicionales ya integrados:
- `Person` ya tiene `birthSurname1` y `birthSurname2`
- la compatibilidad de representante usa:
  - `lastName`
  - `birthSurname1`
  - `birthSurname2`
- `/{familySlug}/admin` ahora soporta modo `REPRESENTATIVE`
- la auditoria en ese modo se filtra solo a:
  - personas administradas
  - unidades administradas
  - contenido enlazado a personas dentro de esa unidad

Verificacion corta:
- `npx prisma db push`
- `npx prisma generate`
- `npx tsx tests/access-rules.test.ts`
- `npx tsx tests/managed-family-unit-transfer.test.ts`
- `npx tsx tests/managed-audit.test.ts`
- `npx tsc --noEmit`
- `.\scripts\start-runner.ps1`
- `.\scripts\verify-runtime.ps1`
- `GET /familia-demo/admin` con admin devuelve `200` y contiene:
  - `Access rules`
  - `VIEW_CONTENT`
  - `VIEW_MEDIA`
  - `VIEW_PRIVATE`
- `GET /familia-demo/admin` con `luis@demo.com` devuelve `200` y contiene:
  - `Revisa tus nucleos familiares`
  - `Transferir representacion`
  - sin exponer `Access rules`, invitaciones ni configuracion global
