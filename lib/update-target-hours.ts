import { prisma } from './db'
import { calculateMonthlyTargetHours } from './calculations'

/**
 * Aktualisiert die Soll-Stunden für einen Mitarbeiter für die nächsten 5 Jahre
 * Wird aufgerufen, wenn sich das Pensum ändert oder ein neuer Mitarbeiter erstellt wird
 */
export async function updateTargetHoursForEmployee(employeeId: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  })

  if (!employee) {
    throw new Error('Employee not found')
  }

  const currentYear = new Date().getFullYear()
  const yearsToProcess = 5 // Nächste 5 Jahre

  // Stelle sicher, dass WorkTimeConfig für alle Jahre existiert
  for (let yearOffset = 0; yearOffset < yearsToProcess; yearOffset++) {
    const year = currentYear + yearOffset
    
    let workTimeConfig = await prisma.workTimeConfig.findUnique({
      where: { year },
    })

    if (!workTimeConfig) {
      workTimeConfig = await prisma.workTimeConfig.create({
        data: {
          year,
          weeklyHours: 42.5,
        },
      })
    }

    // Berechne Soll-Stunden für jeden Monat
    for (let month = 1; month <= 12; month++) {
      const targetHours = calculateMonthlyTargetHours(
        workTimeConfig.weeklyHours,
        employee.pensum,
        year,
        month
      )

      // Hole Vormonatssaldo für die Berechnung
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

      // Hole bestehende Einträge für actualHours und surchargeHours
      const startOfMonth = new Date(year, month - 1, 1)
      const endOfMonth = new Date(year, month, 0, 23, 59, 59)

      const timeEntries = await prisma.timeEntry.findMany({
        where: {
          employeeId,
          date: {
            gte: startOfMonth,
            lte: endOfMonth,
          },
          endTime: { not: null },
        },
      })

      const { calculateWorkHours } = await import('./calculations')
      const actualHours = timeEntries.reduce((sum, entry) => {
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

      // Berechne geplante Stunden
      const scheduleEntries = await prisma.scheduleEntry.findMany({
        where: {
          employeeId,
          date: {
            gte: startOfMonth,
            lte: endOfMonth,
          },
        },
      })

      const plannedHours = scheduleEntries.reduce((sum, entry) => {
        const hours = (entry.endTime.getTime() - entry.startTime.getTime()) / (1000 * 60 * 60)
        return sum + hours
      }, 0)

      // Berechne neuen Saldo
      const balance = (actualHours + surchargeHours) - targetHours + previousBalance

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
          targetHours, // Aktualisiere Soll-Stunden basierend auf neuem Pensum
          previousBalance,
          balance, // Aktualisiere Saldo mit neuem targetHours
          // Behalte actualHours, surchargeHours und plannedHours
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
  }
}

/**
 * Aktualisiert die Soll-Stunden für alle Mitarbeiter für die nächsten 5 Jahre
 * Wird beim Initialisieren verwendet
 */
export async function updateTargetHoursForAllEmployees() {
  const employees = await prisma.employee.findMany()

  for (const employee of employees) {
    try {
      await updateTargetHoursForEmployee(employee.id)
      console.log(`✓ Aktualisiert: ${employee.id}`)
    } catch (error) {
      console.error(`Fehler bei Mitarbeiter ${employee.id}:`, error)
    }
  }
}





