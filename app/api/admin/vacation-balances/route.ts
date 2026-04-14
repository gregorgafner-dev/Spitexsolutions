import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

function dbKind(url: string | undefined) {
  if (!url) return 'unknown'
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return 'postgres'
  if (url.startsWith('file:')) return 'sqlite'
  return 'unknown'
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const employeeId = request.nextUrl.searchParams.get('employeeId') || ''
    const yearParam = request.nextUrl.searchParams.get('year') || ''
    const debug = request.nextUrl.searchParams.get('debug') === '1'
    const year = parseInt(yearParam, 10)

    if (!employeeId || !Number.isFinite(year)) {
      return NextResponse.json({ error: 'Missing required query params' }, { status: 400 })
    }

    const balance = await prisma.vacationBalance.findUnique({
      where: { employeeId_year: { employeeId, year } },
    })

    if (!debug) return NextResponse.json(balance)

    return NextResponse.json({
      balance,
      debug: {
        serverNow: new Date().toISOString(),
        commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null,
        db: dbKind(process.env.DATABASE_URL),
        year,
      },
    })
  } catch (error) {
    console.error('Error fetching vacation balance:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: errorMessage,
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { employeeId, year, totalDays, startDate, debug } = body

    if (!employeeId || !year || totalDays === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Erstelle oder aktualisiere den Feriensaldo
    const totalDaysNum = Number(totalDays)
    if (!Number.isFinite(totalDaysNum)) {
      return NextResponse.json({ error: 'Invalid totalDays' }, { status: 400 })
    }

    const balance = await prisma.vacationBalance.upsert({
      where: {
        employeeId_year: {
          employeeId,
          year,
        },
      },
      update: {
        totalDays: totalDaysNum,
        startDate: startDate ? new Date(startDate) : null,
      },
      create: {
        employeeId,
        year,
        totalDays: totalDaysNum,
        startDate: startDate ? new Date(startDate) : null,
        usedDays: 0,
      },
    })

    if (!debug) return NextResponse.json(balance)

    const after = await prisma.vacationBalance.findUnique({
      where: { employeeId_year: { employeeId, year } },
    })

    return NextResponse.json({
      balance,
      after,
      debug: {
        serverNow: new Date().toISOString(),
        commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null,
        db: dbKind(process.env.DATABASE_URL),
        received: { employeeId, year, totalDays: totalDaysNum, startDate: Boolean(startDate) },
      },
    })
  } catch (error) {
    console.error('Error creating/updating vacation balance:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ 
      error: 'Internal server error',
      details: errorMessage 
    }, { status: 500 })
  }
}


