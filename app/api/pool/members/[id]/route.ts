import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getPoolActor, unauthorizedPoolActor } from '@/lib/pool/actor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** PATCH /api/pool/members/[id] – Bearbeiten (Name, Rolle, Telefon, Notizen, Aktiv-Status). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const actor = await getPoolActor()
  if (!actor) return unauthorizedPoolActor()

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const existing = await prisma.poolUser.findUnique({ where: { id: params.id } })
  if (!existing) {
    return NextResponse.json({ error: 'Mitarbeiter:in nicht gefunden.' }, { status: 404 })
  }

  // Selbstschutz: aktueller Pool-Planer darf sich nicht selbst deaktivieren.
  if (
    actor.type === 'POOL_PLANNER' &&
    actor.id === existing.id &&
    body?.active === false
  ) {
    return NextResponse.json(
      { error: 'Du kannst dich nicht selbst deaktivieren.' },
      { status: 400 }
    )
  }

  const data: any = {}
  if (typeof body?.firstName === 'string') data.firstName = body.firstName.trim()
  if (typeof body?.lastName === 'string') data.lastName = body.lastName.trim()
  if (body?.role === 'PLANNER' || body?.role === 'MEMBER') data.role = body.role
  if (typeof body?.phone === 'string') data.phone = body.phone.trim() || null
  if (typeof body?.notes === 'string') data.notes = body.notes.trim() || null
  if (typeof body?.active === 'boolean') data.active = body.active

  // E-Mail-Änderung mit Eindeutigkeits-Check
  if (typeof body?.email === 'string') {
    const newEmail = body.email.toLowerCase().trim()
    if (newEmail !== existing.email) {
      const dup = await prisma.poolUser.findUnique({ where: { email: newEmail } })
      if (dup) {
        return NextResponse.json(
          { error: 'Diese E-Mail-Adresse ist bereits vergeben.' },
          { status: 409 }
        )
      }
      data.email = newEmail
    }
  }

  const updated = await prisma.poolUser.update({
    where: { id: params.id },
    data,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      active: true,
      phone: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({ member: updated })
}

/** DELETE /api/pool/members/[id] – Löscht den Pool-User. Wir empfehlen "deaktivieren". */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const actor = await getPoolActor()
  if (!actor) return unauthorizedPoolActor()

  if (actor.type === 'POOL_PLANNER' && actor.id === params.id) {
    return NextResponse.json(
      { error: 'Du kannst deinen eigenen Account nicht löschen.' },
      { status: 400 }
    )
  }

  const existing = await prisma.poolUser.findUnique({ where: { id: params.id } })
  if (!existing) {
    return NextResponse.json({ error: 'Mitarbeiter:in nicht gefunden.' }, { status: 404 })
  }

  // Hard-Delete: kaskadiert Verfügbarkeiten, Buchungen (poolUser onDelete: Cascade),
  // Audit-Felder bleiben in den Buchungen mit String-IDs erhalten.
  await prisma.poolUser.delete({ where: { id: params.id } })

  return NextResponse.json({ ok: true })
}
