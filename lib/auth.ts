import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from './db'
import bcrypt from 'bcryptjs'

// Debug: Konfiguration sichtbar machen (ohne Secrets/PII)
console.log('[AuthConfig]', {
  nodeEnv: process.env.NODE_ENV,
  nextauthUrlPresent: !!process.env.NEXTAUTH_URL,
  nextauthUrlHost: (() => {
    try {
      return process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).host : null
    } catch {
      return 'invalid'
    }
  })(),
  nextauthSecretPresent: !!process.env.NEXTAUTH_SECRET,
})

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV !== 'production',
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        try {
          // #region agent log H2
          if (process.env.NODE_ENV !== 'production') fetch('http://127.0.0.1:7242/ingest/c4ee99e0-3287-4046-98fb-464abd62c89f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/auth.ts:authorize:entry',message:'authorize(credentials) called',data:{hasEmail:!!credentials?.email,hasPassword:!!credentials?.password},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H2'})}).catch(()=>{});
          // #endregion

          if (!credentials?.email || !credentials?.password) {
            console.log('[NextAuth] Fehlende Credentials')
            return null
          }

          console.log('[NextAuth] Versuche Login (credentials vorhanden)')
          
          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
            include: {
              employee: true,
              admin: true,
            },
          })

          // #region agent log H2
          if (process.env.NODE_ENV !== 'production') fetch('http://127.0.0.1:7242/ingest/c4ee99e0-3287-4046-98fb-464abd62c89f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/auth.ts:authorize:afterUserLookup',message:'user lookup done',data:{userFound:!!user,role:user?.role??null,hasEmployee:!!user?.employee,hasAdmin:!!user?.admin},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H2'})}).catch(()=>{});
          // #endregion

          if (!user) {
            console.log('[NextAuth] User nicht gefunden')
            return null
          }

          console.log('[NextAuth] User gefunden, prüfe Passwort...')
          
          const isPasswordValid = await bcrypt.compare(
            credentials.password,
            user.password
          )

          // #region agent log H2
          if (process.env.NODE_ENV !== 'production') fetch('http://127.0.0.1:7242/ingest/c4ee99e0-3287-4046-98fb-464abd62c89f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/auth.ts:authorize:afterPasswordCompare',message:'password compare done',data:{isPasswordValid:!!isPasswordValid,role:user.role},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H2'})}).catch(()=>{});
          // #endregion

          if (!isPasswordValid) {
            console.log('[NextAuth] Passwort ungültig')
            return null
          }

          console.log('[NextAuth] Login erfolgreich')
          
          return {
            id: user.id,
            email: user.email,
            name: `${user.firstName} ${user.lastName}`,
            role: user.role as 'EMPLOYEE' | 'ADMIN',
            employeeId: user.employee?.id,
            adminId: user.admin?.id,
          }
        } catch (error) {
          // #region agent log H2
          if (process.env.NODE_ENV !== 'production') fetch('http://127.0.0.1:7242/ingest/c4ee99e0-3287-4046-98fb-464abd62c89f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'lib/auth.ts:authorize:catch',message:'authorize threw',data:{errorType:error instanceof Error ? error.name : typeof error},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H2'})}).catch(()=>{});
          // #endregion
          console.error('[NextAuth] Fehler in authorize:', error)
          return null
        }
      },
    }),
  ],
  events: {
    async signIn({ user }) {
      console.log('[NextAuth] event signIn', { role: (user as any)?.role ?? null })
    },
    async signOut() {
      console.log('[NextAuth] event signOut')
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role
        token.employeeId = user.employeeId
        token.adminId = user.adminId
        console.log('[NextAuth] jwt callback set role:', user.role)
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!
        session.user.role = token.role as 'ADMIN' | 'EMPLOYEE'
        session.user.employeeId = token.employeeId as string | undefined
        session.user.adminId = token.adminId as string | undefined
        console.log('[NextAuth] session callback role:', session.user.role)
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
}

