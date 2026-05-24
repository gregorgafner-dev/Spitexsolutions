import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getPoolSession } from '@/lib/pool/auth'
import { startOfMonthUTC, startOfNextMonthUTC, toIsoDay } from '@/lib/pool/dates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/pool/me/calendar?year=2026&month=6
 *
 * Liefert für den eingeloggten Pool-User für den angegebenen Monat:
 *   - availability: Map iso-Tag -> Set<Shift>  (selbst eingetragen)
 *   - bookings:     Map iso-Tag -> Set<Shift>  (verbindlich gebucht)
 *   - lockedAvailabilities: ids der availabilities, die NICHT mehr
 *     entfernt werden dürfen (weil bereits gebucht)
 */
export async function GET(request: NextRequest) {
  const session = await getPoolSession()
  if (!session) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const url = new URL(request.url)
  const year = parseInt(url.searchParams.get('year') || '', 10)
  const monthParam = parseInt(url.searchParams.get('month') || '', 10) // 1-12
  if (!year || isNaN(monthParam) || monthParam < 1 || monthParam > 12) {
    return NextResponse.json({ error: 'year und month (1-12) erforderlich' }, { status: 400 })
  }
  const monthIndex = monthParam - 1
  const start = startOfMonthUTC(year, monthIndex)
  const end = startOfNextMonthUTC(year, monthIndex)

  const [availabilities, bookings] = await Promise.all([
    prisma.poolAvailability.findMany({
      where: {
        poolUserId: session.poolUserId,
        date: { gte: start, lt: end },
      },
      select: { id: true, date: true, shift: true },
    }),
    prisma.poolBooking.findMany({
      where: {
        poolUserId: session.poolUserId,
        date: { gte: start, lt: end },
      },
      select: { id: true, date: true, shift: true },
    }),
  ])

  const availabilityMap: Record<string, string[]> = {}
  for (const a of availabilities) {
    const key = toIsoDay(a.date)
    if (!availabilityMap[key]) availabilityMap[key] = []
    availabilityMap[key].push(a.shift)
  }

  const bookingMap: Record<string, string[]> = {}
  for (const b of bookings) {
    const key = toIsoDay(b.date)
    if (!bookingMap[key]) bookingMap[key] = []
    bookingMap[key].push(b.shift)
  }

  return NextResponse.json({
    availability: availabilityMap,
    bookings: bookingMap,
  })
}
