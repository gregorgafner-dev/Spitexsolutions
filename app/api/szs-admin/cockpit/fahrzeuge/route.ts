import { NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import snapshot from '@/lib/szs-admin/cockpit/data/fahrzeuge-snapshot.json'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session || session.user.role !== 'ADMIN_SZS') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json(snapshot)
}
