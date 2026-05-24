import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getPoolSession } from '@/lib/pool/auth'
import { fromIsoDay, isValidShift } from '@/lib/pool/dates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/pool/me/availability
 * Body: { date: "yyyy-mm-dd", shifts: ["EARLY"|"LATE", ...] }
 *
 * Synchronisiert die eigene Verfügbarkeit für den angegebenen Tag:
 *   - Schichten in `shifts` werden angelegt (idempotent via unique-Constraint)
 *   - Andere Schichten desselben Tages werden gelöscht – ABER NUR wenn nicht
 *     bereits gebucht. Gebuchte Schichten bleiben unangetastet.
 *   - Vergangenheits-Tage werden abgelehnt (gegen UTC-Tag von heute).
 */
export async function POST(request: NextRequest) {
  const session = await getPoolSession()
  if (!session) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const dateStr = String(body?.date ?? '')
  const shifts: string[] = Array.isArray(body?.shifts) ? body.shifts.filter(isValidShift) : []

  let date: Date
  try {
    date = fromIsoDay(dateStr)
  } catch {
    return NextResponse.json({ error: 'Ungültiges Datum' }, { status: 400 })
  }

  const today = new Date()
  const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  if (date < todayUTC) {
    return NextResponse.json(
      { error: 'Verfügbarkeit für vergangene Tage kann nicht geändert werden.' },
      { status: 400 }
    )
  }

  // Gebuchte Schichten dieses Tages – die werden NICHT angetastet.
  const bookings = await prisma.poolBooking.findMany({
    where: { poolUserId: session.poolUserId, date },
    select: { shift: true },
  })
  const bookedShifts = new Set(bookings.map((b) => b.shift))

  // Bestehende Verfügbarkeiten
  const existing = await prisma.poolAvailability.findMany({
    where: { poolUserId: session.poolUserId, date },
    select: { id: true, shift: true },
  })
  const existingByShift = new Map(existing.map((a) => [a.shift, a.id] as const))

  const desired = new Set(shifts)

  // Anlegen, was fehlt
  const toCreate: string[] = []
  for (const s of desired) {
    if (!existingByShift.has(s)) toCreate.push(s)
  }
  // Löschen, was nicht mehr gewollt ist – aber nicht wenn gebucht
  const toDelete: string[] = []
  for (const [shift, id] of existingByShift) {
    if (desired.has(shift)) continue
    if (bookedShifts.has(shift)) continue
    toDelete.push(id)
  }

  await prisma.$transaction(async (tx) => {
    if (toCreate.length > 0) {
      await tx.poolAvailability.createMany({
        data: toCreate.map((shift) => ({
          poolUserId: session.poolUserId,
          date,
          shift,
        })),
      })
    }
    if (toDelete.length > 0) {
      await tx.poolAvailability.deleteMany({ where: { id: { in: toDelete } } })
    }
  })

  return NextResponse.json({
    ok: true,
    created: toCreate.length,
    deleted: toDelete.length,
    locked: bookedShifts.size > 0,
  })
}
