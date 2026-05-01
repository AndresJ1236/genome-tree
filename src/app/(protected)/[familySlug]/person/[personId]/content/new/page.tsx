import { notFound } from 'next/navigation'
import { getSession } from '@/lib/session'
import { assertCanManagePerson } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { ContentEditor } from '@/components/forms/ContentEditor'
import type { ContentEditorData } from '@/lib/content-types'
import { getFamilyModules, getModuleForEditorType } from '@/lib/family-config'

function emptyData(type: ContentEditorData['type'], familySlug: string, personId: string): ContentEditorData {
  return {
    personId,
    familySlug,
    type,
    title: '',
    body: '',
    source: '',
    confidence: '',
    visibility: 'FAMILY',
    approximateDate: '',
    authorName: '',
    entryDate: '',
    question: '',
    notes: '',
    ingredientsText: '',
    stepsText: '',
    relatedPersonId: '',
    externalName: '',
    label: '',
    media: [],
  }
}

export default async function NewContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ familySlug: string; personId: string }>
  searchParams: Promise<{ type?: string }>
}) {
  const { familySlug, personId } = await params
  const { type } = await searchParams
  const session = await getSession()
  if (!session || session.familySlug !== familySlug) notFound()

  const validTypes = ['STORY', 'RECIPE', 'OBJECT', 'DIARY', 'INTERVIEW', 'SOURCE', 'IMPORTANT_LINK']
  if (!type || !validTypes.includes(type)) notFound()

  try {
    await assertCanManagePerson(personId, session, 'content')
  } catch {
    notFound()
  }

  const modules = await getFamilyModules(session.familyId)
  if (!modules[getModuleForEditorType(type as ContentEditorData['type'])]) {
    notFound()
  }

  const people = await prisma.person.findMany({
    where: { familyId: session.familyId },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: { id: true, firstName: true, middleName: true, lastName: true, birthDate: true, deathDate: true },
  })

  return (
    <ContentEditor
      initialData={emptyData(type as ContentEditorData['type'], familySlug, personId)}
      familySlug={familySlug}
      personId={personId}
      people={people.map(person => ({
        id: person.id,
        firstName: person.firstName,
        middleName: person.middleName,
        lastName: person.lastName,
        birthDate: person.birthDate ? person.birthDate.toISOString() : null,
        deathDate: person.deathDate ? person.deathDate.toISOString() : null,
      }))}
    />
  )
}
