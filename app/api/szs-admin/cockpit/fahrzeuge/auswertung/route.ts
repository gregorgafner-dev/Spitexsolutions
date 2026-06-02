import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { computeFahrzeugAuswertung } from '@/lib/szs-admin/cockpit/fahrzeug-auswertung'
import { loadFahrzeugPersistedState } from '@/lib/szs-admin/cockpit/fahrzeug-persist'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session || session.user.role !== 'ADMIN_SZS') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const dateFrom = url.searchParams.get('dateFrom') ?? ''
  const dateTo = url.searchParams.get('dateTo') ?? ''

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return NextResponse.json(
      { error: 'dateFrom und dateTo (yyyy-mm-dd) sind erforderlich.' },
      { status: 400 }
    )
  }

  if (dateFrom > dateTo) {
    return NextResponse.json(
      { error: 'dateFrom darf nicht nach dateTo liegen.' },
      { status: 400 }
    )
  }

  const payload = await loadFahrzeugPersistedState()
  const auswertung = computeFahrzeugAuswertung(payload, dateFrom, dateTo)

  return NextResponse.json({ auswertung })
}
