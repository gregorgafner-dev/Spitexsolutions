import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getPoolActor, unauthorizedPoolActor } from '@/lib/pool/actor'
import { hashPoolPassword } from '@/lib/pool/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/pool/members – Liste aller Pool-Users (Planer + Member). */
export async function GET() {
  const actor = await getPoolActor()
  if (!actor) return unauthorizedPoolActor()

  const users = await prisma.poolUser.findMany({
    orderBy: [{ active: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }],
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

  return NextResponse.json({ members: users })
}

/** POST /api/pool/members – Neuen Pool-User anlegen. */
export async function POST(request: NextRequest) {
  const actor = await getPoolActor()
  if (!actor) return unauthorizedPoolActor()

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const email = String(body?.email ?? '').toLowerCase().trim()
  const firstName = String(body?.firstName ?? '').trim()
  const lastName = String(body?.lastName ?? '').trim()
  const role = body?.role === 'PLANNER' ? 'PLANNER' : body?.role === 'MEMBER' ? 'MEMBER' : null
  const phone = body?.phone ? String(body.phone).trim() : null
  const notes = body?.notes ? String(body.notes).trim() : null
  const password = typeof body?.password === 'string' ? body.password : ''
  const active = body?.active !== false

  if (!email || !firstName || !lastName || !role) {
    return NextResponse.json(
      { error: 'E-Mail, Vor-/Nachname und Rolle sind erforderlich.' },
      { status: 400 }
    )
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: 'Passwort muss mindestens 6 Zeichen lang sein.' },
      { status: 400 }
    )
  }

  const existing = await prisma.poolUser.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json(
      { error: 'Diese E-Mail-Adresse ist bereits vergeben.' },
      { status: 409 }
    )
  }

  const created = await prisma.poolUser.create({
    data: {
      email,
      firstName,
      lastName,
      role,
      phone,
      notes,
      active,
      password: await hashPoolPassword(password),
    },
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

  return NextResponse.json({ member: created }, { status: 201 })
}
