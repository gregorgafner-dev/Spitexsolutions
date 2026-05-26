import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getPoolActor, unauthorizedPoolActor } from '@/lib/pool/actor'
import { fromIsoDay, toIsoDay } from '@/lib/pool/dates'
import { getTeamLabel } from '@/lib/pool/teams'
import {
  getQualificationLabel,
  getQualificationShort,
  parseAllowedQualifications,
} from '@/lib/pool/qualifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/pool/planner/calendar?dateFrom=yyyy-mm-dd&dateTo=yyyy-mm-dd
 *
 * Liefert dem Planer/Admin für den Datumsbereich alles, was er im
 * Tages-Kalender braucht:
 *   - requests:      Dienst-Anfragen (OPEN / FILLED / CANCELLED) inkl. Team
 *                    und Mindest-Qualifikation
 *   - bookings:      ALLE Buchungen im Range, auch ohne zugehörige Anfrage
 *                    (z.B. Direktbuchungen aus der Verfügbarkeits-View),
 *                    inkl. Mitarbeiter-Name & Team
 *   - availabilities: Verfügbarkeiten der Mitarbeitenden (selbst
 *                    eingetragen), inkl. Qualifikation
 *
 * Konflikt-Hinweis: Personen, die für eine bestimmte (date, shift) bereits
 * eine Buchung haben, sind in `availabilities` mit `lockedShifts` markiert,
 * damit das Frontend sie aus der "verfügbar"-Liste filtern bzw. als gebucht
 * darstellen kann.
 */
export async function GET(request: NextRequest) {
  const actor = await getPoolActor()
  if (!actor) return unauthorizedPoolActor()

  const url = new URL(request.url)
  const dateFromStr = url.searchParams.get('dateFrom') || ''
  const dateToStr = url.searchParams.get('dateTo') || ''

  let dateFrom: Date
  let dateTo: Date
  try {
    dateFrom = fromIsoDay(dateFromStr)
    const inclusive = fromIsoDay(dateToStr)
    dateTo = new Date(inclusive)
    dateTo.setUTCDate(dateTo.getUTCDate() + 1)
  } catch {
    return NextResponse.json(
      { error: 'dateFrom und dateTo (yyyy-mm-dd) sind erforderlich' },
      { status: 400 }
    )
  }

  const [requests, bookings, availabilities] = await Promise.all([
    prisma.poolShiftRequest.findMany({
      where: { date: { gte: dateFrom, lt: dateTo } },
      orderBy: [{ status: 'asc' }, { date: 'asc' }, { shift: 'asc' }],
      include: {
        filledByPoolUser: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.poolBooking.findMany({
      where: { date: { gte: dateFrom, lt: dateTo } },
      orderBy: [{ date: 'asc' }, { shift: 'asc' }],
      include: {
        poolUser: {
          select: { id: true, firstName: true, lastName: true, qualification: true },
        },
      },
    }),
    prisma.poolAvailability.findMany({
      where: { date: { gte: dateFrom, lt: dateTo } },
      orderBy: [{ date: 'asc' }, { shift: 'asc' }],
      include: {
        poolUser: {
          select: { id: true, firstName: true, lastName: true, qualification: true, active: true },
        },
      },
    }),
  ])

  // Lookup: welche Person ist an welchem (date, shift) bereits gebucht?
  // Wird genutzt, um Verfügbarkeit zu "locken".
  const bookedKey = (poolUserId: string, isoDate: string, shift: string) =>
    `${poolUserId}|${isoDate}|${shift}`
  const bookedSet = new Set<string>()
  for (const b of bookings) {
    bookedSet.add(bookedKey(b.poolUserId, toIsoDay(b.date), b.shift))
  }

  return NextResponse.json({
    requests: requests.map((r) => {
      const allowed = parseAllowedQualifications(r.allowedQualifications)
      return {
        id: r.id,
        date: toIsoDay(r.date),
        shift: r.shift,
        team: r.team,
        teamLabel: getTeamLabel(r.team),
        status: r.status,
        message: r.message,
        allowedQualifications: allowed,
        allowedQualificationLabels: allowed.map((q) => getQualificationLabel(q) ?? q),
        filledAt: r.filledAt ? r.filledAt.toISOString() : null,
        filledByPoolUser: r.filledByPoolUser,
        createdAt: r.createdAt.toISOString(),
      }
    }),
    bookings: bookings.map((b) => ({
      id: b.id,
      date: toIsoDay(b.date),
      shift: b.shift,
      team: b.team,
      teamLabel: getTeamLabel(b.team),
      shiftRequestId: b.shiftRequestId,
      poolUser: {
        id: b.poolUser.id,
        firstName: b.poolUser.firstName,
        lastName: b.poolUser.lastName,
        qualification: b.poolUser.qualification,
        qualificationShort: getQualificationShort(b.poolUser.qualification),
      },
    })),
    availabilities: availabilities
      .filter((a) => a.poolUser.active)
      .map((a) => {
        const isoDate = toIsoDay(a.date)
        const lockedByBooking = bookedSet.has(bookedKey(a.poolUserId, isoDate, a.shift))
        return {
          id: a.id,
          date: isoDate,
          shift: a.shift,
          poolUser: {
            id: a.poolUser.id,
            firstName: a.poolUser.firstName,
            lastName: a.poolUser.lastName,
            qualification: a.poolUser.qualification,
            qualificationShort: getQualificationShort(a.poolUser.qualification),
          },
          lockedByBooking,
        }
      }),
  })
}
