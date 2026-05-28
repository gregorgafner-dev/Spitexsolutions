import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import {
  emptyFahrzeugPayload,
  loadFahrzeugPersistedState,
  saveFahrzeugPersistedState,
  type FahrzeugPersistedPayload,
} from '@/lib/szs-admin/cockpit/fahrzeug-persist'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export async function GET() {
  const session = await getSession()
  if (!session || session.user.role !== 'ADMIN_SZS') {
    return unauthorized()
  }

  const state = await loadFahrzeugPersistedState()
  return NextResponse.json({ state })
}

export async function PUT(request: NextRequest) {
  const session = await getSession()
  if (!session || session.user.role !== 'ADMIN_SZS') {
    return unauthorized()
  }

  let body: { state?: FahrzeugPersistedPayload } | null = null
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  if (!body?.state) {
    return NextResponse.json({ error: 'state fehlt.' }, { status: 400 })
  }

  const saved = await saveFahrzeugPersistedState(body.state, session.user.email ?? session.user.name)
  return NextResponse.json({ state: saved, ok: true })
}
