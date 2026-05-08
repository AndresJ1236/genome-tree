# Genome Tree v3.2.0 — Release Notes

**Release date:** 2026-05-08

---

## Overview

v3.2 es una release de **velocidad de captura, accesibilidad y profundidad genealógica**. Tres preocupaciones centrales:

1. ⚡ **Capturar contenido y crear personas en segundos** — menú radial al pasar el mouse, invitaciones desde el editor, drag-drop para reordenar fotos, redirección directa al editor tras crear contenido.
2. 🧬 **Más fidelidad genealógica** — vínculos adoptivos/padrastros, fechas reales de matrimonio, hermanastros documentados, GEDCOM export para no encerrar los datos.
3. 🌙 **Apariencia y herramientas para admins** — modo oscuro con paleta cyan, atajos de teclado, mapa de calor de cobertura del árbol, OCR para documentos antiguos.

---

## Highlights

### ⚡ Menú radial de acciones rápidas (long-hover en el árbol)

Manteniendo el cursor 1 segundo sobre cualquier persona, aparecen burbujas circulares pequeñas alrededor del nodo:

- 🧑‍🤝‍🧑 Hermano/a — pre-llena los padres del target
- 👨 Padre — pre-asigna el target como hijo del nuevo
- 👩 Madre — idem mother
- 💕 Pareja — crea Relationship SPOUSE/PARTNER al guardar
- 👶 Hijo/a — pre-asigna el target como padre/madre del nuevo
- ✉️ Invitar (solo admin) — genera link y lo copia al portapapeles directamente

**Reglas de negocio:**

- Las burbujas se desactivan automáticamente si la relación ya existe (padre/madre/pareja activa)
- Trigger por hover quieto: si el mouse se mueve > 8px, el timer se reinicia
- Auto-cierre cuando el cursor sale de un radio que cubre las burbujas
- Layout en arco superior 180° (270° → 0° → 90°) evitando el sur donde está el nombre
- Posición y tamaño de burbujas en tree-coords — escalan con el zoom del árbol manteniendo proporción
- Solo activo para usuarios con permiso de crear personas (admin o representante de núcleo)

**Iconos SVG inline estilo Lucide** (no emojis), con padre y madre visualmente distintos (silueta masculina con corbata vs silueta femenina con falda).

Ver: `src/components/tree/QuickActionMenu.tsx`, `src/components/tree/PersonNode.tsx` (long-hover detector).

### 🧬 Vínculos parentales adoptivo y padrastro

Hoy `Person.fatherId/motherId` asumían biología. Ahora cada vínculo tiene un tipo explícito:

- **BIOLOGICAL** — sangre (default)
- **ADOPTIVE** — adopción legal
- **STEP** — padrastro/madrastra (cónyuge actual del padre/madre biológico, sin adopción formal)

Schema: nuevo enum `RelationKind`, columnas `Person.fatherKind` / `Person.motherKind` (nullable, default null = legacy = BIOLOGICAL al leer).

Sincronización automática: al limpiar `fatherId`, `fatherKind` se vuelve null. Al asignar sin elegir kind, default BIOLOGICAL.

UI: dropdown que aparece SOLO cuando hay padre/madre asignado, con ayuda contextual sobre cada opción.

GEDCOM exporta `PEDI adopted` o `PEDI foster` automáticamente cuando corresponde.

### 💍 Fecha real de matrimonio

Bug corregido: la timeline mostraba el matrimonio de una pareja en mayo 2026 (la fecha en que se registró su `Relationship` en el sistema), AUNQUE su separación era de 2018. Imposible.

- Schema: nueva columna `Relationship.startDate` (nullable)
- `getTimelineEvents` omite el evento MARRIAGE si no hay `startDate` — mejor no mostrar nada que mostrar una fecha incorrecta
- Nueva server action `setRelationshipStartDate` (espejo de `setRelationshipEndDate`)
- PersonEditor: nuevo campo "Fecha de matrimonio/unión" en el editor de relaciones

### 👨‍👩‍👧 Hermanastros (half-siblings)

El modelo de datos ya los soportaba — `fatherId` y `motherId` son independientes. Faltaba que la UX lo documentara.

Ahora en el flujo "Hermano/a de…" aparece un hint amarillo:

> 💡 Si es un hermanastro/a (medio hermano), borra el padre o madre que NO comparten en los selectores de parentesco abajo.

### 📨 Invitar a una persona desde su editor

Antes había que ir al admin dashboard, llenar un formulario y elegir el target en un dropdown. Ahora desde el editor de cualquier persona (modo edición, admin, no PETs) hay un botón:

**📨 Generar link de invitación** → llama a `createInviteLink` → copia automáticamente al portapapeles → muestra "✓ Link copiado al portapapeles" durante 4 segundos.

Defaults: role MEMBER, scope FAMILY, personId del perfil actual. Cubre el 90% de los casos.

### 📸 Imágenes en historias, diario y entrevistas (cap HD)

Antes solo recetas y objetos podían tener imágenes adjuntas. Ahora también historias, diario y entrevistas. La galería se muestra debajo del cuerpo del contenido, con click para abrir en lightbox.

**Decisión clave:** las imágenes anexadas a contenido se capean a **1920px (HD)**, no a 3840px (4K) como las fotos de persona. Razón: en una galería de historia no aporta el detalle 4K, y reducimos ~75% el peso del storage. Los originales 4K subidos se redimensionan automáticamente.

Bonus: tras crear una historia/receta/diario/entrevista nueva, se redirige directo al editor (`/content/<id>/edit`) donde la zona de subida de imágenes es visible. Antes el usuario volvía al perfil sin entender cómo añadir fotos.

### @ Menciones en comentarios

Al escribir `@` en un comentario aparece un dropdown con los miembros de la familia. Al elegir uno (o teclear el nombre/username) se inserta como mención visual destacada que:

- Se renderiza con highlight verde sobre fondo claro
- Es un Link al perfil de la persona si tiene `Person` vinculada
- **Genera una notificación tipo `MENTION_IN_COMMENT`** al usuario mencionado (no se notifica auto-mención)

Schema: `Comment.mentionedUserIds: String[]`, nuevo `NotificationType.MENTION_IN_COMMENT`. Soporta acentos y ñ via regex Unicode (`@([\p{L}\p{N}_]+)`).

### 🌳 GEDCOM export

Botón "GEDCOM" en el menú lateral del árbol (admin) → descarga un `.ged` 5.5.1 con todo el árbol abrible en Ancestry, MyHeritage, FamilySearch.

Cobertura: INDI por persona (nombre, sexo, BIRT con fecha+lugar, DEAT), FAM construidas a partir de `fatherId/motherId` compartido, eventos MARR/DIV con fechas reales si están en `startDate/endDate`, PEDI `adopted`/`foster` cuando `fatherKind/motherKind` es ADOPTIVE/STEP, NOTE con la bio.

NO exporta: contenido (historias, recetas) ni media — esas son extensiones específicas que no caben en GEDCOM estándar.

GEDCOM **import** queda para una sesión futura (decisiones de diseño abiertas: duplicados, archivos foto, fechas inciertas).

### ⌨️ Atajos de teclado

- `/` — enfoca el input de búsqueda en el árbol
- `?` — abre/cierra overlay con la lista de atajos
- `Esc` — cierra paneles, menús, overlays

Implementación filtra cuando el usuario está escribiendo (input/textarea/contenteditable) excepto Esc.

### 🌙 Modo oscuro con paleta cyan

Toggle en el drawer lateral del árbol (☰ → "Modo oscuro"). Persistencia en `localStorage`. Inline script en `<head>` aplica el tema antes del primer paint para evitar flash al cargar.

Paleta:

| Hex | Uso |
|---|---|
| `#121925` | Fondo principal |
| `#1a2a3d` | Cards / paneles / inputs |
| `#123d50` | Highlights / hover |
| `#146d86` | Bordes / botones primarios |
| `#1da7c8` | Links / encabezados |
| `#20dad8` | Acentos brillantes |
| `#5d8a99` | Texto secundario |
| `#d4eef2` | Texto principal (near-white) |

**Approach técnico:** sin filter CSS (los emojis se ven naturales). Targeting de inline-style más comunes via attribute selectors + selectores por clase para los círculos del árbol y la barra de búsqueda.

Casos especiales:
- **Círculos del árbol** mantienen look "pastilla luminosa" con bg claro y texto oscuro adentro (mismo lenguaje visual que el modo claro, sobre fondo oscuro).
- **Mascotas** mantienen tinte sepia/beige para distinguirlas visualmente de personas.
- **Barra de búsqueda** conserva colores claros — destaca como elemento luminoso.

### 🌡️ Mapa de calor de cobertura del árbol

Toggle en el drawer (admin/representante) → cada nodo del árbol recibe un halo radial coloreado según cuánto contenido tiene la persona.

**Scoring:**

| Categoría | Puntos por unidad | Notas |
|---|---|---|
| 🎙️ Audio / Video | 10 | Más valioso |
| 📖 Historias | 8 | |
| 🎤 Entrevistas | 8 | |
| 🍳 Recetas | 7 | |
| 📜 Fuentes | 6 | |
| 🏺 Objetos | 5 | |
| 📓 Diario | 5 | |
| 🔗 Vínculos importantes | 3 | |
| 📷 Fotos | 2 | Cap a 10 (max 20 pts) |

`score = min(100, raw / 60 × 100)`. Una persona "bien documentada" llega a verde con ~60 puntos brutos.

**Gradiente HSL en 2 segmentos:**
- 0..50: rojo (0°) → amarillo (50°), pasando por naranja
- 50..100: amarillo (50°) → verde (120°), pasando por lima

Render: halo radial-gradient detrás del círculo + border del color principal. Los nodos siguen siendo legibles.

### 📄 OCR de documentos antiguos

En el lightbox de fotos (admin/representante) hay un botón **📄 Extraer texto**:

- Manda la imagen a Claude Vision (`claude-sonnet-4-5`) con prompt orientado a documentos antiguos
- Devuelve el texto preservando estructura (saltos de línea, párrafos)
- Muestra el resultado en panel inferior con botón "Copiar texto"
- Audit log con `OCR_IMAGE`

Permisos: solo usuarios que pueden gestionar contenido de la persona dueña. Evita abuso de cuota.

**Requiere `ANTHROPIC_API_KEY` en `.env.production`.** Si falta, devuelve error user-friendly.

### 🔀 Drag-drop para reordenar fotos

Las miniaturas de la galería de fotos ahora se pueden arrastrar para reordenar. La card arrastrada baja a 40% opacidad, la posición destino tiene un outline cyan de 2px. El nuevo orden se guarda en background con la action `reorderMedia` que ya existía.

### 🐛 Fix: propuestas pendientes ahora visibles

Bug: el usuario admin/representante recibía notificación "Nueva propuesta" pero al ir a `/settings/proposals` no la veía — esa página solo mostraba las PROPIAS propuestas. Para revisar había que ir al admin dashboard, lo cual no era obvio.

Fix:
- `/settings/proposals` ahora muestra DOS secciones: "Por revisar" (admin/rep, con botones Aprobar/Rechazar inline) + "Mis propuestas"
- Notification href cambia de `/admin` a `/settings/proposals` para que el link de la campana lleve directo al lugar correcto

---

## Schema changes

```prisma
enum RelationKind {
  BIOLOGICAL
  ADOPTIVE
  STEP
}

model Person {
  // ...
  fatherKind RelationKind?
  motherKind RelationKind?
}

model Relationship {
  // ...
  startDate DateTime?    // fecha real de matrimonio/unión
}

model Comment {
  // ...
  mentionedUserIds String[] @default([])
}

enum NotificationType {
  // existentes...
  MENTION_IN_COMMENT
}
```

Aplicado en producción vía contenedor temporal `node:22-alpine` + `prisma db push`. Datos legacy compatibles (campos nuevos nullable, default null = comportamiento previo).

---

## New runtime dependencies

- `@anthropic-ai/sdk` (^0.x) — para OCR. Importado dinámicamente en `src/app/actions/ocr.ts` para no cargar en cold path. Requiere `ANTHROPIC_API_KEY` en env de producción.

---

## Bugfixes notables

| Bug | Causa | Fix |
|---|---|---|
| Botón ★ "destacar foto" sin efecto | `export const REACTION_TYPES` en archivo `'use server'` rompía el módulo SSR en Next.js 16 | Mover constantes a `src/lib/reactions-types.ts` |
| Burbujas del menú radial sin click | Pan handler del tree capturaba el pointer con `setPointerCapture` antes de que el button.onClick disparara | Exentar `.quick-action-bubble` del check de drag-initiation |
| Activity feed redundante con notificaciones | Se construyó pero las notificaciones ya cubrían el caso | Eliminado del código y producción |
| Iniciales de mascotas sin contraste en dark | Color `#6B5A44` mapeaba a cyan claro genérico | Class `.pet-circle` específica con tinte sepia + letras café oscuro |

---

## Internal: doc structure

- `docs/claude-context/05-FEATURES.md` — actualizado con secciones nuevas
- `docs/claude-context/03-DATABASE.md` — schema changes anotados
- `docs/claude-context/09-GOTCHAS.md` — pointer-capture trap, 'use server' restrictions
- `docs/claude-context/10-HISTORY.md` — entrada v3.2
