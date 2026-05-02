import { notFound } from 'next/navigation'
import { verifyResetToken } from '@/lib/reset'
import { prisma } from '@/lib/prisma'
import { ResetPasswordForm } from '@/components/forms/ResetPasswordForm'

export default async function ResetPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const payload = await verifyResetToken(token)
  if (!payload) notFound()

  const user = await prisma.user.findFirst({
    where: { id: payload.userId, familyId: payload.familyId },
    select: { username: true },
  })
  if (!user) notFound()

  return <ResetPasswordForm token={token} username={user.username} />
}
