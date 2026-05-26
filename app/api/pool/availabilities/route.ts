import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getPoolActor, unauthorizedPoolActor } from '@/lib/pool/actor'
import { fromIsoDay, toIsoDay, isValidShift } from '@/lib/pool/dates'
import { getTeamLabel } from '@/lib/pool/teams'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/pool/availabilities
 * Query-Params (alle optional):
 *   - dateFrom: yyyy-mm-dd (inkl.)
 *   - dateTo:   yyyy-mm-dd (inkl.)
 *   - poolUserId: ID eines Mitarbeitenden ("all" für alle)
 *   - shift:    "EARLY" | "LATE" | "all"
 *   - status:   "open" | "booked" | "all"  (default "all")
 *
 * Liefert eine flache, sortierte Liste von Verfügbarkeiten inkl. Mitarbeitenden-
 * Info und Buchungs-Information. Buchungen werden über (date, shift) ermittelt –
 * unabhängig davon, wer letztlich gebucht ist, denn eine Verfügbarkeit ist
 * "geblockt", sobald irgendjemand diesen Slot übernommen hat.
 */
export async function GET(request: NextRequest) {
  const actor = await getPoolActor()
  if (!actor) return unauthorizedPoolActor()

  const url = new URL(request.url)
  const dateFromStr = url.searchParams.get('dateFrom') || ''
  const dateToStr = url.searchParams.get('dateTo') || ''
  const poolUserIdParam = url.searchParams.get('poolUserId') || 'all'
  const shiftParam = url.searchParams.get('shift') || 'all'
  const statusParam = url.searchParams.get('status') || 'all'

  const where: Record<string, unknown> = {}
  const dateRange: Record<string, Date> = {}
  if (dateFromStr) {
    try {
      dateRange.gte = fromIsoDay(dateFromStr)
    } catch {
      return NextResponse.json({ error: 'Ungültiges dateFrom' }, { status: 400 })
    }
  }
  if (dateToStr) {
    try {
      // dateTo ist inklusiv -> Range exklusiv mit nächstem Tag
      const d = fromIsoDay(dateToStr)
      const next = new Date(d)
      next.setUTCDate(next.getUTCDate() + 1)
      dateRange.lt = next
    } catch {
      return NextResponse.json({ error: 'Ungültiges dateTo' }, { status: 400 })
    }
  }
  if (Object.keys(dateRange).length > 0) where.date = dateRange
  if (poolUserIdParam !== 'all') where.poolUserId = poolUserIdParam
  if (shiftParam !== 'all' && isValidShift(shiftParam)) where.shift = shiftParam

  const availabilities = await prisma.poolAvailability.findMany({
    where,
    orderBy: [{ date: 'asc' }, { shift: 'asc' }],
    include: {
      poolUser: {
        select: { id: true, firstName: true, lastName: true, email: true, active: true },
      },
    },
  })

  // Buchungen für (poolUserId, date, shift) holen: eine Verfügbarkeit gilt
  // genau dann als für das jeweilige Member "gesperrt", wenn dieses Member
  // selbst für (date, shift) bereits eine Buchung hat – egal in welchem Team
  // (eine Person kann nicht zwei Schichten parallel arbeiten).
  const bookings = await prisma.poolBooking.findMany({
    where: {
      ...(Object.keys(dateRange).length > 0 ? { date: dateRange } : {}),
      ...(shiftParam !== 'all' && isValidShift(shiftParam) ? { shift: shiftParam } : {}),
    },
    select: { id: true, date: true, shift: true, team: true, poolUserId: true },
  })
  const memberBookingKey = (poolUserId: string, d: Date, shift: string) =>
    `${poolUserId}|${toIsoDay(d)}|${shift}`
  const memberBookingMap = new Map<string, (typeof bookings)[number]>()
  for (const b of bookings) {
    memberBookingMap.set(memberBookingKey(b.poolUserId, b.date, b.shift), b)
  }

  const items = availabilities.map((a) => {
    const key = memberBookingKey(a.poolUserId, a.date, a.shift)
    const booking = memberBookingMap.get(key) ?? null
    return {
      id: a.id,
      date: toIsoDay(a.date),
      shift: a.shift,
      poolUser: a.poolUser,
      isBooked: Boolean(booking),
      bookedTeam: booking?.team ?? null,
      bookedTeamLabel: booking ? getTeamLabel(booking.team) : null,
      bookingId: booking?.id ?? null,
    }
  })

  const filtered =
    statusParam === 'open'
      ? items.filter((i) => !i.isBooked)
      : statusParam === 'booked'
        ? items.filter((i) => i.isBooked)
        : items

  return NextResponse.json({ items: filtered })
}
