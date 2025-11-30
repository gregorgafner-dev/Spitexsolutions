import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const isAdmin = token?.role === 'ADMIN'
    const isEmployee = token?.role === 'EMPLOYEE'
    const path = req.nextUrl.pathname

    // Public routes - allow access without redirect
    if (path === '/' || 
        path === '/login' || 
        path === '/admin/login' ||
        path === '/test-simple' ||
        path === '/login-test' ||
        path === '/test-db') {
      return NextResponse.next()
    }

    // Allow static files (images, etc.)
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
        
        // Public routes - always allow
        if (path === '/' || 
            path === '/login' || 
            path === '/admin/login' ||
            path === '/test-simple' ||
            path === '/login-test' ||
            path === '/test-db') {
          return true
        }

        // Allow static files (images, etc.)
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

