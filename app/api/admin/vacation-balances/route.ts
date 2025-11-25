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
    const { employeeId, year, totalDays, startDate, carryoverDays, sourceYear } = body

    if (!employeeId || !year || totalDays === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Erstelle oder aktualisiere den Feriensaldo
    const balance = await prisma.vacationBalance.upsert({
      where: {
        employeeId_year: {
          employeeId,
          year,
        },
      },
      update: {
        totalDays: parseFloat(totalDays),
        startDate: startDate ? new Date(startDate) : null,
      },
      create: {
        employeeId,
        year,
        totalDays: parseFloat(totalDays),
        startDate: startDate ? new Date(startDate) : null,
        usedDays: 0,
      },
    })

    // Wenn es ein Carryover ist und ein sourceYear angegeben wurde,
    // können wir optional eine Notiz oder Logik hinzufügen
    // (aktuell wird nur der Saldo im Zieljahr erstellt/aktualisiert)

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


