import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import { calculateWorkHours } from '@/lib/calculations'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { employeeIds, startDate, endDate } = body

    if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      return NextResponse.json({ error: 'Keine Mitarbeiter ausgewählt' }, { status: 400 })
    }

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'Datumbereich fehlt' }, { status: 400 })
    }

    const start = new Date(startDate)
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999) // Bis Ende des Tages

    if (start > end) {
      return NextResponse.json({ error: 'Startdatum muss vor Enddatum liegen' }, { status: 400 })
    }

    // Hole Mitarbeiter mit User-Informationen (inkl. employmentType)
    const employees = await prisma.employee.findMany({
      where: {
        id: {
          in: employeeIds,
        },
      },
      include: {
        user: true,
      },
    })

    if (employees.length === 0) {
      return NextResponse.json({ error: 'Keine Mitarbeiter gefunden' }, { status: 404 })
    }

    const results = []

    for (const employee of employees) {
      // Hole alle Zeiteinträge im Zeitraum
      const timeEntries = await prisma.timeEntry.findMany({
        where: {
          employeeId: employee.id,
          date: {
            gte: start,
            lte: end,
          },
          endTime: { not: null },
        },
      })

      // Berechne Arbeitsstunden
      let hours = 0
      let surchargeHours = 0
      let sleepHours = 0
      let sleepInterruptionHours = 0

      for (const entry of timeEntries) {
        if (entry.endTime && entry.entryType === 'SLEEP') {
          // Berechne Schlafstunden
          const sleepStart = new Date(entry.startTime).getTime()
          const sleepEnd = new Date(entry.endTime).getTime()
          const sleepMinutes = (sleepEnd - sleepStart) / (1000 * 60)
          sleepHours += sleepMinutes / 60
        } else if (entry.endTime && entry.entryType !== 'SLEEP' && entry.entryType !== 'SLEEP_INTERRUPTION') {
          // Normale Arbeitsstunden
          hours += calculateWorkHours(entry.startTime, entry.endTime, entry.breakMinutes)
        }
        // Addiere Unterbrechungen während des Schlafens zur Arbeitszeit
        if (entry.entryType === 'SLEEP_INTERRUPTION') {
          sleepInterruptionHours += (entry.sleepInterruptionMinutes || 0) / 60
          // Unterbrechungen zählen auch als Arbeitszeit
          hours += (entry.sleepInterruptionMinutes || 0) / 60
        }
        // Summiere Zeitzuschläge
        surchargeHours += entry.surchargeHours || 0
      }

      results.push({
        employeeId: employee.id,
        employeeName: `${employee.user.lastName}, ${employee.user.firstName}`,
        employmentType: employee.employmentType, // MONTHLY_SALARY oder HOURLY_WAGE
        hours: hours,
        surchargeHours: surchargeHours,
        sleepHours: sleepHours,
        sleepInterruptionHours: sleepInterruptionHours,
        totalHours: hours + surchargeHours,
      })
    }

    // Sortiere nach Nachname
    results.sort((a, b) => {
      const nameA = a.employeeName.toLowerCase()
      const nameB = b.employeeName.toLowerCase()
      if (nameA < nameB) return -1
      if (nameA > nameB) return 1
      return 0
    })

    return NextResponse.json({
      results,
    })
  } catch (error) {
    console.error('Error in calculations route:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

