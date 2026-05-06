import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { getFamilyModules } from '@/lib/family-config'
import { getVisibilityFilter, getVisiblePersonIds } from '@/lib/permissions'
import { getPersonDisplayName } from '@/lib/person-name'
import { buildSearchSnippet, normalizeSearchQuery, SEARCH_GROUP_LIMIT, SEARCH_MIN_QUERY_LENGTH, splitSearchTerms } from '@/lib/search-utils'
import type { ContentVisibility, SearchResultItem } from '@/lib/content-types'

function personYears(birthDate: Date | null, deathDate: Date | null): string | null {
  const birthYear = birthDate ? birthDate.getFullYear() : null
  const deathYear = deathDate ? deathDate.getFullYear() : null
  if (!birthYear && !deathYear) return null
  if (birthYear && deathYear) return `${birthYear}–${deathYear}`
  return birthYear ? `${birthYear}` : `† ${deathYear}`
}

function buildPersonSearchWhere(terms: string[], visibleIds: Set<string> | null, familyId: string) {
  return {
    familyId,
    deletedAt: null,
    ...(visibleIds ? { id: { in: [...visibleIds] } } : {}),
    AND: terms.map(term => ({
      OR: [
        { firstName:  { contains: term, mode: 'insensitive' as const } },
        { middleName: { contains: term, mode: 'insensitive' as const } },
        { lastName:   { contains: term, mode: 'insensitive' as const } },
        { birthPlace: { contains: term, mode: 'insensitive' as const } },
        { bio:        { contains: term, mode: 'insensitive' as const } },
      ],
    })),
  }
}

function buildContentSearchWhere(terms: string[], visibleIds: Set<string> | null, familyId: string, visibilityIn: ContentVisibility[]) {
  return {
    familyId,
    deletedAt: null,
    visibility: { in: visibilityIn },
    ...(visibleIds ? { personId: { in: [...visibleIds] } } : {}),
    AND: terms.map(term => ({
      OR: [
        { title: { contains: term, mode: 'insensitive' as const } },
        { body: { contains: term, mode: 'insensitive' as const } },
      ],
    })),
  }
}

function buildLinkSearchWhere(terms: string[], visibleIds: Set<string> | null, familyId: string, visibilityIn: ContentVisibility[]) {
  return {
    familyId,
    visibility: { in: visibilityIn },
    ...(visibleIds ? { personId: { in: [...visibleIds] } } : {}),
    AND: terms.map(term => ({
      OR: [
        { label: { contains: term, mode: 'insensitive' as const } },
        { externalName: { contains: term, mode: 'insensitive' as const } },
        { notes: { contains: term, mode: 'insensitive' as const } },
      ],
    })),
  }
}

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: 'No autenticado' }, { status: 401 })
  }

  const modules = await getFamilyModules(session.familyId)
  if (!modules.moduleSearch) {
    return NextResponse.json({ ok: false, error: 'La busqueda esta desactivada para esta familia.' }, { status: 403 })
  }

  const url = new URL(request.url)
  const query = normalizeSearchQuery(url.searchParams.get('q') ?? '')
  if (query.length < SEARCH_MIN_QUERY_LENGTH) {
    return NextResponse.json({
      ok: true,
      data: { query, people: [], content: [], links: [] },
    })
  }

  const terms = splitSearchTerms(query)
  const visibilityIn = getVisibilityFilter(session)
  const visibleIds = await getVisiblePersonIds(session)

  const [people, content, links] = await Promise.all([
    prisma.person.findMany({
      where: buildPersonSearchWhere(terms, visibleIds, session.familyId),
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: SEARCH_GROUP_LIMIT,
      select: {
        id: true,
        firstName: true,
        middleName: true,
        lastName: true,
        birthDate: true,
        deathDate: true,
      },
    }),
    prisma.content.findMany({
      where: buildContentSearchWhere(terms, visibleIds, session.familyId, visibilityIn),
      orderBy: [{ updatedAt: 'desc' }],
      take: SEARCH_GROUP_LIMIT,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        personId: true,
        person: {
          select: {
            firstName: true,
            middleName: true,
            lastName: true,
          },
        },
      },
    }),
    prisma.importantLink.findMany({
      where: buildLinkSearchWhere(terms, visibleIds, session.familyId, visibilityIn),
      orderBy: [{ updatedAt: 'desc' }],
      take: SEARCH_GROUP_LIMIT,
      select: {
        id: true,
        label: true,
        notes: true,
        externalName: true,
        personId: true,
        person: {
          select: {
            firstName: true,
            middleName: true,
            lastName: true,
          },
        },
        relatedPerson: {
          select: {
            firstName: true,
            middleName: true,
            lastName: true,
          },
        },
      },
    }),
  ])

  const peopleResults: SearchResultItem[] = people.map(person => ({
    id: person.id,
    kind: 'PERSON',
    personId: person.id,
    title: getPersonDisplayName(person),
    subtitle: personYears(person.birthDate, person.deathDate) ?? 'Persona del árbol',
    snippet: null,
    href: `/${session.familySlug}/person/${person.id}`,
  }))

  const contentLabels: Record<string, string> = {
    STORY: 'Historia',
    RECIPE: 'Receta',
    OBJECT: 'Objeto',
    DIARY: 'Diario',
    INTERVIEW: 'Entrevista',
    SOURCE: 'Fuente',
  }

  const contentResults: SearchResultItem[] = content.map(item => ({
    id: item.id,
    kind: 'CONTENT',
    personId: item.personId,
    title: item.title,
    subtitle: `${contentLabels[item.type] ?? item.type} · ${getPersonDisplayName(item.person)}`,
    snippet: buildSearchSnippet(item.body, query),
    href: `/${session.familySlug}/person/${item.personId}`,
  }))

  const linkResults: SearchResultItem[] = links.map(link => ({
    id: link.id,
    kind: 'IMPORTANT_LINK',
    personId: link.personId,
    title: link.externalName || link.label,
    subtitle: `Relacion · ${getPersonDisplayName(link.person)}`,
    snippet: buildSearchSnippet(link.notes || link.label, query) ?? (link.relatedPerson ? getPersonDisplayName(link.relatedPerson) : null),
    href: `/${session.familySlug}/person/${link.personId}`,
  }))

  return NextResponse.json({
    ok: true,
    data: {
      query,
      people: peopleResults,
      content: contentResults,
      links: linkResults,
    },
  })
}
