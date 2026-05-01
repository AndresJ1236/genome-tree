import { getSession } from '@/lib/session'
import { logout } from '@/app/actions/auth'
import { redirect } from 'next/navigation'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <header
        className="flex items-center justify-between px-6 py-4 border-b"
        style={{
          background: '#FDFAF5',
          borderColor: '#D8D3CA',
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className="text-lg tracking-widest uppercase"
            style={{ fontFamily: 'Georgia, Cambria, serif', color: '#2D4A3E' }}
          >
            Genome Tree
          </span>
          <span style={{ color: '#D8D3CA' }}>|</span>
          <nav className="flex gap-4">
            <a
              href={`/${session.familySlug}/tree`}
              className="text-xs tracking-widest uppercase transition-colors"
              style={{ color: '#6B6B6B' }}
            >
              Arbol
            </a>
            {session.role === 'ADMIN' && (
              <a
                href={`/${session.familySlug}/admin`}
                className="text-xs tracking-widest uppercase transition-colors"
                style={{ color: '#6B6B6B' }}
              >
                Administracion
              </a>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-xs" style={{ color: '#6B6B6B' }}>
            {session.role === 'ADMIN' && (
              <span
                className="mr-2 px-1.5 py-0.5 text-xs rounded-sm"
                style={{ background: '#EAF0ED', color: '#2D4A3E' }}
              >
                Admin
              </span>
            )}
          </span>
          <form action={logout}>
            <button
              type="submit"
              className="text-xs tracking-widest uppercase transition-colors"
              style={{ color: '#6B6B6B' }}
            >
              Salir
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
    </div>
  )
}
