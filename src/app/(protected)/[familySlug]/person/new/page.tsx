import { getSession } from '@/lib/session'
import { notFound } from 'next/navigation'
import { getPersonEditorPayload } from '@/app/actions/people'
import { PersonEditor, type PersonEditorPrefill } from '@/components/forms/PersonEditor'

export default async function NewPersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ familySlug: string }>
  searchParams: Promise<{
    kind?:      string
    childOf?:   string
    parentOf?:  string
    siblingOf?: string
    asParent?:  string
  }>
}) {
  const { familySlug } = await params
  const sp = await searchParams
  const session = await getSession()
  if (!session || session.familySlug !== familySlug) notFound()

  const result = await getPersonEditorPayload()
  if (!result.ok) notFound()

  const defaultKind = sp.kind === 'PET' ? 'PET' : 'PERSON'

  // Pre-fill desde query params (viene del menú radial del árbol).
  // Solo uno de los 3 (childOf/parentOf/siblingOf) tiene sentido a la vez.
  const prefill: PersonEditorPrefill = {
    childOf:   sp.childOf,
    parentOf:  sp.parentOf,
    siblingOf: sp.siblingOf,
    asParent:  sp.asParent === 'mother' ? 'mother' : sp.asParent === 'father' ? 'father' : undefined,
  }

  return (
    <div className="h-full overflow-y-auto">
      <PersonEditor payload={result.data} mode="create" defaultNodeKind={defaultKind} prefill={prefill} />
    </div>
  )
}
