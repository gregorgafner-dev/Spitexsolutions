import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getPoolSession } from '@/lib/pool/auth'
import { startOfMonthUTC, startOfNextMonthUTC, toIsoDay } from '@/lib/pool/dates'
import { getTeamLabel } from '@/lib/pool/teams'
import { getHolidayMap } from '@/lib/pool/holidays-zh'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/pool/me/bookings?year=2026[&month=5]
 *
 * Liefert alle Buchungen der eingeloggten Person für den gewählten Zeitraum.
 * Wenn `month` (1-12) fehlt, wird das ganze Jahr zurückgegeben.
 *
 * Pro Buchung wird zusätzlich vermerkt, ob der Tag auf einen Samstag/Sonntag
 * fällt oder ein Feiertag im Kanton Zürich ist – das ist später für die
 * Lohn-Abrechnung relevant (Wochenend-/Feiertagszuschläge).
 */
export async function GET(request: NextRequest) {
  const session = await getPoolSession()
  if (!session) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })
  }
  if (session.role !== 'MEMBER') {
    return NextResponse.json({ error: 'Nur Pool-Mitarbeitende.' }, { status: 403 })
  }

  const url = new URL(request.url)
  const year = parseInt(url.searchParams.get('year') || '', 10)
  const monthParam = url.searchParams.get('month')
  const month = monthParam ? parseInt(monthParam, 10) : null
  if (!year) {
    return NextResponse.json({ error: 'year erforderlich' }, { status: 400 })
  }
  if (month !== null && (isNaN(month) || month < 1 || month > 12)) {
    return NextResponse.json({ error: 'month muss 1-12 sein' }, { status: 400 })
  }

  let start: Date
  let end: Date
  if (month !== null) {
    start = startOfMonthUTC(year, month - 1)
    end = startOfNextMonthUTC(year, month - 1)
  } else {
    start = startOfMonthUTC(year, 0)
    end = startOfMonthUTC(year + 1, 0)
  }

  const bookings = await prisma.poolBooking.findMany({
    where: {
      poolUserId: session.poolUserId,
      date: { gte: start, lt: end },
    },
    orderBy: [{ date: 'asc' }, { shift: 'asc' }],
    select: {
      id: true,
      date: true,
      shift: true,
      team: true,
      notes: true,
      shiftRequestId: true,
      createdAt: true,
    },
  })

  const holidayMap = getHolidayMap(year)

  const items = bookings.map((b) => {
    const isoDate = toIsoDay(b.date)
    // Wochentag aus UTC ableiten, damit es zur DB-Repräsentation passt.
    const weekday = b.date.getUTCDay() // 0=So, 6=Sa
    const isWeekend = weekday === 0 || weekday === 6
    const holiday = holidayMap.get(isoDate) ?? null
    return {
      id: b.id,
      date: isoDate,
      weekday,
      isWeekend,
      holidayLabel: holiday?.name ?? null,
      shift: b.shift,
      shiftLabel: b.shift === 'EARLY' ? 'Frühdienst' : 'Spätdienst',
      team: b.team,
      teamLabel: getTeamLabel(b.team),
      notes: b.notes,
      hasSourceRequest: Boolean(b.shiftRequestId),
      createdAt: b.createdAt.toISOString(),
    }
  })

  // Summary für die spätere Abrechnung: Zählungen pro Schicht und davon
  // Wochenend-/Feiertags-Anteil.
  const summary = {
    total: items.length,
    early: items.filter((i) => i.shift === 'EARLY').length,
    late: items.filter((i) => i.shift === 'LATE').length,
    weekend: items.filter((i) => i.isWeekend).length,
    holiday: items.filter((i) => i.holidayLabel !== null).length,
  }

  return NextResponse.json({ items, summary })
}
