# Reglas de negocio — Genome Tree

**Versión:** 1.0 · 2026-04-30

---

## 1. Modelo base de parentesco

El árbol se construye exclusivamente con dos campos por persona:

```
fatherId   → ID del padre biológico (nullable)
motherId   → ID de la madre biológica (nullable)
```

A partir de estos dos campos se calculan automáticamente **sin guardar en BD**:

| Relación | Cómo se calcula |
|---|---|
| Padres | `fatherId` + `motherId` directos |
| Hijos | personas donde `fatherId` o `motherId` = yo |
| Hermanos | mismos padres |
| Abuelos | padres de mis padres |
| Nietos | hijos de mis hijos |
| Tíos | hermanos de mis padres |
| Sobrinos | hijos de mis hermanos |
| Bisabuelos/nietos | siguiente nivel |

> **Regla crítica:** nunca guardar hermanos, tíos ni abuelos manualmente. Si cambia un fatherId/motherId, todas las relaciones derivadas se recalculan solas.

---

## 2. Parejas parentales (inferidas)

Una pareja parental **no se registra explícitamente**. Se infiere:

```
pareja inferida = dos personas que comparten al menos un hijo
  (algún Person tiene fatherId = A y motherId = B)
```

Esto sirve solo para dibujar a los padres juntos en el árbol. **No implica matrimonio ni ninguna relación formal.**

Si en el futuro se implementan eventos (matrimonios, divorcios), serán un modelo separado, no el árbol.

---

## 3. Subrama familiar (scope BRANCH)

La subrama de una persona raíz R incluye **toda la descendencia**:

```
R
├── hijo
│   └── nieto
│       └── bisnieto
└── hija
    └── ...
```

No tiene límite de profundidad hacia abajo.

---

## 4. Contexto por sangre (distancia ≤ 3)

Además de su subrama, un usuario BRANCH puede ver **contexto de sangre** hasta distancia 3 desde su raíz:

| Distancia | Incluye |
|---|---|
| 1 | padres, hijos directos |
| 2 | abuelos, hermanos, nietos |
| 3 | bisabuelos, tíos, sobrinos, bisnietos |

La distancia se calcula caminando por relaciones padre-hijo **en cualquier dirección** (subir o bajar generaciones).

**No se muestran:** primos lejanos, cadenas de más de 3 saltos.

**Conectores mínimos:** personas necesarias para que el árbol no quede visualmente roto se pueden mostrar con datos reducidos (solo nombre e iniciales).

---

## 5. Ver ≠ Editar

Un usuario puede ver personas de contexto sin poder editarlas.

| Acción | ADMIN | FAMILY | BRANCH |
|---|---|---|---|
| Ver subrama completa | ✓ | ✓ | solo su subrama + sangre≤3 |
| Editar personas | todas | todas | solo su subrama editable |
| Editar contenido | todo | el suyo dentro del lock | el suyo dentro del lock |
| Editar isCore | ✓ | ✗ | ✗ |

Si un usuario BRANCH intenta editar fuera de su zona, el mensaje es:
> *"Esta parte está protegida para conservar la información familiar. Si necesitas corregir algo, contacta a AJ."*

---

## 6. isCore (familia central)

Personas marcadas como `isCore = true`:

- Solo ADMIN puede activar/desactivar
- Solo ADMIN puede modificar sin restricciones
- Usuarios BRANCH/FAMILY no pueden editar personas isCore
- Protege el tronco central del árbol ante ediciones accidentales

---

## 7. Privacidad por contenido (visibilityScope)

Todo contenido tiene `visibility`:

| Scope | Quién ve |
|---|---|
| `BRANCH` | solo usuarios de esa rama autorizada |
| `FAMILY` | todos los usuarios logueados de la familia |
| `ADMIN` | solo admin |

Aplica a: fotos, historias, diario, entrevistas, recetas, objetos, relaciones importantes, audio/video, notas privadas, contacto, trabajo.

**El backend filtra antes de responder. Nunca depender de CSS/JS para ocultar datos privados.**

---

## 8. Regla de lock de 10 días

```
editable si:
  - usuario es ADMIN
  - o es el autor Y han pasado menos de 10 días desde creación
```

Después de 10 días el contenido queda fijo. Solo ADMIN puede modificarlo.

Aplica a: personas, historias, imágenes, recetas, diario, objetos, relaciones importantes.

---

## 9. Módulos activables por admin

| Módulo | Default |
|---|---|
| Historias | ✓ |
| Diario/Entrevistas | ✓ |
| Recetas | ✓ |
| Imágenes | ✓ |
| Objetos con historia | ✓ |
| Relaciones importantes | ✓ |
| Audio/Video | ✗ (futuro) |
| Export/Import | ✗ (futuro) |
| Búsqueda avanzada | ✗ (futuro) |

Si un módulo está desactivado: no se muestra en UI, no se puede crear/editar contenido de ese tipo. Los datos existentes **no se eliminan**.

---

## 10. Límites configurables por admin

| Límite | Default |
|---|---|
| Imágenes por persona | 100 |
| Imágenes destacadas | 9 |
| Historias por persona | 30 |
| Total caracteres de historias | 10,000 |
| Imágenes por receta | 3 |

---

## 11. Auditoría

Todo cambio importante registra:

```
userId, timestamp, action, entity, entityId, oldValue, newValue
```

Acciones auditables: crear/editar persona, cambiar padre/madre, subir/borrar imagen, editar historia, crear receta, cambiar visibility, activar módulo, crear/desactivar usuario.

---

## 12. Export/Import JSON

- Export: solo lo que el usuario puede ver (sin fotos privadas, sin contenido fuera de permiso)
- Import: usuario BRANCH solo puede importar dentro de su subrama editable; no puede tocar isCore sin aprobación

---

## 13. Búsqueda

Búsqueda por nombre, apellido, apodos. Al seleccionar resultado: centra el nodo en el árbol y abre el panel. Solo muestra resultados visibles para ese usuario.

---

## 14. Generaciones (layout)

```
si persona no tiene padres conocidos → generación 0
si tiene padres → 1 + max(gen(padre), gen(madre))
```

Visual:
- Cada generación va debajo de la anterior
- Hijo se centra entre padre y madre si ambos existen
- Parejas parentales se mantienen en la misma fila
- Si se añade un padre nuevo, el layout se recalcula completo

