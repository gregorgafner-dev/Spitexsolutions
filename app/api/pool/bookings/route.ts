import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getPoolActor, unauthorizedPoolActor } from '@/lib/pool/actor'
import { fromIsoDay, isValidShift, toIsoDay } from '@/lib/pool/dates'
import { getTeamLabel, isValidTeam } from '@/lib/pool/teams'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/pool/bookings
 * Body: { poolUserId, date: "yyyy-mm-dd", shift: "EARLY"|"LATE", notes?, shiftRequestId? }
 *
 * Planer/Admin bucht einen Slot für ein bestimmtes Pool-Mitglied. Der Slot
 * (date+shift) ist global unique – jeder Slot kann nur EINMAL gebucht werden.
 * Wenn der Member den Slot als Verfügbarkeit eingetragen hatte, ist der Slot
 * für den Member ab Buchung gesperrt (Lock erfolgt visuell im Member-Kalender
 * über die Buchungs-Daten).
 *
 * Die zugehörige PoolAvailability darf bestehen bleiben, da die Lock-Logik
 * über die Existenz des Bookings funktioniert.
 */
export async function POST(request: NextRequest) {
  const actor = await getPoolActor()
  if (!actor) return unauthorizedPoolActor()

  const body = await request.json().catch(() => null)
  const poolUserId = String(body?.poolUserId ?? '').trim()
  const dateStr = String(body?.date ?? '')
  const shiftStr = String(body?.shift ?? '')
  const teamStr = String(body?.team ?? '')
  const notes = body?.notes ? String(body.notes).trim() : null
  const shiftRequestId = body?.shiftRequestId ? String(body.shiftRequestId).trim() : null

  if (!poolUserId) {
    return NextResponse.json({ error: 'poolUserId fehlt.' }, { status: 400 })
  }
  if (!isValidShift(shiftStr)) {
    return NextResponse.json({ error: 'Ungültige Schicht.' }, { status: 400 })
  }
  if (!isValidTeam(teamStr)) {
    return NextResponse.json({ error: 'Ungültiges oder fehlendes Team.' }, { status: 400 })
  }

  let date: Date
  try {
    date = fromIsoDay(dateStr)
  } catch {
    return NextResponse.json({ error: 'Ungültiges Datum.' }, { status: 400 })
  }

  const member = await prisma.poolUser.findUnique({
    where: { id: poolUserId },
    select: { id: true, active: true, role: true, firstName: true, lastName: true },
  })
  if (!member) return NextResponse.json({ error: 'Mitarbeitende:r nicht gefunden.' }, { status: 404 })
  if (!member.active) {
    return NextResponse.json(
      { error: 'Dieses Pool-Konto ist inaktiv und kann nicht gebucht werden.' },
      { status: 400 }
    )
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.poolBooking.create({
        data: {
          poolUserId,
          date,
          shift: shiftStr,
          team: teamStr,
          notes,
          shiftRequestId,
          createdByType: actor.type,
          createdById: actor.id,
        },
        select: {
          id: true,
          date: true,
          shift: true,
          team: true,
          poolUserId: true,
          notes: true,
          createdAt: true,
        },
      })

      // Konsistenz-Logik: Wenn der Planer einen Slot direkt bucht (ohne Bezug
      // zu einer konkreten Anfrage), aber für genau diese Kombination
      // (date+shift+team) noch eine offene Anfrage existiert, dann ist diese
      // Anfrage nun faktisch erfüllt – wir setzen sie auf FILLED mit
      // `filledByPoolUserId = booking.poolUserId`, damit die Anfrage im
      // Postfach nicht als „noch offen" erscheint und nicht doppelt
      // übernommen werden kann.
      let filledRequestId: string | null = null
      if (!shiftRequestId) {
        const openMatch = await tx.poolShiftRequest.findFirst({
          where: { date, shift: shiftStr, team: teamStr, status: 'OPEN' },
          select: { id: true },
        })
        if (openMatch) {
          await tx.poolShiftRequest.update({
            where: { id: openMatch.id },
            data: {
              status: 'FILLED',
              filledAt: new Date(),
              filledByPoolUserId: poolUserId,
            },
          })
          filledRequestId = openMatch.id

          // Postfach-Eintrag des direkt-gebuchten Mitarbeitenden für genau
          // diese Anfrage als gelesen markieren – damit die Anfrage nicht
          // mehr als „aktiv" mit Übernehmen-Button erscheint.
          await tx.poolMessage.updateMany({
            where: {
              recipientPoolUserId: poolUserId,
              relatedRequestId: openMatch.id,
              isRead: false,
            },
            data: { isRead: true },
          })
        }
      }

      // BOOKING_CONFIRMED-Nachricht für den gebuchten Mitarbeitenden,
      // damit er die Buchung im Postfach klar sieht.
      const shiftLabel = shiftStr === 'EARLY' ? 'Frühdienst' : 'Spätdienst'
      const teamLabel = getTeamLabel(teamStr)
      const isoDate = toIsoDay(date)
      await tx.poolMessage.create({
        data: {
          recipientPoolUserId: poolUserId,
          type: 'BOOKING_CONFIRMED',
          subject: `Gebucht: ${shiftLabel} am ${isoDate} · ${teamLabel}`,
          content: `Die Planung hat dich für ${shiftLabel} am ${isoDate} (${teamLabel}) gebucht.`,
          relatedRequestId: filledRequestId ?? shiftRequestId ?? null,
        },
      })

      return { booking, filledRequestId }
    })

    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      // P2002 kann zwei Constraints betreffen:
      //  1) (date, shift, team) → Team-Slot schon belegt
      //  2) (poolUserId, date, shift) → Member arbeitet bereits in dieser Schicht
      const target = (e.meta?.target as string[] | string | undefined) ?? ''
      const targetStr = Array.isArray(target) ? target.join(',') : target
      const isMemberConflict = targetStr.includes('poolUserId')
      return NextResponse.json(
        {
          error: isMemberConflict
            ? 'Diese:r Mitarbeitende:r ist am gewählten Datum/Schicht bereits gebucht.'
            : 'Für dieses Team ist der Slot (Datum + Schicht) bereits gebucht.',
        },
        { status: 409 }
      )
    }
    throw e
  }
}
