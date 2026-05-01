import { getSession } from '@/lib/session'
import { notFound } from 'next/navigation'
import { getPersonFull } from '@/app/actions/content'
import { PersonPage } from '@/components/profile/PersonPage'

export default async function PersonProfilePage({
  params,
}: {
  params: Promise<{ familySlug: string; personId: string }>
}) {
  const { familySlug, personId } = await params
  const session = await getSession()
  if (!session) notFound()

  const result = await getPersonFull(personId)
  if (!result.ok) notFound()

  return <PersonPage person={result.data} familySlug={familySlug} />
}
