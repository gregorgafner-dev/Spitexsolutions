import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from './db'
import bcrypt from 'bcryptjs'

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        try {
          if (!credentials?.email || !credentials?.password) {
            console.log('[NextAuth] Fehlende Credentials')
            return null
          }

          console.log('[NextAuth] Versuche Login für:', credentials.email)
          
          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
            include: {
              employee: true,
              admin: true,
            },
          })

          if (!user) {
            console.log('[NextAuth] User nicht gefunden:', credentials.email)
            return null
          }

          console.log('[NextAuth] User gefunden, prüfe Passwort...')
          
          const isPasswordValid = await bcrypt.compare(
            credentials.password,
            user.password
          )

          if (!isPasswordValid) {
            console.log('[NextAuth] Passwort ungültig')
            return null
          }

          console.log('[NextAuth] Login erfolgreich für:', credentials.email)
          
          return {
            id: user.id,
            email: user.email,
            name: `${user.firstName} ${user.lastName}`,
            role: user.role as 'EMPLOYEE' | 'ADMIN',
            employeeId: user.employee?.id,
            adminId: user.admin?.id,
          }
        } catch (error) {
          console.error('[NextAuth] Fehler in authorize:', error)
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role
        token.employeeId = user.employeeId
        token.adminId = user.adminId
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!
        session.user.role = token.role as 'ADMIN' | 'EMPLOYEE'
        session.user.employeeId = token.employeeId as string | undefined
        session.user.adminId = token.adminId as string | undefined
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 Tage
  },
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
}

