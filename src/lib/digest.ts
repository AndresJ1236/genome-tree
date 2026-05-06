import 'server-only'

import { prisma } from '@/lib/prisma'
import { getPersonDisplayName } from '@/lib/person-name'

export interface DigestData {
  familyName:    string
  familySlug:    string
  rangeStart:    Date
  rangeEnd:      Date
  newPeople:     Array<{ id: string; fullName: string; addedBy: string }>
  newContent:    Array<{ id: string; type: string; title: string; personId: string; personName: string; authorName: string }>
  newComments:   Array<{ id: string; preview: string; personId: string; personName: string; authorName: string }>
  newReactions:  number
  upcomingBirthdays: Array<{ personId: string; fullName: string; day: number; month: number; age: number | null }>
  totalEvents:   number
}

/**
 * Recolecta los cambios de la última semana en una familia para construir
 * un resumen / newsletter. La fecha por defecto es 7 días atrás.
 *
 * Esta función es la fuente única que alimenta tanto la página /digest
 * (vista on-demand) como el endpoint /api/cron/weekly-digest (email cuando
 * se active).
 */
export async function buildWeeklyDigest(familyId: string, sinceDays = 7): Promise<DigestData | null> {
  const family = await prisma.family.findUnique({
    where:  { id: familyId },
    select: { name: true, slug: true },
  })
  if (!family) return null

  const rangeEnd = new Date()
  const rangeStart = new Date(rangeEnd.getTime() - sinceDays * 24 * 60 * 60 * 1000)

  const [persons, content, comments, reactionCount] = await Promise.all([
    prisma.person.findMany({
      where: {
        familyId,
        deletedAt: null,
        createdAt: { gte: rangeStart },
      },
      select: {
        id: true, firstName: true, middleName: true, lastName: true,
        // No tenemos un campo "createdBy" en Person; el audit log lo tendría,
        // pero para v1 dejamos "alguien" si no podemos resolver
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.content.findMany({
      where: {
        familyId,
        deletedAt: null,
        createdAt: { gte: rangeStart },
      },
      select: {
        id: true,
        type: true,
        title: true,
        personId: true,
        person: { select: { firstName: true, middleName: true, lastName: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    prisma.comment.findMany({
      where: {
        familyId,
        deletedAt: null,
        createdAt: { gte: rangeStart },
      },
      select: {
        id: true,
        body: true,
        author: { select: { name: true } },
        content: {
          select: {
            personId: true,
            person: { select: { firstName: true, middleName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.reaction.count({
      where: { familyId, createdAt: { gte: rangeStart } },
    }),
  ])

  // Próximos cumpleaños — siguiente semana después del rango
  const upcomingEnd = new Date(rangeEnd.getTime() + 7 * 24 * 60 * 60 * 1000)
  const allPeopleWithBirth = await prisma.person.findMany({
    where: {
      familyId,
      deletedAt: null,
      birthDate: { not: null },
      deathDate: null,
    },
    select: { id: true, firstName: true, middleName: true, lastName: true, birthDate: true },
  })
  const todayMonth = rangeEnd.getMonth()
  const todayDay   = rangeEnd.getDate()
  const upcomingBirthdays = allPeopleWithBirth
    .map(p => {
      if (!p.birthDate) return null
      const bd = new Date(p.birthDate)
      const m = bd.getMonth()
      const d = bd.getDate()
      // Construir fecha del cumple este año
      const thisYear = rangeEnd.getFullYear()
      const next = new Date(thisYear, m, d)
      // Si ya pasó, considerar el del año siguiente
      const target = next < rangeEnd ? new Date(thisYear + 1, m, d) : next
      // Solo si está dentro del rango "próximos 7 días"
      if (target < rangeEnd || target > upcomingEnd) return null
      const age = target.getFullYear() - bd.getFullYear()
      return {
        personId: p.id,
        fullName: getPersonDisplayName({ firstName: p.firstName, middleName: p.middleName, lastName: p.lastName }),
        day:      d,
        month:    m + 1,
        age,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => {
      // Ordenar por proximidad al hoy
      const aDays = (a.month - todayMonth - 1) * 31 + (a.day - todayDay)
      const bDays = (b.month - todayMonth - 1) * 31 + (b.day - todayDay)
      return aDays - bDays
    })

  return {
    familyName: family.name,
    familySlug: family.slug,
    rangeStart,
    rangeEnd,
    newPeople: persons.map(p => ({
      id:       p.id,
      fullName: getPersonDisplayName({ firstName: p.firstName, middleName: p.middleName, lastName: p.lastName }),
      addedBy:  'la familia',
    })),
    newContent: content.map(c => ({
      id:         c.id,
      type:       c.type,
      title:      c.title,
      personId:   c.personId,
      personName: getPersonDisplayName({ firstName: c.person.firstName, middleName: c.person.middleName, lastName: c.person.lastName }),
      authorName: c.createdBy.name,
    })),
    newComments: comments.map(c => ({
      id:         c.id,
      preview:    c.body.slice(0, 100),
      personId:   c.content.personId,
      personName: getPersonDisplayName({ firstName: c.content.person.firstName, middleName: c.content.person.middleName, lastName: c.content.person.lastName }),
      authorName: c.author.name,
    })),
    newReactions:      reactionCount,
    upcomingBirthdays: upcomingBirthdays.slice(0, 10),
    totalEvents:       persons.length + content.length + comments.length + reactionCount,
  }
}

const CONTENT_LABELS: Record<string, string> = {
  STORY: 'historia',
  RECIPE: 'receta',
  DIARY: 'entrada de diario',
  INTERVIEW: 'entrevista',
  OBJECT: 'objeto',
  SOURCE: 'fuente',
}

/**
 * Renderiza el digest a HTML inline-styled (compatible con clientes de email).
 * Esta misma función alimenta la pagina y el email.
 */
export function renderDigestHtml(digest: DigestData, baseUrl: string): string {
  const { familyName, familySlug, newPeople, newContent, newComments, newReactions, upcomingBirthdays, totalEvents } = digest
  const fmt = (d: Date) => d.toLocaleDateString('es', { day: 'numeric', month: 'long' })

  const link = (path: string) => `${baseUrl}/${familySlug}${path}`

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Resumen semanal · ${escapeHtml(familyName)}</title>
</head>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:Georgia,serif;color:#2C2C2C">
<div style="max-width:600px;margin:0 auto;background:#FFFDF9;border:1px solid #E0DAD0">

  <header style="background:#2D4A3E;color:#fff;padding:24px 28px;text-align:center">
    <h1 style="margin:0;font-size:22px;font-weight:600;letter-spacing:0.04em">
      ${escapeHtml(familyName)}
    </h1>
    <p style="margin:6px 0 0;font-size:12px;color:rgba(255,255,255,0.7);letter-spacing:0.06em;text-transform:uppercase">
      Resumen semanal · ${fmt(digest.rangeStart)} – ${fmt(digest.rangeEnd)}
    </p>
  </header>

  ${totalEvents === 0
    ? `<div style="padding:40px 28px;text-align:center;color:#8B9E94;font-size:14px;line-height:1.6">
         No hubo movimientos esta semana.<br>
         <a href="${link('/tree')}" style="color:#2D4A3E;text-decoration:underline">Visita el árbol</a> y aporta algo nuevo 🌳
       </div>`
    : `<div style="padding:24px 28px">

  ${newPeople.length > 0 ? `
    <section style="margin-bottom:24px">
      <h2 style="margin:0 0 12px;font-size:16px;font-weight:600;color:#2D4A3E;border-bottom:1px solid #E0DAD0;padding-bottom:6px">
        👤 Nuevas personas (${newPeople.length})
      </h2>
      <ul style="list-style:none;padding:0;margin:0">
        ${newPeople.map(p => `
          <li style="padding:6px 0;font-size:14px">
            <a href="${link('/person/' + p.id)}" style="color:#2D4A3E;text-decoration:none">→ ${escapeHtml(p.fullName)}</a>
          </li>
        `).join('')}
      </ul>
    </section>
  ` : ''}

  ${newContent.length > 0 ? `
    <section style="margin-bottom:24px">
      <h2 style="margin:0 0 12px;font-size:16px;font-weight:600;color:#2D4A3E;border-bottom:1px solid #E0DAD0;padding-bottom:6px">
        📄 Contenido nuevo (${newContent.length})
      </h2>
      <ul style="list-style:none;padding:0;margin:0">
        ${newContent.map(c => `
          <li style="padding:8px 0;font-size:14px;border-bottom:1px solid #F0EDE5">
            <a href="${link('/person/' + c.personId)}" style="color:#2D4A3E;text-decoration:none">
              <strong>${escapeHtml(c.title)}</strong>
            </a>
            <div style="font-size:11px;color:#8B9E94;margin-top:2px">
              ${CONTENT_LABELS[c.type] ?? 'contenido'} · sobre ${escapeHtml(c.personName)} · por ${escapeHtml(c.authorName)}
            </div>
          </li>
        `).join('')}
      </ul>
    </section>
  ` : ''}

  ${newComments.length > 0 ? `
    <section style="margin-bottom:24px">
      <h2 style="margin:0 0 12px;font-size:16px;font-weight:600;color:#2D4A3E;border-bottom:1px solid #E0DAD0;padding-bottom:6px">
        💬 Conversaciones (${newComments.length})
      </h2>
      <ul style="list-style:none;padding:0;margin:0">
        ${newComments.slice(0, 8).map(c => `
          <li style="padding:8px 12px;background:#FAF7F0;border:1px solid #E0DAD0;border-radius:3px;margin-bottom:6px">
            <div style="font-size:11px;color:#2D4A3E;margin-bottom:4px">
              <strong>${escapeHtml(c.authorName)}</strong> en historia de ${escapeHtml(c.personName)}
            </div>
            <p style="margin:0;font-size:13px;color:#2C2C2C;line-height:1.4">
              "${escapeHtml(c.preview)}${c.preview.length >= 100 ? '...' : ''}"
            </p>
          </li>
        `).join('')}
      </ul>
    </section>
  ` : ''}

  ${newReactions > 0 ? `
    <p style="margin:16px 0;padding:10px 14px;background:#FFF8E6;border:1px solid #E8D68A;border-radius:3px;font-size:13px;color:#8B6411;text-align:center">
      ❤️ ${newReactions} ${newReactions === 1 ? 'nueva reacción' : 'nuevas reacciones'} esta semana
    </p>
  ` : ''}

  ${upcomingBirthdays.length > 0 ? `
    <section style="margin-bottom:24px">
      <h2 style="margin:0 0 12px;font-size:16px;font-weight:600;color:#2D4A3E;border-bottom:1px solid #E0DAD0;padding-bottom:6px">
        🎂 Próximos cumpleaños
      </h2>
      <ul style="list-style:none;padding:0;margin:0">
        ${upcomingBirthdays.map(b => `
          <li style="padding:6px 0;font-size:13px">
            <a href="${link('/person/' + b.personId)}" style="color:#2D4A3E;text-decoration:none">
              <strong>${b.day}/${b.month}</strong> · ${escapeHtml(b.fullName)}${b.age != null ? ` cumple ${b.age}` : ''}
            </a>
          </li>
        `).join('')}
      </ul>
    </section>
  ` : ''}

      </div>`}

  <footer style="background:#FAF7F0;padding:18px 28px;border-top:1px solid #E0DAD0;text-align:center">
    <p style="margin:0;font-size:11px;color:#8B9E94;line-height:1.6">
      <a href="${link('/tree')}" style="color:#2D4A3E;text-decoration:underline">Visitar el árbol</a> ·
      <a href="${link('/timeline')}" style="color:#2D4A3E;text-decoration:underline">Línea de tiempo</a> ·
      <a href="${link('/map')}" style="color:#2D4A3E;text-decoration:underline">Mapa de orígenes</a>
    </p>
    <p style="margin:8px 0 0;font-size:10px;color:#9B9B9B">
      Genome Tree · Archivo familiar privado
    </p>
  </footer>
</div>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
