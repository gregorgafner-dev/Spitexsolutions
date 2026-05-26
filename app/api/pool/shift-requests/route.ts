import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getPoolActor, unauthorizedPoolActor } from '@/lib/pool/actor'
import { getPoolSession } from '@/lib/pool/auth'
import { fromIsoDay, isValidShift, toIsoDay } from '@/lib/pool/dates'
import { isValidTeam, getTeamLabel } from '@/lib/pool/teams'
import {
  getQualificationLabel,
  isMemberQualifiedForRequest,
  parseAllowedQualifications,
  serializeAllowedQualifications,
} from '@/lib/pool/qualifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/pool/shift-requests
 * Query-Params:
 *   - status: "OPEN" | "FILLED" | "CANCELLED" | "all" (default "all")
 *   - dateFrom, dateTo (yyyy-mm-dd, inkl.)
 *
 * Sichtbar für Planer/Admin UND für eingeloggte Member (die sehen alle OPEN
 * Anfragen über das Postfach, hier ist es zusätzlich zugänglich).
 */
export async function GET(request: NextRequest) {
  // Wir akzeptieren entweder Planer-Actor oder Member-Session
  const actor = await getPoolActor()
  const session = actor ? null : await getPoolSession()
  if (!actor && !session) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })
  }

  const url = new URL(request.url)
  const status = url.searchParams.get('status') ?? 'all'
  const dateFromStr = url.searchParams.get('dateFrom') || ''
  const dateToStr = url.searchParams.get('dateTo') || ''
  const teamParam = url.searchParams.get('team') || 'all'

  const where: Record<string, unknown> = {}
  if (status !== 'all') where.status = status
  if (teamParam !== 'all' && isValidTeam(teamParam)) where.team = teamParam

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
      const d = fromIsoDay(dateToStr)
      const next = new Date(d)
      next.setUTCDate(next.getUTCDate() + 1)
      dateRange.lt = next
    } catch {
      return NextResponse.json({ error: 'Ungültiges dateTo' }, { status: 400 })
    }
  }
  if (Object.keys(dateRange).length > 0) where.date = dateRange

  const items = await prisma.poolShiftRequest.findMany({
    where,
    orderBy: [{ status: 'asc' }, { date: 'asc' }, { shift: 'asc' }],
    include: {
      filledByPoolUser: { select: { id: true, firstName: true, lastName: true } },
    },
  })

  // Wenn der Aufrufer ein eingeloggter Member ist (also kein Planer/Admin),
  // gelten Qualifikations-Restriktionen: Anfragen, für die der Member nicht
  // qualifiziert ist, sind nicht sichtbar.
  let memberQualification: string | null = null
  if (!actor && session) {
    const me = await prisma.poolUser.findUnique({
      where: { id: session.poolUserId },
      select: { qualification: true },
    })
    memberQualification = me?.qualification ?? null
  }

  const filtered = items.filter((i) => {
    if (actor) return true // Planer/Admin sehen alles
    const allowed = parseAllowedQualifications(i.allowedQualifications)
    return isMemberQualifiedForRequest(memberQualification, allowed)
  })

  return NextResponse.json({
    items: filtered.map((i) => {
      const allowed = parseAllowedQualifications(i.allowedQualifications)
      return {
        id: i.id,
        date: toIsoDay(i.date),
        shift: i.shift,
        team: i.team,
        teamLabel: getTeamLabel(i.team),
        status: i.status,
        message: i.message,
        allowedQualifications: allowed,
        allowedQualificationLabels: allowed.map((q) => getQualificationLabel(q) ?? q),
        filledAt: i.filledAt ? i.filledAt.toISOString() : null,
        filledByPoolUser: i.filledByPoolUser,
        createdAt: i.createdAt.toISOString(),
      }
    }),
  })
}

/**
 * POST /api/pool/shift-requests
 * Body: { date, shift, message? }
 *
 * Erzeugt eine neue Dienstanfrage UND in der gleichen Transaktion eine
 * Postfach-Nachricht für jedes aktive Pool-MEMBER mit Type=SHIFT_REQUEST.
 *
 * Nur Planer/Admin.
 */
export async function POST(request: NextRequest) {
  const actor = await getPoolActor()
  if (!actor) return unauthorizedPoolActor()

  const body = await request.json().catch(() => null)
  const dateStr = String(body?.date ?? '')
  const shiftStr = String(body?.shift ?? '')
  const teamStr = String(body?.team ?? '')
  const message = body?.message ? String(body.message).trim() : null
  const allowedQualificationsRaw: unknown = body?.allowedQualifications
  const allowedQualificationsList: string[] = Array.isArray(allowedQualificationsRaw)
    ? allowedQualificationsRaw.map((v) => String(v))
    : []
  const allowedQualificationsJson = serializeAllowedQualifications(allowedQualificationsList)

  if (!isValidShift(shiftStr)) {
    return NextResponse.json({ error: 'Ungültige Schicht.' }, { status: 400 })
  }
  if (!isValidTeam(teamStr)) {
    return NextResponse.json({ error: 'Ungültiges oder fehlendes Team.' }, { status: 400 })
  }
  // Wenn der Body explizit ein Array geschickt hat, müssen alle Einträge
  // gültig sein – sonst Ablehnen.
  if (Array.isArray(allowedQualificationsRaw)) {
    const parsedBack = parseAllowedQualifications(allowedQualificationsJson)
    if (parsedBack.length !== allowedQualificationsList.length) {
      return NextResponse.json(
        { error: 'Ungültige Berufsbezeichnung in der Mindestqualifikation.' },
        { status: 400 }
      )
    }
  }
  let date: Date
  try {
    date = fromIsoDay(dateStr)
  } catch {
    return NextResponse.json({ error: 'Ungültiges Datum.' }, { status: 400 })
  }

  // Sanity: für (date, shift, team) bereits gebucht? Dann macht eine offene
  // Anfrage keinen Sinn. Anfragen pro Team sind aber unabhängig - die gleiche
  // Schicht kann in verschiedenen Teams mehrfach offen sein.
  const existingBooking = await prisma.poolBooking.findUnique({
    where: { date_shift_team: { date, shift: shiftStr, team: teamStr } },
  })
  if (existingBooking) {
    return NextResponse.json(
      { error: 'Für dieses Team gibt es an diesem Tag/Schicht bereits eine Buchung.' },
      { status: 409 }
    )
  }

  // Aktive MEMBER ermitteln und nach Mindestqualifikation filtern.
  const allMembers = await prisma.poolUser.findMany({
    where: { role: 'MEMBER', active: true },
    select: { id: true, qualification: true },
  })
  const allowedParsed = parseAllowedQualifications(allowedQualificationsJson)
  const recipients = allMembers.filter((m) =>
    isMemberQualifiedForRequest(m.qualification, allowedParsed)
  )

  const shiftLabel = shiftStr === 'EARLY' ? 'Frühdienst' : 'Spätdienst'
  const teamLabel = getTeamLabel(teamStr)
  const qualNote =
    allowedParsed.length > 0
      ? ` (Mindestqualifikation: ${allowedParsed.join(', ')})`
      : ''
  const subject = `Dienstanfrage: ${shiftLabel} am ${toIsoDay(date)} · ${teamLabel}${qualNote}`
  const content = message ?? 'Bitte schau im Postfach, ob du diesen Dienst übernehmen kannst.'

  const created = await prisma.$transaction(async (tx) => {
    const req = await tx.poolShiftRequest.create({
      data: {
        date,
        shift: shiftStr,
        team: teamStr,
        status: 'OPEN',
        message,
        allowedQualifications: allowedQualificationsJson,
        createdByType: actor.type,
        createdById: actor.id,
      },
    })
    if (recipients.length > 0) {
      await tx.poolMessage.createMany({
        data: recipients.map((m) => ({
          recipientPoolUserId: m.id,
          type: 'SHIFT_REQUEST',
          subject,
          content,
          relatedRequestId: req.id,
        })),
      })
    }
    return req
  })

  return NextResponse.json(
    {
      request: {
        id: created.id,
        date: toIsoDay(created.date),
        shift: created.shift,
        team: created.team,
        teamLabel: getTeamLabel(created.team),
        status: created.status,
        message: created.message,
        allowedQualifications: allowedParsed,
        notified: recipients.length,
        eligibleTotal: recipients.length,
        memberTotal: allMembers.length,
      },
    },
    { status: 201 }
  )
}
