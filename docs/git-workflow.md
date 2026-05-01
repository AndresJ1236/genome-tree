# Git: snapshots y recuperacion

## Para que sirve git en este proyecto

Git guarda el historial de cambios dentro de la carpeta `.git/` del proyecto.
No sube nada a internet. Todo queda local.

Cada snapshot es un "commit": una foto del estado de todos los archivos en ese momento.
Si algo se rompe, se vuelve exactamente a esa foto con un solo comando.

---

## Flujo de trabajo por bloque

```
1. snapshot antes de tocar algo
2. cambio en un solo tema
3. start-runner + verify-runtime + prueba funcional
4. si todo pasa → snapshot nuevo
5. si algo rompe → recuperar
```

**Yo (Claude) creo los snapshots antes de cada bloque.** Tu no tienes que hacer nada manualmente.

---

## Comandos que uso yo

### Antes de empezar un bloque

```bash
git add .
git commit -m "snapshot antes de [nombre del bloque]"
```

### Al confirmar que un bloque pasó

```bash
git add .
git commit -m "ok: [nombre del bloque]"
```

---

## Como recuperar si algo se rompe

### Ver los snapshots disponibles

```powershell
cd "C:\Users\andre\OneDrive\Estudio\USFQ\genome-tree"
git log --oneline
```

Muestra algo como:

```
a3f91c2 ok: import preview UI
7b2e801 snapshot antes de import preview
9a2eb66 snapshot inicial - estado actual del proyecto
```

### Volver al snapshot anterior

```powershell
git reset --hard HEAD~1
```

`HEAD~1` significa "el commit justo antes del actual".
Si quieres ir dos commits atras: `HEAD~2`. Y asi.

### Volver a un snapshot especifico por codigo

Copia el codigo de 7 letras del `git log --oneline` y ejecuta:

```powershell
git reset --hard 7b2e801
```

Reemplaza `7b2e801` con el codigo del snapshot al que quieres volver.

---

## Regla critica

**Nunca parchear encima de un bloque roto.**

Si verify-runtime falla:
1. No seguir modificando codigo.
2. Recuperar con `git reset --hard HEAD~1`.
3. Confirmar que verify-runtime pasa de nuevo.
4. Replantear el cambio.

---

## Diferencia con el script anterior

El script `create-version-snapshot.ps1` copiaba el proyecto completo a:
`C:\Users\andre\Documents\GenomeTreeVersions\`

Git hace lo mismo pero dentro del proyecto, sin duplicar archivos fisicos,
y permite volver con un solo comando en lugar de reemplazar carpetas manualmente.

Ambos siguen existiendo. Si prefieres tener una copia fisica de seguridad adicional
antes de un bloque grande, puedes correr el script igual.
