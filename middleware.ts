import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

// Public routes die IMMER erlaubt sind
const publicRoutes = [
  '/',
  '/login',
  '/admin/login',
  '/test-simple',
  '/login-test',
  '/test-db',
  '/debug',
]

function isPublicRoute(pathname: string): boolean {
  return publicRoutes.includes(pathname)
}

export default withAuth(
  function middleware(req) {
    const path = req.nextUrl.pathname
    const token = req.nextauth.token
    const isAdmin = token?.role === 'ADMIN'
    const isEmployee = token?.role === 'EMPLOYEE'

    // #region agent log H4
    if (process.env.NODE_ENV !== 'production') fetch('http://127.0.0.1:7242/ingest/c4ee99e0-3287-4046-98fb-464abd62c89f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'middleware.ts:middleware',message:'middleware check',data:{path,isPublic:isPublicRoute(path),tokenPresent:!!token,role:(token as any)?.role??null,isAdmin,isEmployee},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
    if (path === '/login' || path === '/admin/login' || path.startsWith('/employee') || path.startsWith('/admin')) {
      const cookieNames = req.cookies.getAll().map((c) => c.name).filter((n) => n.includes('next-auth') || n.includes('nextauth'))
      const hasSessionTokenCookie = cookieNames.some((n) => n.includes('session-token'))
      console.log('[MW] auth-check', { path, isPublic: isPublicRoute(path), tokenPresent: !!token, role: (token as any)?.role ?? null, hasSessionTokenCookie })
      console.log('[MW] cookies', { path, cookieNames })
      console.log('[MW] env', { nextauthSecretPresent: !!process.env.NEXTAUTH_SECRET, nextauthUrlPresent: !!process.env.NEXTAUTH_URL })
    }

    // Öffentliche Routen IMMER durchlassen
    if (isPublicRoute(path)) {
      return NextResponse.next()
    }

    // Static files durchlassen
    if (path.match(/\.(png|jpg|jpeg|svg|gif|ico|webp)$/i)) {
      return NextResponse.next()
    }

    // Admin routes
    if (path.startsWith('/admin') && !isAdmin) {
      console.log('[MW] redirect -> /admin/login', { path, tokenPresent: !!token, role: (token as any)?.role ?? null })
      return NextResponse.redirect(new URL('/admin/login', req.url))
    }

    // Employee routes
    if (path.startsWith('/employee') && !isEmployee) {
      console.log('[MW] redirect -> /login', { path, tokenPresent: !!token, role: (token as any)?.role ?? null })
      return NextResponse.redirect(new URL('/login', req.url))
    }

    return NextResponse.next()
  },
  {
    secret: process.env.NEXTAUTH_SECRET,
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname
        if (path.startsWith('/admin') || path.startsWith('/employee') || path === '/login' || path === '/admin/login') {
          console.log('[MW] authorized()', { path, tokenPresent: !!token, role: (token as any)?.role ?? null })
        }
        
        // Public routes - IMMER erlauben, auch ohne Token
        if (isPublicRoute(path)) {
          return true
        }

        // Static files erlauben
        if (path.match(/\.(png|jpg|jpeg|svg|gif|ico|webp)$/i)) {
          return true
        }

        // Protected routes need a token
        return !!token
      },
    },
  }
)

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.svg|.*\\.gif).*)'],
  // Wichtig: Debug-Route explizit erlauben
}

