import { NextRequest, NextResponse } from 'next/server'
import { decrypt } from '@/lib/session'

const PUBLIC_PATHS = ['/login', '/auth/login']

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  const isPublic = PUBLIC_PATHS.includes(path)

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

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon\\.ico).*)'],
}
