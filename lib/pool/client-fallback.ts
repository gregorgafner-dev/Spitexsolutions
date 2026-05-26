/**
 * Client-Helper: Pool-Login-Fallback.
 *
 * Wird in den bestehenden Login-Masken (`/admin/login`, `/login`) verwendet,
 * damit Pool-Mitarbeitende dieselbe Maske verwenden können.
 *
 * Ablauf in der Login-Maske:
 *   1. Normaler NextAuth-Login via `signIn('credentials', …)`.
 *   2. Wenn dieser fehlschlägt, ruft die Maske `tryPoolLoginFallback()` auf.
 *   3. Bei Erfolg leitet die Maske auf die zur Rolle passende Pool-Seite weiter.
 */

export type PoolFallbackSuccess = {
  ok: true
  /** "PLANNER" oder "MEMBER" */
  role: 'PLANNER' | 'MEMBER'
  /** Zielpfad, abhängig von der Pool-Rolle */
  redirectTo: string
}

export type PoolFallbackFailure = {
  ok: false
}

/**
 * Versucht, mit den gegebenen Credentials einen Pool-Login durchzuführen.
 *
 * - Erfolg: Pool-Session-Cookie ist gesetzt (das macht die API server-seitig);
 *   der Aufrufer kann auf `redirectTo` navigieren.
 * - Fehlschlag: Aufrufer zeigt seine reguläre Fehlermeldung.
 */
export async function tryPoolLoginFallback(
  email: string,
  password: string
): Promise<PoolFallbackSuccess | PoolFallbackFailure> {
  try {
    const res = await fetch('/api/pool/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) return { ok: false }
    const data: { ok?: boolean; role?: 'PLANNER' | 'MEMBER' } = await res.json().catch(() => ({}))
    if (!data.ok || (data.role !== 'PLANNER' && data.role !== 'MEMBER')) {
      return { ok: false }
    }
    const redirectTo = data.role === 'PLANNER' ? '/pool/planung' : '/pool/dashboard'
    return { ok: true, role: data.role, redirectTo }
  } catch {
    return { ok: false }
  }
}
