import { NextResponse } from 'next/server'

/**
 * TEMP: Middleware-Auth deaktiviert.
 *
 * Runtime-Evidenz (Vercel Logs) zeigt, dass NextAuth Session bereits vorhanden ist,
 * aber `withAuth` (Edge) `tokenPresent: false` liefert und damit den Redirect-Loop auslöst.
 *
 * Sicherheit/Access-Control bleibt über serverseitige Guards erhalten:
 * - Admin pages: `getSession()` + `redirect('/admin/login')`
 * - Employee pages/layout: `getSession()` + `redirect('/login')`
 */
export default function middleware(req: Request) {
  try {
    const url = new URL(req.url)
    const path = url.pathname
    if (path === '/login' || path === '/admin/login' || path.startsWith('/employee') || path.startsWith('/admin')) {
      console.log('[MW] disabled - relying on server-side guards', { path })
    }
  } catch {
    // ignore
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.svg|.*\\.gif).*)'],
  // Wichtig: Debug-Route explizit erlauben
}

