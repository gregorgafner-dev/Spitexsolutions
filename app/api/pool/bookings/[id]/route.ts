import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getPoolActor, unauthorizedPoolActor } from '@/lib/pool/actor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * DELETE /api/pool/bookings/[id]
 *
 * Planer/Admin storniert eine Buchung. Falls die Buchung aus einer
 * ShiftRequest entstanden ist, wird der Request wieder auf OPEN gesetzt.
 */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await getPoolActor()
  if (!actor) return unauthorizedPoolActor()

  const { id } = await context.params
  const existing = await prisma.poolBooking.findUnique({
    where: { id },
    select: { id: true, shiftRequestId: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Buchung nicht gefunden.' }, { status: 404 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.poolBooking.delete({ where: { id } })
    if (existing.shiftRequestId) {
      await tx.poolShiftRequest.update({
        where: { id: existing.shiftRequestId },
        data: { status: 'OPEN', filledAt: null, filledByPoolUserId: null },
      })
    }
  })

  return NextResponse.json({ ok: true })
}
