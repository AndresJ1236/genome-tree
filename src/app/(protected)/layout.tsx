import { getSession } from '@/lib/session'
import { getUnreadCount } from '@/lib/notifications'
import { AppHeader } from '@/components/ui/AppHeader'
import { redirect } from 'next/navigation'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const unreadCount = await getUnreadCount(session.userId)

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <AppHeader
        familySlug={session.familySlug}
        role={session.role}
        unreadCount={unreadCount}
      />
      <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
    </div>
  )
}
