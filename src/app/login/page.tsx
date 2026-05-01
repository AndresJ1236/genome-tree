interface LoginPageProps {
  searchParams?: Promise<{
    error?: string
  }>
}

function getErrorMessage(error?: string) {
  switch (error) {
    case 'missing':
      return 'Completa todos los campos'
    case 'invalid':
      return 'Correo o contrasena incorrectos'
    default:
      return null
  }
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : undefined
  const errorMessage = getErrorMessage(params?.error)

  return (
    <div className="min-h-full flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1
            className="text-3xl tracking-widest uppercase mb-2"
            style={{ fontFamily: 'Georgia, Cambria, serif', color: '#2D4A3E' }}
          >
            Genome Tree
          </h1>
          <p
            className="text-xs tracking-[0.25em] uppercase"
            style={{ color: '#6B6B6B' }}
          >
            Archivo Familiar Privado
          </p>
        </div>

        <div
          className="rounded-sm px-8 py-10"
          style={{
            background: '#FDFAF5',
            border: '1px solid #D8D3CA',
            boxShadow: '0 2px 16px rgba(44,44,44,0.06)',
          }}
        >
          <form action="/auth/login" method="post" className="flex flex-col gap-6">
            {errorMessage && (
              <p
                className="text-sm text-center py-2 px-3 rounded-sm"
                style={{ background: '#FBF0EE', color: '#8B3A2F', border: '1px solid #E8C8C0' }}
              >
                {errorMessage}
              </p>
            )}

            <div className="flex flex-col gap-1">
              <label
                htmlFor="email"
                className="text-xs tracking-widest uppercase"
                style={{ color: '#6B6B6B' }}
              >
                Correo
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full bg-transparent py-2 text-sm outline-none transition-colors"
                style={{
                  borderBottom: '1px solid #D8D3CA',
                  color: '#2C2C2C',
                }}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor="password"
                className="text-xs tracking-widest uppercase"
                style={{ color: '#6B6B6B' }}
              >
                Contrasena
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="w-full bg-transparent py-2 text-sm outline-none transition-colors"
                style={{
                  borderBottom: '1px solid #D8D3CA',
                  color: '#2C2C2C',
                }}
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 text-xs tracking-widest uppercase transition-colors mt-2"
              style={{
                background: '#2D4A3E',
                color: '#F5F0E8',
                letterSpacing: '0.2em',
              }}
            >
              Ingresar
            </button>
          </form>
        </div>

        <p
          className="text-center text-xs mt-6"
          style={{ color: '#6B6B6B' }}
        >
          Acceso restringido - solo miembros autorizados
        </p>
      </div>
    </div>
  )
}
