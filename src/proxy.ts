import { NextRequest, NextResponse } from 'next/server'
import { decrypt, createSessionToken, shouldUseSecureCookies } from '@/lib/session'

const PUBLIC_PATHS = ['/login', '/auth/login', '/setup']
const PUBLIC_PREFIXES = ['/invite/', '/reset/']

// Renovar la sesión si le quedan menos de 3 días de los 7 totales
const RENEW_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  const isPublic = PUBLIC_PATHS.includes(path) || PUBLIC_PREFIXES.some(p => path.startsWith(p))

  const token = req.cookies.get('session')?.value
  const session = await decrypt(token)

  if (!session && !isPublic) {
    const loginUrl = new URL('/login', req.nextUrl)
    loginUrl.searchParams.set('from', path)
    return NextResponse.redirect(loginUrl)
  }

  if (session && isPublic) {
    return NextResponse.redirect(
      new URL(`/${session.familySlug}/tree`, req.nextUrl)
    )
  }

  // Rolling session: si le quedan < 3 días, emitir un nuevo token transparentemente
  if (session) {
    const remainingMs = new Date(session.expiresAt).getTime() - Date.now()
    if (remainingMs > 0 && remainingMs < RENEW_THRESHOLD_MS) {
      const { token: newToken, expiresAt } = await createSessionToken({
        userId:         session.userId,
        familyId:       session.familyId,
        familySlug:     session.familySlug,
        role:           session.role,
        scope:          session.scope,
        personId:       session.personId,
        branchRootId:   session.branchRootId,
        sessionVersion: session.sessionVersion,
      })
      const response = NextResponse.next()
      response.cookies.set('session', newToken, {
        httpOnly: true,
        secure:   shouldUseSecureCookies(),
        expires:  expiresAt,
        sameSite: 'lax',
        path:     '/',
      })
      return response
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon\\.ico|uploads/).*)'],
}
