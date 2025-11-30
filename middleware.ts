import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Public routes die IMMER erlaubt sind
const publicRoutes = [
  '/',
  '/login',
  '/admin/login',
  '/test-simple',
  '/login-test',
  '/test-db',
]

function isPublicRoute(pathname: string): boolean {
  return publicRoutes.includes(pathname)
}

export default function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname

  // Öffentliche Routen IMMER durchlassen - BEVOR NextAuth greift
  if (isPublicRoute(path)) {
    return NextResponse.next()
  }

  // Static files durchlassen
  if (path.match(/\.(png|jpg|jpeg|svg|gif|ico|webp)$/i)) {
    return NextResponse.next()
  }

  // Für alle anderen Routen: NextAuth Middleware anwenden
  return withAuth(
    function middleware(req) {
      const token = req.nextauth.token
      const isAdmin = token?.role === 'ADMIN'
      const isEmployee = token?.role === 'EMPLOYEE'
      const path = req.nextUrl.pathname

      // Admin routes
      if (path.startsWith('/admin') && !isAdmin) {
        return NextResponse.redirect(new URL('/admin/login', req.url))
      }

      // Employee routes
      if (path.startsWith('/employee') && !isEmployee) {
        return NextResponse.redirect(new URL('/login', req.url))
      }

      return NextResponse.next()
    },
    {
      callbacks: {
        authorized: ({ token, req }) => {
          const path = req.nextUrl.pathname
          
          // Public routes - always allow (sollte nie hier ankommen)
          if (isPublicRoute(path)) {
            return true
          }

          // Protected routes need a token
          return !!token
        },
      },
    }
  )(req)
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.svg|.*\\.gif).*)'],
}

