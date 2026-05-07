import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { exportGedcom } from '@/lib/gedcom-export'

/**
 * GET /api/gedcom/export
 * Devuelve el árbol completo de la familia del usuario en formato GEDCOM 5.5.1.
 * Solo admins pueden exportar (contiene info personal de toda la familia).
 */
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: 'No autenticado' }, { status: 401 })
  }

  const isAdmin = session.role === 'ADMIN' || session.scope === 'ADMIN'
  if (!isAdmin) {
    return NextResponse.json(
      { ok: false, error: 'Solo administradores pueden exportar el árbol completo.' },
      { status: 403 }
    )
  }

  try {
    const gedcom = await exportGedcom(session.familyId)
    const filename = `${session.familySlug}-${new Date().toISOString().slice(0, 10)}.ged`

    return new NextResponse(gedcom, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: unknown) {
    console.error('[gedcom/export] Error:', e)
    return NextResponse.json(
      { ok: false, error: 'Error al generar el archivo GEDCOM.' },
      { status: 500 }
    )
  }
}
