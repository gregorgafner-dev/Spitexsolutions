import { NextResponse } from 'next/server'
import { clearPoolSessionCookie } from '@/lib/pool/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  clearPoolSessionCookie()
  return NextResponse.json({ ok: true })
}
