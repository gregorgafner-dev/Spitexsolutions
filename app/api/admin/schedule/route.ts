import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import { updateVacationBalanceForEmployee } from '@/lib/update-vacation-balance'
import { isScheduleDateEditable } from '@/lib/schedule-date-validation'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const year = parseInt(searchParams.get('year') || '2024')
    const month = parseInt(searchParams.get('month') || '1')

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59)

    const entries = await prisma.scheduleEntry.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        service: true,
      },
      orderBy: {
        date: 'asc',
      },
    })

    return NextResponse.json(entries)
  } catch (error) {
    console.error('Error fetching schedule entries:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { employeeId, serviceId, date, startTime, endTime } = body

    if (!employeeId || !serviceId || !date || !startTime || !endTime) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Prüfe ob das Datum noch bearbeitbar ist
    const dateObj = new Date(date)
    if (!isScheduleDateEditable(dateObj)) {
      return NextResponse.json(
        { error: 'Dieses Datum kann nicht mehr bearbeitet werden. Rückwirkende Bearbeitung ist nur bis zum 5. Tag des Folgemonats möglich.' },
        { status: 403 }
      )
    }

    // Hole Service und Employee für Pensum-Anpassung
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
    })

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
    })

    if (!service || !employee) {
      return NextResponse.json({ error: 'Service or Employee not found' }, { status: 404 })
    }

    // Berechne Dauer: Bei Ferien (FE) und Krankheit (K) wird die Dauer auf das Pensum angepasst
    let calculatedStartTime = new Date(startTime)
    let calculatedEndTime = new Date(endTime)

    if (service.name === 'FE' || service.name === 'K') {
      // Ferien/Krankheit-Dauer wird auf Pensum angepasst (100% = 504 Min. = 8.4h, 50% = 252 Min. = 4.2h, etc.)
      const baseDuration = service.duration // 504 Minuten bei 100% Pensum
      const adjustedDuration = Math.round(baseDuration * (employee.pensum / 100))
      
      // Setze Startzeit auf 8:00 (Standard)
      calculatedStartTime = new Date(dateObj)
      calculatedStartTime.setHours(8, 0, 0, 0)
      
      // Berechne Endzeit basierend auf angepasster Dauer
      calculatedEndTime = new Date(calculatedStartTime)
      calculatedEndTime.setMinutes(calculatedEndTime.getMinutes() + adjustedDuration)
    }

    const entry = await prisma.scheduleEntry.create({
      data: {
        employeeId,
        serviceId,
        date: dateObj,
        startTime: calculatedStartTime,
        endTime: calculatedEndTime,
      },
      include: {
        service: true,
      },
    })

    // Aktualisiere geplante Stunden im Monatssaldo
    await updatePlannedHours(employeeId, new Date(date))

    // Prüfe ob es ein Ferien-Eintrag ist und aktualisiere Feriensaldo
    if (entry.service && entry.service.name === 'FE') {
      await updateVacationBalanceForEmployee(employeeId, new Date(date))
    }

    return NextResponse.json(entry)
  } catch (error) {
    console.error('Error creating schedule entry:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function updatePlannedHours(employeeId: string, date: Date) {
  const year = date.getFullYear()
  const month = date.getMonth() + 1

  // Hole Employee mit Pensum
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  })

  if (!employee) return

  // Hole WorkTimeConfig für das Jahr
  let workTimeConfig = await prisma.workTimeConfig.findUnique({
    where: { year },
  })

  if (!workTimeConfig) {
    // Erstelle Standard-Config für Kanton Zug
    workTimeConfig = await prisma.workTimeConfig.create({
      data: {
        year,
        weeklyHours: 42.5,
      },
    })
  }

  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0, 23, 59, 59)

  const entries = await prisma.scheduleEntry.findMany({
    where: {
      employeeId,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
  })

  const plannedHours = entries.reduce((sum: number, entry: any) => {
    const hours = (entry.endTime.getTime() - entry.startTime.getTime()) / (1000 * 60 * 60)
    return sum + hours
  }, 0)

  // Berechne Soll-Stunden basierend auf Pensum
  const { calculateMonthlyTargetHours } = await import('@/lib/calculations')
  const targetHours = calculateMonthlyTargetHours(
    workTimeConfig.weeklyHours,
    employee.pensum,
    year,
    month
  )

  // Hole tatsächliche Stunden
  const timeEntries = await prisma.timeEntry.findMany({
    where: {
      employeeId,
      date: {
        gte: startDate,
        lte: endDate,
      },
      endTime: { not: null },
    },
  })

  const { calculateWorkHours } = await import('@/lib/calculations')
  const actualHours = timeEntries.reduce((sum: number, entry: any) => {
    if (entry.endTime && entry.entryType !== 'SLEEP' && entry.entryType !== 'SLEEP_INTERRUPTION') {
      return sum + calculateWorkHours(entry.startTime, entry.endTime, entry.breakMinutes)
    }
    // Addiere Unterbrechungen während des Schlafens zur Arbeitszeit
    if (entry.entryType === 'SLEEP_INTERRUPTION') {
      return sum + (entry.sleepInterruptionMinutes || 0) / 60
    }
    return sum
  }, 0)

  // Summiere Zeitzuschläge
  const surchargeHours = timeEntries.reduce((sum: number, entry: any) => {
    return sum + (entry.surchargeHours || 0)
  }, 0)

  // Hole Vormonatssaldo
  let previousBalance = 0
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year

  const prevBalance = await prisma.monthlyBalance.findUnique({
    where: {
      employeeId_year_month: {
        employeeId,
        year: prevYear,
        month: prevMonth,
      },
    },
  })

  if (prevBalance) {
    previousBalance = prevBalance.balance
  }

  // Berechne neuen Saldo (inkl. Zeitzuschlag)
  const balance = (actualHours + surchargeHours) - targetHours + previousBalance

  await prisma.monthlyBalance.upsert({
    where: {
      employeeId_year_month: {
        employeeId,
        year,
        month,
      },
    },
    update: {
      plannedHours,
      targetHours,
      actualHours,
      surchargeHours,
      balance,
      previousBalance,
    },
    create: {
      employeeId,
      year,
      month,
      targetHours,
      actualHours,
      surchargeHours,
      plannedHours,
      balance,
      previousBalance,
    },
  })
}

