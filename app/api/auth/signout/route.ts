import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST() {
  // In einer echten App würde man hier die Session invalidieren
  // Für NextAuth reicht es, den Client zum SignOut zu leiten
  return NextResponse.json({ success: true })
}

