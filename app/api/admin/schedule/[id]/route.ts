import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import { updateVacationBalanceForEmployee } from '@/lib/update-vacation-balance'
import { isScheduleDateEditable } from '@/lib/schedule-date-validation'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const entry = await prisma.scheduleEntry.findUnique({
      where: { id: params.id },
    })

    if (!entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    }

    // Prüfe ob das Datum noch bearbeitbar ist
    if (!isScheduleDateEditable(entry.date)) {
      return NextResponse.json(
        { error: 'Dieses Datum kann nicht mehr bearbeitet werden. Rückwirkende Bearbeitung ist nur bis zum 5. Tag des Folgemonats möglich.' },
        { status: 403 }
      )
    }

    // Prüfe ob es ein Ferien-Eintrag ist (vor dem Löschen)
    const service = await prisma.service.findUnique({
      where: { id: entry.serviceId },
    })

    await prisma.scheduleEntry.delete({
      where: { id: params.id },
    })

    // Aktualisiere geplante Stunden im Monatssaldo
    await updatePlannedHours(entry.employeeId, entry.date)

    // Wenn es ein Ferien-Eintrag war, aktualisiere Feriensaldo
    if (service && service.name === 'FE') {
      await updateVacationBalanceForEmployee(entry.employeeId, entry.date)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting schedule entry:', error)
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

