/**
 * Dual-Auth Helper für den Pool-Bereich.
 *
 * Es gibt zwei Personengruppen, die planerisch im Pool tätig sind:
 *   1. Pool-Planer (PLANNER) – authentifiziert über `pool-session` (eigene
 *      Tabelle `pool_users`, eigenes JWT, siehe `lib/pool/auth.ts`).
 *   2. SZS-Admins – authentifiziert über das bestehende NextAuth-System
 *      (`users.role = "ADMIN_SZS"`).
 *
 * APIs des Pool-Bereichs akzeptieren beide. Der Aufrufer erhält über
 * `getPoolActor()` eine einheitliche Beschreibung dessen, wer gerade
 * handelt – inkl. einer Diskriminierung (`POOL_PLANNER` vs. `SZS_ADMIN`),
 * die in Audit-Feldern (`createdByType`/`createdById`) gespeichert wird.
 *
 * Pool-MEMBER können diese Helferfunktion nicht authentifizieren – sie
 * haben keine planerischen Befugnisse. Sie nutzen separate Endpoints
 * (z.B. Verfügbarkeit eintragen, Anfragen annehmen).
 */

import { getPoolSession } from './auth'
import { getSession } from '@/lib/get-session'

export type PoolActor =
  | {
      type: 'POOL_PLANNER'
      id: string // pool_users.id
      firstName: string
      lastName: string
      email: string
    }
  | {
      type: 'SZS_ADMIN'
      id: string // users.id
      firstName: string
      lastName: string
      email: string
    }

/**
 * Liefert den eingeloggten Pool-Planer ODER SZS-Admin.
 * Gibt `null` zurück, wenn weder noch authentifiziert ist.
 *
 * Reihenfolge der Prüfung:
 *   1. Pool-Session (PLANNER) – häufiger Fall in Mitarbeiter-Verkehr
 *   2. SZS-Admin-NextAuth-Session
 */
export async function getPoolActor(): Promise<PoolActor | null> {
  const poolSession = await getPoolSession()
  if (poolSession?.role === 'PLANNER') {
    return {
      type: 'POOL_PLANNER',
      id: poolSession.poolUserId,
      firstName: poolSession.firstName,
      lastName: poolSession.lastName,
      email: poolSession.email,
    }
  }

  const szs = await getSession()
  if (szs?.user?.role === 'ADMIN_SZS' && szs.user.id) {
    // Namen aus session.user.name aufsplitten (Format: "Vor Nach")
    const fullName = szs.user.name ?? ''
    const lastSpace = fullName.lastIndexOf(' ')
    const firstName = lastSpace > 0 ? fullName.slice(0, lastSpace) : fullName
    const lastName = lastSpace > 0 ? fullName.slice(lastSpace + 1) : ''
    return {
      type: 'SZS_ADMIN',
      id: szs.user.id,
      firstName,
      lastName,
      email: szs.user.email ?? '',
    }
  }

  return null
}

/** Hilfsklasse für API-Routes: 401-Response bauen. */
export function unauthorizedPoolActor() {
  return new Response(
    JSON.stringify({ error: 'Nicht autorisiert. Login als Pool-Planer oder SZS-Admin erforderlich.' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } }
  )
}
