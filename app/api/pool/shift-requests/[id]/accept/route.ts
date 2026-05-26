import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getPoolSession } from '@/lib/pool/auth'
import { toIsoDay } from '@/lib/pool/dates'
import { getTeamLabel } from '@/lib/pool/teams'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/pool/shift-requests/[id]/accept
 *
 * First-come-first-served Übernahme einer Dienstanfrage durch ein MEMBER.
 *
 * Logik (atomar in einer Transaktion):
 *   1. Anfrage holen, muss Status OPEN haben.
 *   2. PoolBooking anlegen (date+shift) – Unique-Constraint verhindert
 *      Doppelbuchung, wenn parallel ein anderer Member oder ein Planer
 *      gebucht hat (P2002 → 409 zurück).
 *   3. Anfrage auf FILLED setzen, filledAt/filledByPoolUserId füllen.
 *   4. Wenn das Member eine PoolAvailability für (date+shift) hatte, bleibt
 *      sie bestehen (Lock via Booking).
 *   5. Postfach-Eintrag des Members (Type=SHIFT_REQUEST, relatedRequestId)
 *      wird als gelesen markiert und mit BOOKING_CONFIRMED ersetzt? Wir
 *      machen es einfach: zusätzliche INFO-Nachricht "Du hast diesen Dienst
 *      übernommen.".
 *
 * Nur Member dürfen annehmen. Planer/Admins müssen über POST /bookings buchen.
 */
export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getPoolSession()
  if (!session || session.role !== 'MEMBER') {
    return NextResponse.json({ error: 'Nur Pool-Mitarbeitende können Dienste übernehmen.' }, { status: 403 })
  }

  const { id } = await context.params

  try {
    const result = await prisma.$transaction(async (tx) => {
      const req = await tx.poolShiftRequest.findUnique({ where: { id } })
      if (!req) throw new HttpError(404, 'Anfrage nicht gefunden.')
      if (req.status !== 'OPEN') throw new HttpError(409, 'Diese Anfrage ist nicht mehr offen.')

      const booking = await tx.poolBooking.create({
        data: {
          poolUserId: session.poolUserId,
          date: req.date,
          shift: req.shift,
          team: req.team,
          shiftRequestId: req.id,
          createdByType: 'POOL_MEMBER',
          createdById: session.poolUserId,
        },
      })

      await tx.poolShiftRequest.update({
        where: { id: req.id },
        data: {
          status: 'FILLED',
          filledAt: new Date(),
          filledByPoolUserId: session.poolUserId,
        },
      })

      // Eigene SHIFT_REQUEST-Nachrichten dieser Anfrage als gelesen markieren
      await tx.poolMessage.updateMany({
        where: {
          recipientPoolUserId: session.poolUserId,
          relatedRequestId: req.id,
          isRead: false,
        },
        data: { isRead: true },
      })

      // Bestätigung an Member
      await tx.poolMessage.create({
        data: {
          recipientPoolUserId: session.poolUserId,
          type: 'BOOKING_CONFIRMED',
          subject: `Dienst übernommen: ${req.shift === 'EARLY' ? 'Frühdienst' : 'Spätdienst'} am ${toIsoDay(req.date)} · ${getTeamLabel(req.team)}`,
          content: 'Du hast diesen Dienst verbindlich übernommen.',
          relatedRequestId: req.id,
        },
      })

      return booking
    })

    return NextResponse.json({
      booking: {
        id: result.id,
        date: toIsoDay(result.date),
        shift: result.shift,
        team: result.team,
      },
    })
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const target = (e.meta?.target as string[] | string | undefined) ?? ''
      const targetStr = Array.isArray(target) ? target.join(',') : target
      const isMemberConflict = targetStr.includes('poolUserId')
      return NextResponse.json(
        {
          error: isMemberConflict
            ? 'Du arbeitest in dieser Schicht bereits in einem anderen Team.'
            : 'Dieser Dienst wurde soeben von jemand anderem übernommen.',
        },
        { status: 409 }
      )
    }
    throw e
  }
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}
