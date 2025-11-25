import { prisma } from './db'

/**
 * Aktualisiert den Feriensaldo basierend auf Ferien-Einträgen im Dienstplan
 * Zählt alle ScheduleEntry mit Service "FE" (Ferien) für das angegebene Jahr
 */
export async function updateVacationBalanceFromSchedule(employeeId: string, year: number) {
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
  })

  // Zähle die Anzahl der Ferientage (jeder Eintrag = 1 Tag)
  const usedDays = vacationEntries.length

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


