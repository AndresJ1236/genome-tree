# Arquitectura de Genome Tree

## Stack tecnológico

| Capa | Tecnología | Versión | Notas |
|---|---|---|---|
| Framework | Next.js | 16.2.4 | App Router, Server Components, Server Actions |
| Runtime | React | 19.2.4 | — |
| Estilos | Tailwind CSS | v4 | Usa `@theme` en globals.css, sin tailwind.config.ts |
| ORM | Prisma | 7.8.0 | Requiere `prisma.config.ts` + driver adapter |
| Driver DB | `@prisma/adapter-pg` + `pg` | 7.8.0 / 8.x | Prisma v7 ya no acepta URL directa en schema |
| Base de datos | PostgreSQL | 18 | Instancia local en Windows |
| Autenticación | `jose` (JWT) | 6.x | Sesiones stateless en cookie httpOnly, sin NextAuth |
| Almacenamiento | MinIO (futuro) | — | S3-compatible, auto-hospedado |
| Contenedor | Docker + Nginx | — | Para producción en el servidor doméstico |

---

## Decisiones de diseño clave

### Multi-tenant por `familyId`
Cada recurso (Person, Relationship, Content, Media) lleva `familyId`. La sesión JWT incluye `familySlug` para que el proxy pueda redirigir sin consultar la base de datos en cada request.

### Prisma v7 — cambios importantes
- El datasource en `schema.prisma` **no lleva `url`**. La URL va en `prisma.config.ts` vía `defineConfig({ datasource: { url } })`.
- `dotenv` debe llamarse **antes** de `defineConfig` en `prisma.config.ts` porque el CLI de Prisma no carga `.env` automáticamente al evaluar ese archivo.
- `PrismaClient` requiere un driver adapter: `new PrismaPg({ connectionString })`.

### Next.js 16 — cambios importantes
- `middleware.ts` fue renombrado a `proxy.ts` con export nombrado `proxy`.
- `params` en páginas es ahora `Promise<{ slug: string }>` — debe hacerse `await params`.
- Las Server Actions se definen con `'use server'` como en versiones anteriores.

### Sesiones JWT con `jose`
Cookie `session` httpOnly, sameSite: lax, 7 días de expiración. El payload incluye: `userId`, `familyId`, `familySlug`, `role`, `scope`, `personId`, `branchRootId`. No hay refresh token — al expirar se redirige a login.

### Árbol genealógico — motor de layout custom
Se descartó React Flow para tener control total sobre la estética. El motor propio vive en `src/lib/tree-layout.ts` e implementa:
1. Construcción de mapas de adyacencia (padres, hijos, cónyuges)
2. BFS para asignar generaciones (cónyuges reciben la misma generación)
3. Ordenamiento dentro de generaciones: primero por año de nacimiento, luego agrupando cónyuges adyacentes
4. Posicionamiento X de abajo hacia arriba: padres se centran sobre sus hijos
5. Paso de separación (forward pass) para resolver superposiciones
6. Centrado horizontal global alrededor de 0

Las ramas son paths SVG con curvas cúbicas de Bézier. La animación "crece" usa el truco `pathLength="1"` + `strokeDasharray: 1` → `strokeDashoffset: 1→0` en CSS.

---

## Estructura de archivos

```
genome-tree/
├── prisma/
│   ├── schema.prisma          # Modelos: Family, Person, Relationship, User, Content, Media
│   └── seed.ts                # 3 generaciones, 13 personas (Familia Martínez-Santos)
├── prisma.config.ts           # Config de Prisma v7 con datasource URL
├── src/
│   ├── app/
│   │   ├── globals.css        # Tailwind v4 @theme + animaciones del árbol
│   │   ├── layout.tsx         # Root layout (html, body)
│   │   ├── page.tsx           # Redirect → /[familySlug]/tree
│   │   ├── login/
│   │   │   └── page.tsx       # Formulario de login (useActionState)
│   │   ├── actions/
│   │   │   └── auth.ts        # Server Actions: login(), logout()
│   │   └── (protected)/
│   │       ├── layout.tsx     # Header con logo, nav, botón salir
│   │       └── [familySlug]/
│   │           └── tree/
│   │               └── page.tsx  # Carga personas+relaciones de DB → FamilyTree
│   ├── components/
│   │   └── tree/
│   │       ├── FamilyTree.tsx    # Canvas principal: pan/zoom, capas SVG+HTML
│   │       ├── FamilyEdges.tsx   # Ramas SVG orgánicas (Bézier cúbico + cuadrático)
│   │       └── PersonNode.tsx    # Nodo circular con iniciales, nombre, años
│   ├── lib/
│   │   ├── prisma.ts          # Singleton de PrismaClient con adapter PG
│   │   ├── session.ts         # JWT encrypt/decrypt, createSession, getSession
│   │   ├── tree-layout.ts     # Motor de layout del árbol
│   │   └── tree-types.ts      # Interfaces: PersonData, RelationshipData, LayoutNode, etc.
│   └── proxy.ts               # Middleware Next.js 16: protección de rutas
├── docs/                      # Esta carpeta
├── next.config.ts             # output: standalone, remotePatterns MinIO
├── docker-compose.yml         # Producción: app + PostgreSQL + MinIO + Nginx
└── nginx/                     # Config de Nginx para producción
```

---

## Modelo de datos

```
Family (tenant raíz)
  ├── Person (nodo del árbol)
  │     ├── Relationship → Person (PARENT_CHILD | SPOUSE | PARTNER)
  │     ├── Content (STORY | RECIPE | OBJECT | DIARY | INTERVIEW | SOURCE)
  │     │     └── ContentMedia → Media
  │     └── Media (archivo en MinIO)
  └── User (cuenta de acceso)
        ├── role: ADMIN | MEMBER
        ├── scope: ADMIN | FAMILY | BRANCH
        └── branchRootId → Person (raíz de rama para scope BRANCH)
```

### Regla de legado
Cada `Content` tiene `lockedAt = createdAt + 10 días`. Pasada esa fecha, solo ADMIN puede editar. Preserva la integridad histórica del archivo.

---

## Flujo de autenticación

```
Request → proxy.ts
  ├── Sin cookie session → redirect /login
  ├── Con cookie session válida en /login → redirect /[familySlug]/tree
  └── Con cookie válida → pasa request

/login POST → Server Action login()
  ├── Verifica email+password contra DB (bcrypt)
  ├── Crea JWT → cookie httpOnly
  └── redirect /[familySlug]/tree
```
