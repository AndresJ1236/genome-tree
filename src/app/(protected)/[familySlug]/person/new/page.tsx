import { getSession } from '@/lib/session'
import { notFound } from 'next/navigation'
import { getPersonEditorPayload } from '@/app/actions/people'
import { PersonEditor } from '@/components/forms/PersonEditor'

export default async function NewPersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ familySlug: string }>
  searchParams: Promise<{ kind?: string }>
}) {
  const { familySlug } = await params
  const { kind } = await searchParams
  const session = await getSession()
  if (!session || session.familySlug !== familySlug) notFound()

  const result = await getPersonEditorPayload()
  if (!result.ok) notFound()

  const defaultKind = kind === 'PET' ? 'PET' : 'PERSON'

  return (
    <div className="h-full overflow-y-auto">
      <PersonEditor payload={result.data} mode="create" defaultNodeKind={defaultKind} />
    </div>
  )
}
