import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getPoolSession } from '@/lib/pool/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/pool/me/messages/[id]/read
 * Markiert eine eigene Nachricht als gelesen (idempotent).
 */
export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getPoolSession()
  if (!session) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })

  const { id } = await context.params

  const result = await prisma.poolMessage.updateMany({
    where: { id, recipientPoolUserId: session.poolUserId },
    data: { isRead: true },
  })

  if (result.count === 0) {
    return NextResponse.json({ error: 'Nachricht nicht gefunden.' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
