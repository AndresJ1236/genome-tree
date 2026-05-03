import { NextRequest, NextResponse } from 'next/server'
import { decrypt, createSessionToken, shouldUseSecureCookies } from '@/lib/session'

const PUBLIC_PATHS = ['/login', '/auth/login', '/setup']
const PUBLIC_PREFIXES = ['/invite/', '/reset/']
const RENEW_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000

function generateNonce(): string {
  const arr = new Uint8Array(16)
  globalThis.crypto.getRandomValues(arr)
  return btoa(String.fromCharCode(...Array.from(arr)))
}

function buildCsp(nonce: string): string {
  const appHostname = process.env.APP_HOSTNAME
  const minioEndpoint = process.env.MINIO_ENDPOINT ?? 'localhost'
  const minioPort = process.env.MINIO_PORT ?? '9000'
  const imgSrc = appHostname
    ? `img-src 'self' data: blob: https://${appHostname}`
    : `img-src 'self' data: blob: http://${minioEndpoint}:${minioPort}`

  return [
    "default-src 'self'",
    // nonce + strict-dynamic replaces unsafe-inline and unsafe-eval
    `script-src 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    imgSrc,
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

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

  // Generate per-request nonce and pass it to the app via request header.
  // Next.js App Router reads x-nonce and applies it to its own inline scripts.
  const nonce = generateNonce()
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)

  // Rolling session: renew JWT when < 3 days remain of 7
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
      const response = NextResponse.next({ request: { headers: requestHeaders } })
      response.headers.set('Content-Security-Policy', buildCsp(nonce))
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

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', buildCsp(nonce))
  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon\\.ico|uploads/).*)'],
}
