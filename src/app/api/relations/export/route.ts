import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { getVisiblePersonIds } from '@/lib/permissions'
import { buildRelationsExportPayload } from '@/lib/relations-json'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: 'No autenticado' }, { status: 401 })
  }

  const people = await prisma.person.findMany({
    where: { familyId: session.familyId },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: {
      id: true,
      firstName: true,
      middleName: true,
      lastName: true,
      birthSurname1: true,
      birthSurname2: true,
      fatherId: true,
      motherId: true,
    },
  })

  const visibleIds = await getVisiblePersonIds(session)
  const payload = buildRelationsExportPayload(session.familySlug, people, visibleIds)
  const filename = `${session.familySlug}-relations.json`

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
