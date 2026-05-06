# Genome Tree v3.1.0 — Release Notes

**Release date:** 2026-05-06

---

## Overview

v3.1 es una release de **engagement, exploración y resiliencia operativa** sobre la base sólida de v3.0. Las features están agrupadas en cinco temas:

1. ❤️ **Engagement familiar** — reacciones, "hace X años", resumen semanal
2. 🧬 **Genealogía** — calculadora de parentesco, línea de tiempo, mapa de orígenes
3. 🎙️ **Audio + video** — el módulo dormido desde v1.0 finalmente vivo
4. 🐛 **Operaciones** — Sentry para errores, Vitest para regresiones del árbol
5. 🛡️ **Sin nuevas brechas** — todo lo nuevo respeta los controles de seguridad de v3.0

---

## Highlights

### ❤️ Reacciones en historias y fotos

Cinco emoji de reacción por contenido: HEART (❤️), LAUGH (😄), WOW (😮), SAD (😢), PRAY (🙏). Click → toggle. Hover → preview de quién reaccionó ("Ana, Pedro y 2 más").

- Schema: nueva tabla `Reaction` con unique compound `(userId, target, type)` para prevenir duplicados
- `ReactionBar` componente con 2 variantes: `full` para historias, `compact` (`❤️ 5`) para futuras vistas debajo de fotos
- Optimistic update — el conteo cambia al instante, sync con servidor en background
- Montado en cada historia del perfil junto al `CommentsThread`

### 📅 "Hace X años" en el panel de cumpleaños

El popover de cumpleaños ahora abre con una sección amarilla **"📅 Hace tiempo · hoy"** mostrando nacimientos y fallecimientos del mismo día en años anteriores. Ordenado por aniversarios redondos (50, 25, 10) primero. Si la persona sigue viva, indica cuántos años cumpliría hoy.

- `getOnThisDayEvents()` server action filtrada por visibilidad
- Excluye el año actual (esos cumpleaños ya están en la lista normal)
- El dot rojo del botón 🎂 ahora también se activa si hay eventos históricos hoy

### 🧬 Calculadora de parentesco

Cuando haces click en cualquier nodo del árbol, aparece bajo el nombre un badge mostrando cómo es esa persona respecto a ti: **"tu mamá"**, **"tu primer primo"**, **"tu cuñada"**, **"tu tía abuela"**.

- Algoritmo BFS bidireccional con LCA (ancestro común más reciente)
- Mapea distancias (up, down) a categorías:
  - `(1, 0)` → padre/madre · `(0, 1)` → hijo/hija
  - `(2, 0)` → abuelo/a · etc. (bisabuelo, tatara…)
  - `(1, 1)` → hermano/a
  - `(2, 1)` → tío/a · `(1, 2)` → sobrino/a
  - `(m, n)` con `m, n ≥ 2` → primos N grado, removidos `|m-n|` veces
- Si no hay parentesco sanguíneo, busca POLÍTICO: cónyuge directo, suegro/a, cuñado/a, yerno/nuera
- Etiquetas en español con género gramatical correcto
- Badge con código de colores: verde para sangre directa, amarillo para hermanos, beige para tíos/sobrinos, rosa para políticos

### 🕒 Línea de tiempo familiar

Nueva página `/[familySlug]/timeline` que muestra **TODOS** los eventos significativos de la familia ordenados cronológicamente y agrupados por década:

- 👶 nacimientos · 🕊️ fallecimientos · 💍 matrimonios · 💔 separaciones
- Cada item linkea al perfil de la persona
- Filtrado por visibilidad (BRANCH-scoped users solo ven eventos de su rama)
- Botón **🕒 Tiempo** en el header del árbol

### 🗺️ Mapa de orígenes

Nueva página `/[familySlug]/map` que **geocodifica los lugares de nacimiento** registrados en la familia y los muestra en un mapa Leaflet:

- Geocoding lazy con Nominatim (OpenStreetMap, gratis, sin API key)
- Cache en `localStorage` por nombre de lugar (no abusa del rate limit de 1 req/sec)
- Markers tipo `circleMarker` con radio proporcional al count (más personas → círculo más grande)
- Popup con nombre del lugar, conteo y links a hasta 5 personas
- Botón **🗺️ Mapa** en el header del árbol
- Cuenta una historia migratoria visualmente potente

### 🎙️ Audio y video en perfiles

El módulo `moduleAudioVideo` que existía en el schema desde v1.0 finalmente tiene pipeline:

- **Sin transcoding del lado del servidor** — los browsers modernos reproducen MP4/WebM/MP3/M4A/AAC/OGG nativamente. Eso evita agregar ffmpeg al Docker image (~150 MB extra)
- Schema: nuevo enum `MediaKind` (`IMAGE`/`AUDIO`/`VIDEO`), columnas `kind`, `durationSec`, `posterUrl` en `Media`
- `uploadAudioVideo` server action — análoga a `uploadMedia` pero sin `sharp`
- Validación: MIME type (mp4/webm/quicktime/mp3/m4a/etc), tamaño (50 MB audio, 200 MB video), límite 30 piezas por persona
- `AudioVideoPlayer` componente con `<video controls>` o `<audio controls>` nativo, lee duración del navegador y la persiste en DB para próximas cargas
- Activación: el admin enciende `moduleAudioVideo` desde la UI cuando esté listo a usarlo (default `false`)

**Por qué importa**: para un archivo familiar genealógico, **la voz de los abuelos vale infinito más que las fotos**. Una entrevista grabada con tu abuela hablando de su mamá es algo que no recuperas si se pierde.

### 📰 Resumen semanal (newsletter)

Nueva página `/[familySlug]/digest` que agrega los cambios de los últimos 7 días en un HTML estilizado tipo email:

- Personas nuevas, contenido nuevo, conversaciones, conteo de reacciones, próximos cumpleaños
- Renderizado en iframe — vista previa exacta de cómo se vería el email cuando se active
- Mientras tanto el admin puede compartir el URL por WhatsApp

Y endpoint `/api/cron/weekly-digest` para envío automático:

- Protegido por Bearer token (`CRON_SECRET` env var)
- Si `RESEND_API_KEY` no está set → modo "preview" (devuelve summary sin enviar)
- Skip silencioso si la familia no tuvo eventos esa semana
- TODO claro en el código: cuando se agregue `User.email`, descomentar el bloque de `fetch` a Resend y queda listo
- Cron de TrueNAS recomendado: `0 9 * * 1` (cada lunes a las 9 AM)

### 🐛 Sentry error tracking

`@sentry/nextjs` configurado server + client. **Solo se activa si `SENTRY_DSN` y `NEXT_PUBLIC_SENTRY_DSN` están set en producción** — cero overhead en desarrollo.

- 10% trace sample rate — suficiente para detectar tendencias sin saturar la cuota gratuita (5K events/mes)
- Session replay 100% en errores, 0% en sesiones normales
- Ignora errores conocidos no-bug: `NEXT_REDIRECT`, `NEXT_NOT_FOUND`, "Failed to find Server Action" (browser cache), "Loading chunk failed" (durante deploys)
- Nuevo `src/app/global-error.tsx` — error boundary global que captura excepciones no manejadas y muestra pantalla amigable con el `digest` del error

### ✅ Tests automatizados — Vitest

Cobertura crítica para los algoritmos que se han roto antes:

**`tests/tree-layout.test.ts` (10 tests)** — protege contra:
- Pass 2 oscillation
- Disconnected people offset infinito
- Side-bounded layout sin un parent
- Inferred couples mal detectados

**`tests/kinship.test.ts` (13 tests)** — todos los casos del algoritmo de parentesco

```bash
npm test         # 23 tests pasan en <500 ms
npm run test:ui  # interfaz interactiva
```

Tests legacy escritos con `node:assert` siguen funcionando manualmente con `npx tsx tests/<name>.test.ts`. El config de Vitest los excluye explícitamente.

---

## Schema changes

```prisma
// Nuevos enums
enum ReactionType { HEART LAUGH WOW SAD PRAY }
enum MediaKind   { IMAGE AUDIO VIDEO }
enum NotificationType { ... + NEW_REACTION }

// Nueva tabla
model Reaction {
  userId, contentId|mediaId, type, createdAt
  @@unique([userId, contentId, type])
  @@unique([userId, mediaId, type])
}

// Media: + kind, durationSec, posterUrl
```

Aplicar con `prisma db push` desde temp `node:20-alpine` container — todo aditivo, sin pérdida de datos.

---

## Tech stack

Aditivos respecto a v3.0:

| Tecnología | Versión | Para |
|---|---|---|
| `@sentry/nextjs` | 10.51 | Error tracking (opt-in vía env) |
| `vitest` + `@vitest/ui` | 4.x | Tests unitarios |
| `leaflet` + `@types/leaflet` | 1.9 | Mapa de orígenes (~38 KB gzipped) |

No se agregó `ffmpeg` — el pipeline de audio/video evita transcoding usando elementos `<audio>`/`<video>` nativos.

---

## Configuración para producción (opcional, todo opt-in)

| Variable | Para | Default si vacío |
|---|---|---|
| `SENTRY_DSN` | Error tracking server | Sentry desactivado |
| `NEXT_PUBLIC_SENTRY_DSN` | Error tracking cliente | idem |
| `CRON_SECRET` | Newsletter cron auth | Endpoint devuelve 503 |
| `RESEND_API_KEY` | Email delivery | Newsletter en modo preview (no envía) |
| `DIGEST_FROM_EMAIL` | "From:" del email | `noreply@$APP_HOSTNAME` |

Todas son **opcionales** — la app funciona sin ninguna. Activarlas progresivamente sin redeploy.

---

## Upgrading from v3.0

1. Pull `main` (commit en tag `v3.1.0`)
2. Run `prisma db push` contra producción — additivo, no destructivo
3. Rebuild Docker: `docker compose up -d --build`
4. (Opcional) Activar `moduleAudioVideo` desde el admin para empezar a subir audios
5. (Opcional) Activar Sentry / cron / Resend según [Configuración para producción](#configuración-para-producción-opcional-todo-opt-in)

No se requiere migración de datos.

---

## Lo que sigue (post-v3.1)

Las cosas grandes que aún faltan:

- **GEDCOM import** — para multiplicar el tamaño del árbol importando de Ancestry/MyHeritage
- **Backups automáticos fuera del NAS** — protección contra falla de hardware
- **PDF "libro familiar"** generado del árbol completo
- **`User.email`** — necesario para activar el envío real del newsletter
- **Posters de video** — frame extraído como thumbnail (requiere ffmpeg)
- **Reacciones en fotos también** (componente `ReactionBar` con `mediaId` ya soporta esto, solo falta montarlo)
