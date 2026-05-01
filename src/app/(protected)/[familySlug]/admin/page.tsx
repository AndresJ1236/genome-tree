import { notFound } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getAdminDashboard } from '@/app/actions/admin'
import { AdminDashboard } from '@/components/admin/AdminDashboard'

export default async function AdminPage({
  params,
}: {
  params: Promise<{ familySlug: string }>
}) {
  const { familySlug } = await params
  const session = await getSession()
  if (!session || session.familySlug !== familySlug) notFound()

  const result = await getAdminDashboard()
  if (!result.ok) notFound()

  return (
    <div className="h-full overflow-y-auto">
      <AdminDashboard data={result.data} />
    </div>
  )
}
