import { notFound } from 'next/navigation'
import { verifyInviteToken } from '@/lib/invite'
import { InviteAcceptanceForm } from '@/components/forms/InviteAcceptanceForm'

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const payload = await verifyInviteToken(token)
  if (!payload) notFound()

  return <InviteAcceptanceForm token={token} familySlug={payload.familySlug} />
}
