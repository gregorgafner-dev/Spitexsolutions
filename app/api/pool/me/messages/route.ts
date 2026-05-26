import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getPoolSession } from '@/lib/pool/auth'
import { toIsoDay } from '@/lib/pool/dates'
import { getTeamLabel } from '@/lib/pool/teams'
import {
  getQualificationLabel,
  isMemberQualifiedForRequest,
  parseAllowedQualifications,
} from '@/lib/pool/qualifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/pool/me/messages
 *
 * Liefert die Postfach-Nachrichten der eingeloggten Person. Sortierung:
 * ungelesen zuerst, dann nach createdAt absteigend.
 *
 * Für Nachrichten vom Typ SHIFT_REQUEST mit verknüpfter Anfrage geben wir
 * zusätzliche Felder zurück, damit das Frontend einen "Übernehmen"-Button
 * korrekt anzeigen/sperren kann (z.B. wenn die Anfrage inzwischen FILLED ist).
 */
export async function GET(_request: NextRequest) {
  const session = await getPoolSession()
  if (!session) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })

  const me = await prisma.poolUser.findUnique({
    where: { id: session.poolUserId },
    select: { qualification: true },
  })
  const myQualification = me?.qualification ?? null

  const messages = await prisma.poolMessage.findMany({
    where: { recipientPoolUserId: session.poolUserId },
    orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
    take: 200,
    include: {
      relatedRequest: {
        select: {
          id: true,
          date: true,
          shift: true,
          team: true,
          status: true,
          allowedQualifications: true,
          filledByPoolUserId: true,
        },
      },
    },
  })

  // Sicherheitsfilter: SHIFT_REQUEST-Nachrichten, deren Anfrage eine
  // Mindestqualifikation hat, die der Member (mehr) nicht erfüllt, werden
  // ausgeblendet. So bleiben auch nachträglich gesenkte Qualifikationen oder
  // editierte Anfragen konsistent.
  const visibleMessages = messages.filter((m) => {
    if (!m.relatedRequest) return true
    if (m.type !== 'SHIFT_REQUEST') return true
    const allowed = parseAllowedQualifications(m.relatedRequest.allowedQualifications)
    return isMemberQualifiedForRequest(myQualification, allowed)
  })

  const items = visibleMessages.map((m) => {
    const allowed = m.relatedRequest
      ? parseAllowedQualifications(m.relatedRequest.allowedQualifications)
      : []
    return {
      id: m.id,
      type: m.type,
      subject: m.subject,
      content: m.content,
      isRead: m.isRead,
      createdAt: m.createdAt.toISOString(),
      relatedRequest: m.relatedRequest
        ? {
            id: m.relatedRequest.id,
            date: toIsoDay(m.relatedRequest.date),
            shift: m.relatedRequest.shift,
            team: m.relatedRequest.team,
            teamLabel: getTeamLabel(m.relatedRequest.team),
            status: m.relatedRequest.status,
            allowedQualifications: allowed,
            allowedQualificationLabels: allowed.map((q) => getQualificationLabel(q) ?? q),
            takenByMe: m.relatedRequest.filledByPoolUserId === session.poolUserId,
          }
        : null,
    }
  })

  const unread = items.filter((i) => !i.isRead).length

  return NextResponse.json({ items, unread })
}
