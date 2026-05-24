import { NextRequest, NextResponse } from 'next/server'
import { loginPoolUser, setPoolSessionCookie } from '@/lib/pool/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body.email !== 'string' || typeof body.password !== 'string') {
      return NextResponse.json(
        { error: 'E-Mail und Passwort sind erforderlich' },
        { status: 400 }
      )
    }

    const session = await loginPoolUser(body.email, body.password)
    if (!session) {
      // Bewusst generische Fehlermeldung (kein Username Enumeration)
      return NextResponse.json(
        { error: 'Login fehlgeschlagen. Bitte E-Mail und Passwort prüfen.' },
        { status: 401 }
      )
    }

    await setPoolSessionCookie(session)

    return NextResponse.json({
      ok: true,
      role: session.role,
      firstName: session.firstName,
      lastName: session.lastName,
    })
  } catch (error) {
    console.error('[pool/auth/login] Error:', error)
    return NextResponse.json({ error: 'Interner Fehler' }, { status: 500 })
  }
}
