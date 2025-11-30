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
}

