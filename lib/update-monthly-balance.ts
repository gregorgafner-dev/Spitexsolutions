import { prisma } from './db'
import { calculateWorkHours } from './calculations'
import { calculateMonthlyTargetHours, DEFAULT_WEEKLY_HOURS } from './calculations'
import { computeCreditedAbsenceHours, qualifyingAbsenceServices } from './absence-credit'
import { format } from 'date-fns'

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

  // Bezahlte Dienstplan-Absenzen (Krankheit/Ferien) fliessen "gem. Soll" in den
  // Stundensaldo ein: pro Werktag max. das Tages-Soll (keine Überstunden durch
  // Absenz), Wochenende/Feiertag = 0. Monatslohn: K+FE, Stundenlohn: nur K.
  // Ein voll krankgeschriebener Monat ergibt damit exakt das Soll -> Saldo ±0.
  const allowedAbsenceServices = qualifyingAbsenceServices(employee.employmentType)
  const scheduleAbsences = await prisma.scheduleEntry.findMany({
    where: {
      employeeId,
      date: { gte: monthStart, lte: monthEnd },
      service: { name: { in: allowedAbsenceServices } },
    },
    include: { service: true },
  })

  // Bereits gearbeitete Stunden je Kalendertag (für die Deckelung auf das Tages-Soll).
  const workedHoursByDay = new Map<string, number>()
  for (const entry of timeEntries) {
    let h = 0
    if (entry.entryType === 'SLEEP' || entry.entryType === 'SLEEP_INTERRUPTION') {
      if (entry.entryType === 'SLEEP_INTERRUPTION') h = (entry.sleepInterruptionMinutes || 0) / 60
    } else if (entry.endTime) {
      h = calculateWorkHours(entry.startTime, entry.endTime, entry.breakMinutes)
    }
    if (h === 0) continue
    const key = format(entry.date, 'yyyy-MM-dd')
    workedHoursByDay.set(key, (workedHoursByDay.get(key) || 0) + h)
  }

  const creditedAbsenceHours = computeCreditedAbsenceHours({
    weeklyHours: workTimeConfig.weeklyHours,
    pensum: employee.pensum,
    year,
    absenceDays: scheduleAbsences.map((e) => e.date),
    workedHoursByDay,
  })

  // Gutschrift gilt neu für Monats- UND Stundenlohn (bei Stundenlohn nur Krankheit,
  // siehe qualifyingAbsenceServices).
  const actualHours = actualHoursFromTimeEntries + creditedAbsenceHours

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

