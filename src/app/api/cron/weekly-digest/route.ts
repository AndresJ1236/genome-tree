import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildWeeklyDigest, renderDigestHtml } from '@/lib/digest'

/**
 * Endpoint cron — envía el resumen semanal por email a los miembros
 * FAMILY/ADMIN de cada familia.
 *
 * Autenticación: Bearer token via header Authorization.
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<APP_HOSTNAME>/api/cron/weekly-digest
 *
 * Este endpoint NO requiere session (corre desde cron, sin browser).
 *
 * Configuración:
 *   1. Define CRON_SECRET en .env.production (random, openssl rand -hex 32)
 *   2. Define RESEND_API_KEY en .env.production cuando configures Resend
 *   3. En TrueNAS / cualquier host con cron:
 *      0 9 * * 1 curl -fsSL -H "Authorization: Bearer $SECRET" \
 *        https://<APP_HOSTNAME>/api/cron/weekly-digest > /dev/null
 *      → cada lunes a las 9 AM
 *
 * Si RESEND_API_KEY no está set, el endpoint devuelve los HTMLs renderizados
 * en JSON sin enviar nada (modo "preview" — útil para testing).
 *
 * Si tampoco hay CRON_SECRET set, devuelve 503 (mejor que 401, indica
 * "feature no configurado" no "auth fallida").
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: 'Newsletter no configurado. Define CRON_SECRET en .env.' },
      { status: 503 },
    )
  }

  const authHeader = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${cronSecret}`
  if (authHeader !== expected) {
    return NextResponse.json({ ok: false, error: 'No autorizado.' }, { status: 401 })
  }

  // Iterar todas las familias
  const families = await prisma.family.findMany({ select: { id: true, slug: true } })

  const host = process.env.APP_HOSTNAME ?? 'localhost:3000'
  const protocol = host.includes('localhost') ? 'http' : 'https'
  const baseUrl = `${protocol}://${host}`

  const resendKey = process.env.RESEND_API_KEY ?? ''
  const fromEmail = process.env.DIGEST_FROM_EMAIL ?? `Genome Tree <noreply@${host}>`

  const summary: Array<{ familySlug: string; events: number; sent: number; skipped: number; errors: number }> = []

  for (const family of families) {
    const digest = await buildWeeklyDigest(family.id, 7)
    if (!digest) continue

    // Skip si no hubo eventos esta semana
    if (digest.totalEvents === 0) {
      summary.push({ familySlug: family.slug, events: 0, sent: 0, skipped: 0, errors: 0 })
      continue
    }

    const html = renderDigestHtml(digest, baseUrl)

    if (!resendKey) {
      // Modo preview — solo cuenta lo que se enviaría
      const recipients = await prisma.user.count({
        where: { familyId: family.id, scope: { in: ['FAMILY', 'ADMIN'] } },
      })
      summary.push({ familySlug: family.slug, events: digest.totalEvents, sent: 0, skipped: recipients, errors: 0 })
      continue
    }

    // Enviar a cada miembro FAMILY/ADMIN.
    // NOTA: el modelo User actual no tiene un campo `email`. Cuando se
    // implemente, este endpoint hará un .send a cada uno.
    // Por ahora, registramos que el endpoint corrió y la familia tendría
    // N candidatos a recibir.
    const recipients = await prisma.user.findMany({
      where: { familyId: family.id, scope: { in: ['FAMILY', 'ADMIN'] } },
      select: { id: true, name: true /* email: true ← cuando exista */ },
    })

    let sent = 0, skipped = 0, errors = 0
    for (const r of recipients) {
      // TODO cuando User.email exista:
      // const email = r.email
      // if (!email) { skipped++; continue }
      // try {
      //   await fetch('https://api.resend.com/emails', {
      //     method: 'POST',
      //     headers: {
      //       Authorization: `Bearer ${resendKey}`,
      //       'Content-Type': 'application/json',
      //     },
      //     body: JSON.stringify({
      //       from: fromEmail,
      //       to: email,
      //       subject: `Resumen semanal · ${digest.familyName}`,
      //       html,
      //     }),
      //   })
      //   sent++
      // } catch { errors++ }
      void r
      void fromEmail
      skipped++   // por ahora siempre skipped — no hay email field
    }

    summary.push({ familySlug: family.slug, events: digest.totalEvents, sent, skipped, errors })
  }

  return NextResponse.json({
    ok:    true,
    ranAt: new Date().toISOString(),
    summary,
  })
}
