import { getSession } from '@/lib/session'
import { notFound } from 'next/navigation'
import { getPersonEditorPayload } from '@/app/actions/people'
import { PersonEditor } from '@/components/forms/PersonEditor'

export default async function NewPersonPage({
  params,
}: {
  params: Promise<{ familySlug: string }>
}) {
  const { familySlug } = await params
  const session = await getSession()
  if (!session || session.familySlug !== familySlug) notFound()

  const result = await getPersonEditorPayload()
  if (!result.ok) notFound()

  return (
    <div className="h-full overflow-y-auto">
      <PersonEditor payload={result.data} mode="create" />
    </div>
  )
}
