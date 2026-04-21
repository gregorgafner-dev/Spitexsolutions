import { prisma } from './db'
import { calculateWorkHours } from './calculations'
import { calculateMonthlyTargetHours, DEFAULT_WEEKLY_HOURS } from './calculations'

export async function updateMonthlyBalance(employeeId: string, date: Date) {
  const year = date.getFullYear()
  const month = date.getMonth() + 1

  // Hole Employee mit Pensum
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  })

  if (!employee) return

  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month, 0, 23, 59, 59)

  // Hole WorkTimeConfig für das Jahr
  let workTimeConfig = await prisma.workTimeConfig.findUnique({
    where: { year },
  })

  if (!workTimeConfig) {
    // Erstelle Standard-Config für Kanton Zug
    workTimeConfig = await prisma.workTimeConfig.create({
      data: {
        year,
        weeklyHours: DEFAULT_WEEKLY_HOURS,
      },
    })
  }

  // Berechne tatsächliche Stunden für den Monat
  const timeEntries = await prisma.timeEntry.findMany({
    where: {
      employeeId,
      date: {
        gte: monthStart,
        lte: monthEnd,
      },
      endTime: { not: null },
    },
  })

  const actualHoursFromTimeEntries = timeEntries.reduce((sum, entry) => {
    if (entry.endTime && entry.entryType !== 'SLEEP' && entry.entryType !== 'SLEEP_INTERRUPTION') {
      return sum + calculateWorkHours(entry.startTime, entry.endTime, entry.breakMinutes)
    }
    if (entry.entryType === 'SLEEP_INTERRUPTION') {
      return sum + (entry.sleepInterruptionMinutes || 0) / 60
    }
    return sum
  }, 0)

  const surchargeHours = timeEntries.reduce((sum, entry) => {
    return sum + (entry.surchargeHours || 0)
  }, 0)

  // Dienstplan-Absenzen (Ferien/Krankheit) sollen in den Stundensaldo einfliessen.
  // Regel: Zähle FE/K Stunden aus dem Dienstplan als "Ist", aber nur an Tagen OHNE Zeiterfassung,
  // um Doppelzählungen zu vermeiden.
  const scheduleAbsences = await prisma.scheduleEntry.findMany({
    where: {
      employeeId,
      date: { gte: monthStart, lte: monthEnd },
      service: { name: { in: ['FE', 'K'] } },
    },
    include: { service: true },
  })

  const isoDay = (d: Date) => d.toISOString().slice(0, 10)
  const daysWithTimeEntries = new Set(timeEntries.map((t) => isoDay(t.date)))
  const scheduleAbsenceHoursTotal = scheduleAbsences.reduce((sum, e) => {
    const h = (e.endTime.getTime() - e.startTime.getTime()) / (1000 * 60 * 60)
    return sum + h
  }, 0)
  const scheduleAbsenceHoursCredited = scheduleAbsences.reduce((sum, e) => {
    const day = isoDay(e.date)
    if (daysWithTimeEntries.has(day)) return sum
    const h = (e.endTime.getTime() - e.startTime.getTime()) / (1000 * 60 * 60)
    return sum + h
  }, 0)

  const actualHours =
    employee.employmentType === 'MONTHLY_SALARY'
      ? actualHoursFromTimeEntries + scheduleAbsenceHoursCredited
      : actualHoursFromTimeEntries

  // Berechne Soll-Stunden für den Monat
  const targetHours = calculateMonthlyTargetHours(
    workTimeConfig.weeklyHours,
    employee.pensum,
    year,
    month
  )

  // Hole Vormonatssaldo
  // AUSNAHME: Nur November 2025 startet mit previousBalance = 0 (Testphase, unterjährig)
  // Alle anderen Monate (auch zukünftige November) übernehmen den Vormonatssaldo normal
  let previousBalance = 0
  const isNovember2025 = year === 2025 && month === 11
  
  if (isNovember2025) {
    // Nur November 2025: Startet mit previousBalance = 0 (einmalige Ausnahme)
    previousBalance = 0
  } else {
    // Alle anderen Monate: Normal mitlaufen (auch zukünftige November)
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year

    const prevMonthlyBalance = await prisma.monthlyBalance.findUnique({
      where: {
        employeeId_year_month: {
          employeeId,
          year: prevYear,
          month: prevMonth,
        },
      },
    })

    if (prevMonthlyBalance) {
      previousBalance = prevMonthlyBalance.balance
    }
  }

  // Berechne Saldo
  const balance = actualHours + surchargeHours - targetHours + previousBalance

  // Aktualisiere oder erstelle Monatssaldo
  await prisma.monthlyBalance.upsert({
    where: {
      employeeId_year_month: {
        employeeId,
        year,
        month,
      },
    },
    update: {
      actualHours,
      surchargeHours,
      targetHours,
      balance,
      previousBalance,
    },
    create: {
      employeeId,
      year,
      month,
      actualHours,
      surchargeHours,
      targetHours,
      balance,
      previousBalance,
      plannedHours: 0,
    },
  })
}

