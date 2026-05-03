import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { createSessionToken } from '@/lib/session'
import {
  checkRateLimit,
  checkUsernameRateLimit,
  recordFailure,
  recordUsernameFailure,
  recordSuccess,
  recordUsernameSuccess,
} from '@/lib/rate-limit'

function buildUrl(req: Request, path: string) {
  const url = new URL(req.url)
  const host = req.headers.get('host') ?? url.host
  const protocol = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')
  return new URL(path, `${protocol}://${host}`)
}

function shouldUseSecureCookieForRequest(req: Request) {
  const url = new URL(req.url)
  const host = req.headers.get('host') ?? url.host
  return !(host.startsWith('127.0.0.1') || host.startsWith('localhost'))
}

function getClientIp(req: Request): string {
  return (
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  )
}

export async function POST(req: Request) {
  const ip = getClientIp(req)

  // Check IP-based rate limit first (fast, no need to parse body)
  const ipCheck = checkRateLimit(ip)
  if (!ipCheck.allowed) {
    const seconds = Math.ceil((ipCheck.retryAfterMs ?? 0) / 1000)
    return NextResponse.redirect(
      buildUrl(req, `/login?error=blocked&retry=${seconds}`),
      303
    )
  }

  const formData = await req.formData()
  const username = String(formData.get('username') ?? '')
  const password = String(formData.get('password') ?? '')

  if (!username || !password) {
    return NextResponse.redirect(buildUrl(req, '/login?error=missing'), 303)
  }

  // Check per-username rate limit (blocks credential stuffing across IPs)
  const userCheck = checkUsernameRateLimit(username)
  if (!userCheck.allowed) {
    const seconds = Math.ceil((userCheck.retryAfterMs ?? 0) / 1000)
    return NextResponse.redirect(
      buildUrl(req, `/login?error=blocked&retry=${seconds}`),
      303
    )
  }

  const user = await prisma.user.findUnique({
    where: { username },
    include: { family: true },
  })

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    recordFailure(ip)
    recordUsernameFailure(username)
    return NextResponse.redirect(buildUrl(req, '/login?error=invalid'), 303)
  }

  recordSuccess(ip)
  recordUsernameSuccess(username)

  const rawFrom = String(formData.get('from') ?? '')
  const redirectTo = rawFrom.startsWith('/') && !rawFrom.startsWith('//')
    ? rawFrom
    : `/${user.family.slug}/tree`

  const { token, expiresAt } = await createSessionToken({
    userId:         user.id,
    familyId:       user.familyId,
    familySlug:     user.family.slug,
    role:           user.role,
    scope:          user.scope,
    personId:       user.personId ?? null,
    branchRootId:   user.branchRootId ?? null,
    sessionVersion: user.sessionVersion,
  })

  const response = NextResponse.redirect(buildUrl(req, redirectTo), 303)
  response.cookies.set('session', token, {
    httpOnly: true,
    secure:   shouldUseSecureCookieForRequest(req),
    expires:  expiresAt,
    sameSite: 'lax',
    path:     '/',
  })
  return response
}
