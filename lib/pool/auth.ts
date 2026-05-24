/**
 * Pool-Auth – eigene Authentifizierung für den Spitex-Zürichsee-Pool.
 *
 * Vollständig getrennt von NextAuth (das Spitex-Domus-System bleibt
 * unangetastet). Eigener JWT-Cookie `pool-session`, eigenes Secret
 * `POOL_AUTH_SECRET`, eigene `pool_users`-Tabelle.
 *
 * Verwendung:
 *   - `loginPoolUser(email, password)` prüft Credentials und gibt ein
 *     `PoolSession`-Objekt zurück, das via `setPoolSessionCookie()` als
 *     HTTP-only Cookie gesetzt werden kann.
 *   - In Server-Components/Routes: `getPoolSession()` liefert die Session
 *     oder `null`, wenn kein gültiger Cookie vorhanden ist.
 *   - `clearPoolSessionCookie()` für Logout.
 *
 * Hinweise:
 *   - JWT mit HS256 über das `jose`-Paket (transitive Abhängigkeit von
 *     next-auth, daher bereits vorhanden).
 *   - Cookie-Lebensdauer: 7 Tage, sliding refresh via erneutes Setzen
 *     bei jeder geschützten Anfrage durch das Layout.
 */

import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'

export const POOL_SESSION_COOKIE = 'pool-session'
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60 // 7 Tage

export type PoolUserRole = 'PLANNER' | 'MEMBER'

export type PoolSession = {
  poolUserId: string
  email: string
  firstName: string
  lastName: string
  role: PoolUserRole
}

function getSecret(): Uint8Array {
  const secret = process.env.POOL_AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (!secret) {
    throw new Error(
      'POOL_AUTH_SECRET (oder NEXTAUTH_SECRET) ist nicht gesetzt. Pool-Auth kann nicht funktionieren.'
    )
  }
  return new TextEncoder().encode(secret)
}

/**
 * Prüft die Pool-Credentials und gibt bei Erfolg die Session-Daten zurück.
 * Wirft KEINE Exception – gibt im Fehlerfall `null` zurück, damit der
 * Aufrufer eine generische Fehlermeldung ausgeben kann (kein Username
 * Enumeration).
 */
export async function loginPoolUser(
  email: string,
  password: string
): Promise<PoolSession | null> {
  if (!email || !password) return null

  const user = await prisma.poolUser.findUnique({
    where: { email: email.toLowerCase().trim() },
  })

  if (!user || !user.active) return null

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) return null

  return {
    poolUserId: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role as PoolUserRole,
  }
}

/**
 * Erzeugt ein signiertes JWT mit den Session-Daten und setzt es als
 * HTTP-only-Cookie.
 */
export async function setPoolSessionCookie(session: PoolSession): Promise<void> {
  const secret = getSecret()
  const token = await new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .setSubject(session.poolUserId)
    .sign(secret)

  cookies().set(POOL_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

/** Liest den Session-Cookie und verifiziert das JWT. */
export async function getPoolSession(): Promise<PoolSession | null> {
  const cookie = cookies().get(POOL_SESSION_COOKIE)
  if (!cookie?.value) return null

  try {
    const { payload } = await jwtVerify(cookie.value, getSecret(), {
      algorithms: ['HS256'],
    })
    return {
      poolUserId: String(payload.poolUserId ?? payload.sub),
      email: String(payload.email),
      firstName: String(payload.firstName),
      lastName: String(payload.lastName),
      role: payload.role as PoolUserRole,
    }
  } catch {
    return null
  }
}

/** Löscht den Session-Cookie (Logout). */
export function clearPoolSessionCookie(): void {
  cookies().set(POOL_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

/** Hilfs-Hash für Setup-/Seed-Skripte. */
export async function hashPoolPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10)
}
