import { prisma } from './db'

/**
 * Aktualisiert den Feriensaldo basierend auf Ferien-Einträgen im Dienstplan
 * Zählt Ferien aus ScheduleEntry mit Service "FE" (Ferien) für das angegebene Jahr.
 *
 * Business-Regel (Saldo "per heute"):
 * - Nur eindeutige Kalendertage zählen (Duplikate pro Datum werden 1x gezählt)
 * - Keine Zukunftstage zählen (nur bis inkl. "heute")
 * - Wochenenden zählen nicht (Sa/So)
 *
 * Hinweis: Diese Funktion wird beim Erstellen/Löschen von FE-Einträgen aufgerufen.
 * Zusätzlich sollte sie beim Rendern relevanter Pages (Dashboard/Admin) aufgerufen werden,
 * damit sich der Saldo täglich korrekt aktualisiert.
 */
export async function updateVacationBalanceFromSchedule(employeeId: string, year: number) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { employmentType: true },
  })

  // Stundenlöhner werden nicht über Feriensaldi geführt.
  if (!employee || employee.employmentType !== 'MONTHLY_SALARY') {
    return
  }

  // Hole den Service "FE" (Ferien)
  const vacationService = await prisma.service.findFirst({
    where: { name: 'FE' },
  })

  if (!vacationService) {
    console.warn('Service "FE" (Ferien) nicht gefunden')
    return
  }

  // Hole alle Ferien-Einträge aus dem Dienstplan für das Jahr
  const startOfYear = new Date(year, 0, 1)
  const endOfYear = new Date(year, 11, 31, 23, 59, 59)

  const vacationEntries = await prisma.scheduleEntry.findMany({
    where: {
      employeeId,
      serviceId: vacationService.id,
      date: {
        gte: startOfYear,
        lte: endOfYear,
      },
    },
    select: { date: true },
  })

  const todayIso = new Date().toISOString().slice(0, 10)
  const isoDay = (d: Date) => d.toISOString().slice(0, 10)
  const isWeekendIsoDay = (dayIso: string) => {
    const dt = new Date(`${dayIso}T00:00:00.000Z`)
    const wd = dt.getUTCDay() // 0=So ... 6=Sa
    return wd === 0 || wd === 6
  }

  // Eindeutige Tage, nur bis inkl. heute, ohne Wochenenden
  const uniqueDays = Array.from(new Set(vacationEntries.map((e) => isoDay(e.date))))
    .filter((d) => d <= todayIso)
    .filter((d) => !isWeekendIsoDay(d))

  const usedDays = uniqueDays.length

  // Hole oder erstelle VacationBalance für das Jahr
  const vacationBalance = await prisma.vacationBalance.findUnique({
    where: {
      employeeId_year: {
        employeeId,
        year,
      },
    },
  })

  if (vacationBalance) {
    // Aktualisiere nur usedDays, behalte totalDays
    await prisma.vacationBalance.update({
      where: {
        employeeId_year: {
          employeeId,
          year,
        },
      },
      data: {
        usedDays,
      },
    })
  } else {
    // Erstelle neuen VacationBalance mit Standard-Werten
    // Standard: 25 Tage (kann später manuell angepasst werden)
    await prisma.vacationBalance.create({
      data: {
        employeeId,
        year,
        totalDays: 25,
        usedDays,
      },
    })
  }
}

/**
 * Aktualisiert den Feriensaldo für alle Jahre, in denen der Mitarbeiter Ferien hat
 * Wird aufgerufen, wenn ein Ferien-Eintrag erstellt oder gelöscht wird
 */
export async function updateVacationBalanceForEmployee(employeeId: string, date: Date) {
  const year = date.getFullYear()
  
  // Aktualisiere für das aktuelle Jahr
  await updateVacationBalanceFromSchedule(employeeId, year)
  
  // Aktualisiere auch für das nächste Jahr (falls Ferien über Jahreswechsel gehen)
  await updateVacationBalanceFromSchedule(employeeId, year + 1)
}


