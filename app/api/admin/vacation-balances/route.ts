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
    const includeUsage = request.nextUrl.searchParams.get('includeUsage') === '1'
    const year = parseInt(yearParam, 10)

    if (!employeeId || !Number.isFinite(year)) {
      return NextResponse.json({ error: 'Missing required query params' }, { status: 400 })
    }

    const balance = await prisma.vacationBalance.findUnique({
      where: { employeeId_year: { employeeId, year } },
    })

    if (!debug && !includeUsage) return NextResponse.json(balance)

    let usage: any = null
    if (includeUsage) {
      const vacationService = await prisma.service.findFirst({ where: { name: 'FE' } })
      if (vacationService) {
        const startOfYear = new Date(year, 0, 1)
        const endOfYear = new Date(year, 11, 31, 23, 59, 59)
        const entries = await prisma.scheduleEntry.findMany({
          where: {
            employeeId,
            serviceId: vacationService.id,
            date: { gte: startOfYear, lte: endOfYear },
          },
          select: { id: true, date: true, startTime: true, endTime: true },
          orderBy: { date: 'asc' },
        })

        const toDay = (d: Date) => d.toISOString().slice(0, 10)
        const days = entries.map((e) => toDay(e.date))
        const dayCounts = new Map<string, number>()
        for (const d of days) dayCounts.set(d, (dayCounts.get(d) ?? 0) + 1)
        const uniqueDays = Array.from(dayCounts.keys()).sort()

        const duplicates = uniqueDays
          .filter((d) => (dayCounts.get(d) ?? 0) > 1)
          .slice(0, 25)
          .map((d) => ({ day: d, count: dayCounts.get(d) ?? 0 }))

        const todayIso = new Date().toISOString().slice(0, 10)
        const futureDays = uniqueDays.filter((d) => d > todayIso)
        const futureEntriesCount = entries.filter((e) => toDay(e.date) > todayIso).length

        usage = {
          service: 'FE',
          entriesCount: entries.length,
          uniqueDaysCount: uniqueDays.length,
          firstDay: uniqueDays[0] ?? null,
          lastDay: uniqueDays[uniqueDays.length - 1] ?? null,
          today: todayIso,
          futureUniqueDaysCount: futureDays.length,
          futureEntriesCount,
          duplicates,
          sampleDays: uniqueDays.slice(0, 60),
        }
      } else {
        usage = { service: 'FE', error: 'Service FE not found' }
      }
    }

    if (!debug) return NextResponse.json({ balance, usage })

    return NextResponse.json({
      balance,
      usage,
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


