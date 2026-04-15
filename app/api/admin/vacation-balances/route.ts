import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { employeeId, year, totalDays, startDate } = body

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

    return NextResponse.json(balance)
  } catch (error) {
    console.error('Error creating/updating vacation balance:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ 
      error: 'Internal server error',
      details: errorMessage 
    }, { status: 500 })
  }
}


