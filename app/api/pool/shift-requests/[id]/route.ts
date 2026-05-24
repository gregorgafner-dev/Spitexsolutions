import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getPoolActor, unauthorizedPoolActor } from '@/lib/pool/actor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * DELETE /api/pool/shift-requests/[id] – Anfrage stornieren (Planer/Admin).
 *
 * Setzt die Anfrage auf CANCELLED. Falls bereits eine Buchung dazu existiert,
 * wird die Buchung ebenfalls gelöscht.
 */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await getPoolActor()
  if (!actor) return unauthorizedPoolActor()

  const { id } = await context.params
  const existing = await prisma.poolShiftRequest.findUnique({
    where: { id },
    include: { bookings: { select: { id: true } } },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Anfrage nicht gefunden.' }, { status: 404 })
  }

  await prisma.$transaction(async (tx) => {
    if (existing.bookings.length > 0) {
      await tx.poolBooking.deleteMany({
        where: { id: { in: existing.bookings.map((b) => b.id) } },
      })
    }
    await tx.poolShiftRequest.update({
      where: { id },
      data: { status: 'CANCELLED', filledAt: null, filledByPoolUserId: null },
    })
  })

  return NextResponse.json({ ok: true })
}
