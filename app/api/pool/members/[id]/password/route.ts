import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getPoolActor, unauthorizedPoolActor } from '@/lib/pool/actor'
import { hashPoolPassword } from '@/lib/pool/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST /api/pool/members/[id]/password – Passwort des Mitarbeiters zurücksetzen. */
export async function POST(
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

  const password = typeof body?.password === 'string' ? body.password : ''
  if (password.length < 6) {
    return NextResponse.json(
      { error: 'Passwort muss mindestens 6 Zeichen lang sein.' },
      { status: 400 }
    )
  }

  const existing = await prisma.poolUser.findUnique({ where: { id: params.id } })
  if (!existing) {
    return NextResponse.json({ error: 'Mitarbeiter:in nicht gefunden.' }, { status: 404 })
  }

  await prisma.poolUser.update({
    where: { id: params.id },
    data: { password: await hashPoolPassword(password) },
  })

  return NextResponse.json({ ok: true })
}
