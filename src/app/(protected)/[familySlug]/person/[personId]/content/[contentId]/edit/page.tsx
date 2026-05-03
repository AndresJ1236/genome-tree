import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { assertCanEditOwnedContentForPerson, assertPersonAccess } from '@/lib/permissions'
import { ContentEditor } from '@/components/forms/ContentEditor'
import type { ContentEditorData } from '@/lib/content-types'
import { getFamilyModules, getModuleForContentType, getModuleForEditorType } from '@/lib/family-config'

export default async function EditContentPage({
  params,
}: {
  params: Promise<{ familySlug: string; personId: string; contentId: string }>
}) {
  const { familySlug, personId, contentId } = await params
  const session = await getSession()
  if (!session || session.familySlug !== familySlug) notFound()

  try {
    await assertPersonAccess(personId, session)
  } catch {
    notFound()
  }

  const [content, link, people] = await Promise.all([
    prisma.content.findUnique({
      where: { id: contentId },
      include: {
        media: {
          include: { media: true },
          orderBy: { order: 'asc' },
        },
      },
    }),
    prisma.importantLink.findUnique({ where: { id: contentId } }),
    prisma.person.findMany({
      where: { familyId: session.familyId },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, middleName: true, lastName: true, birthDate: true, deathDate: true, gender: true, fatherId: true, motherId: true, nodeKind: true },
    }),
  ])

  let data: ContentEditorData | null = null
  const modules = await getFamilyModules(session.familyId)

  if (content && content.familyId === session.familyId && content.personId === personId) {
    try {
      await assertCanEditOwnedContentForPerson(content, personId, session)
    } catch {
      notFound()
    }
    if (!modules[getModuleForContentType(content.type)]) notFound()
    data = {
      personId,
      familySlug,
      type: content.type,
      title: content.title,
      body: content.body ?? '',
      source: content.source ?? '',
      confidence: (content.confidence as ContentEditorData['confidence']) ?? '',
      visibility: content.visibility,
      approximateDate: content.approximateDate ?? '',
      authorName: content.authorName ?? '',
      entryDate: content.entryDate ? content.entryDate.toISOString().slice(0, 10) : '',
      question: content.question ?? '',
      notes: content.notes ?? '',
      ingredientsText: Array.isArray(content.ingredients) ? (content.ingredients as string[]).join('\n') : '',
      stepsText: Array.isArray(content.steps) ? (content.steps as string[]).join('\n') : '',
      relatedPersonId: '',
      externalName: '',
      label: '',
      media: content.media.map(item => ({
        id: item.media.id,
        url: item.media.url,
        alt: item.media.alt,
        caption: item.media.caption,
        featured: item.media.featured,
        order: item.media.order,
        mimeType: item.media.mimeType,
      })),
    }
  }

  if (link && link.familyId === session.familyId && link.personId === personId) {
    try {
      await assertCanEditOwnedContentForPerson(link, personId, session)
    } catch {
      notFound()
    }
    if (!modules[getModuleForEditorType('IMPORTANT_LINK')]) notFound()
    data = {
      personId,
      familySlug,
      type: 'IMPORTANT_LINK',
      title: '',
      body: '',
      source: link.source ?? '',
      confidence: (link.confidence as ContentEditorData['confidence']) ?? '',
      visibility: link.visibility,
      approximateDate: '',
      authorName: '',
      entryDate: '',
      question: '',
      notes: link.notes ?? '',
      ingredientsText: '',
      stepsText: '',
      relatedPersonId: link.relatedPersonId ?? '',
      externalName: link.externalName ?? '',
      label: link.label,
      media: [],
    }
  }

  if (!data) notFound()

  return (
    <ContentEditor
      initialData={data}
      familySlug={familySlug}
      personId={personId}
      contentId={contentId}
      isAdmin={session.role === 'ADMIN'}
      people={people.map(person => ({
        id: person.id,
        firstName: person.firstName,
        middleName: person.middleName,
        lastName: person.lastName,
        birthDate: person.birthDate ? person.birthDate.toISOString() : null,
        deathDate: person.deathDate ? person.deathDate.toISOString() : null,
        gender: person.gender,
        fatherId: person.fatherId ?? null,
        motherId: person.motherId ?? null,
        nodeKind: person.nodeKind,
      }))}
    />
  )
}
