# Verificacion de runtime y bloqueos de Node

## Objetivo

Evitar un tipo de fallo ya confirmado en este proyecto:
- una ruta pesada como `/{familySlug}/tree` entra en logica sin fin o demasiado costosa
- el proceso de Node queda bloqueado en CPU
- el servidor sigue mostrando `Ready`
- pero `/tree` deja de responder y, en casos peores, hasta `/login` parece muerto

Este documento define el proceso oficial para verificar cambios que puedan afectar el runtime.

---

## Cuando aplicar esta verificacion

Usar este proceso siempre que se toque algo de estas zonas:
- `src/lib/tree-layout.ts`
- `src/components/tree/*`
- `src/app/(protected)/[familySlug]/tree/page.tsx`
- `src/lib/session.ts`
- `src/proxy.ts`
- `src/app/auth/login/route.ts`
- `src/app/actions/*` si cambian consultas pesadas o permisos

Regla simple:
- si el cambio puede afectar render de servidor, auth, o el arbol, pasa por esta verificacion

---

## Sintoma real a vigilar

No confundir estos dos casos:

### Caso A - problema visual
- la pagina abre
- la UI se ve mal
- hay HTML, CSS o errores visibles en pantalla

### Caso B - bloqueo de runtime
- `next start` o `next dev` muestran `Ready`
- el navegador se queda cargando indefinidamente
- `curl` o `Invoke-WebRequest` a `/login` o `/tree` expiran por tiempo

El caso peligroso para este proyecto es el **Caso B**.

---

## Regla de entorno

No ejecutar la app desde `OneDrive`.

Fuente:
- `LOCAL_REPO_PATH`

Runner:
- `USER_HOME\Documents\New project\genome-tree`

Comando oficial:

```powershell
cd "LOCAL_REPO_PATH"
.\scripts\start-runner.ps1
```

---

## Proceso oficial de verificacion

### 1. Antes de tocar codigo sensible

Crear snapshot:

```powershell
cd "LOCAL_REPO_PATH"
.\scripts\create-version-snapshot.ps1
```

Objetivo:
- tener un punto claro de rollback

### 2. Aplicar el cambio

Hacer el cambio en la fuente de `OneDrive`.

### 3. Arranque controlado

Levantar solo con el runner:

```powershell
cd "LOCAL_REPO_PATH"
.\scripts\start-runner.ps1
```

Este script ya valida:
- build
- `GET /login`
- login real
- `GET /familia-demo/tree`

### 4. Verificacion HTTP manual

Comprobar otra vez, de forma directa:

```powershell
curl.exe -I --max-time 15 http://127.0.0.1:3000/login
```

Luego:

```powershell
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3000/auth/login' -Method Post -Body @{ email='admin@demo.com'; password='admin123' } -WebSession $session -TimeoutSec 15 | Out-Null
(Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3000/familia-demo/tree' -WebSession $session -TimeoutSec 15).StatusCode
```

Resultado esperado:
- `/login` responde `200`
- `/tree` responde `200`
- ninguna llamada debe quedar colgada

### 4.b Script oficial

Tambien se puede ejecutar el proceso con un solo comando:

```powershell
cd "LOCAL_REPO_PATH"
.\scripts\verify-runtime.ps1
```

El script valida:
- `GET /login`
- `POST /auth/login`
- presencia de cookie `session`
- `GET /familia-demo/tree`

### 5. Criterio de aceptacion

Un cambio solo se acepta si cumple estas tres condiciones:
- el runner levanta sin errores
- `/login` responde dentro del timeout
- `/tree` responde dentro del timeout

Si falla cualquiera de las tres:
- el cambio **no se considera valido**
- se revierte al ultimo snapshot estable

---

## Diagnostico rapido

### Si `Ready` aparece pero el navegador no abre

Ejecutar:

```powershell
curl.exe -I --max-time 15 http://127.0.0.1:3000/login
```

Interpretacion:
- si responde `200`, el problema no es bloqueo global del runtime
- si expira por tiempo, el proceso de Node esta bloqueado o colgado

### Si `/login` responde pero `/tree` no

Sospecha principal:
- `src/lib/tree-layout.ts`
- consultas o transformaciones de `tree/page.tsx`

### Si `/tree` cuelga y despues `/login` tambien

Sospecha principal:
- una peticion al arbol bloqueo el event loop de Node
- el servidor puede seguir “vivo”, pero ya no procesa nuevas respuestas

---

## Politica de rollback

Si un cambio rompe el runtime:

1. No seguir parchando encima.
2. Restaurar el ultimo snapshot que si respondia.
3. Confirmar otra vez:
   - `/login`
   - login real
   - `/tree`
4. Replantear el cambio en una iteracion separada.

---

## Leccion aprendida en este proyecto

El layout fino del arbol no debe desarrollarse “a ojo” solo mirando la UI.

Debe tratarse como codigo de runtime critico porque:
- vive en el camino de render del servidor
- puede bloquear Node
- puede hacer que parezca que toda la app dejo de abrir

Por eso, cualquier intento futuro de mejorar `tree-layout.ts` debe pasar primero por esta verificacion.
