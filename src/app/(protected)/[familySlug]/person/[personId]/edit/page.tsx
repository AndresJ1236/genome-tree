import { getSession } from '@/lib/session'
import { notFound } from 'next/navigation'
import { getPersonEditorPayload } from '@/app/actions/people'
import { PersonEditor } from '@/components/forms/PersonEditor'

export default async function EditPersonPage({
  params,
}: {
  params: Promise<{ familySlug: string; personId: string }>
}) {
  const { familySlug, personId } = await params
  const session = await getSession()
  if (!session || session.familySlug !== familySlug) notFound()

  const result = await getPersonEditorPayload(personId)
  if (!result.ok) notFound()

  return (
    <div className="h-full overflow-y-auto">
      <PersonEditor payload={result.data} mode="edit" />
    </div>
  )
}
