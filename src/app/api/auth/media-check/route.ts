import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

// Used by nginx auth_request to gate /media/ access.
// Returns 200 if the request carries a valid session cookie, 401 otherwise.
// nginx passes the original Cookie header via proxy_set_header Cookie $http_cookie.
export async function GET() {
  const session = await getSession()
  if (!session) {
    return new NextResponse(null, { status: 401 })
  }
  return new NextResponse(null, { status: 200 })
}
