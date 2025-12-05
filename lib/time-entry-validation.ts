import { prisma } from '@/lib/db'
import { TimeEntry } from '@prisma/client'

/**
 * Prüft ob zwei Zeitbereiche überlappen
 */
function timeRangesOverlap(
  start1: Date,
  end1: Date | null,
  start2: Date,
  end2: Date | null
): boolean {
  // Wenn einer der Einträge keine Endzeit hat, prüfe ob die Startzeiten überlappen
  if (!end1 || !end2) {
    // Offene Einträge können nicht überlappen, da nur einer offen sein darf
    return false
  }

  // Prüfe ob die Bereiche überlappen
  return start1 < end2 && start2 < end1
}

/**
 * Prüft ob ein neuer/aktualisierter Eintrag mit bestehenden Einträgen überlappt
 */
export async function checkOverlappingBlocks(
  employeeId: string,
  date: Date,
  startTime: Date,
  endTime: Date | null,
  excludeEntryId?: string // ID des Eintrags, der aktualisiert wird (wird bei Prüfung ausgeschlossen)
): Promise<{ overlaps: boolean; overlappingEntry?: TimeEntry }> {
  // WICHTIG: Bei Ein-Tag-Buchung für Nachtdienste müssen wir auch Einträge vom Vortag/Folgetag prüfen
  // Hole alle Einträge für diesen Tag, Vortag und Folgetag
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)
  
  const previousDay = new Date(date)
  previousDay.setDate(previousDay.getDate() - 1)
  const previousDayStart = new Date(previousDay)
  previousDayStart.setHours(0, 0, 0, 0)
  const previousDayEnd = new Date(previousDay)
  previousDayEnd.setHours(23, 59, 59, 999)
  
  const nextDay = new Date(date)
  nextDay.setDate(nextDay.getDate() + 1)
  const nextDayStart = new Date(nextDay)
  nextDayStart.setHours(0, 0, 0, 0)
  const nextDayEnd = new Date(nextDay)
  nextDayEnd.setHours(23, 59, 59, 999)

  const existingEntries = await prisma.timeEntry.findMany({
    where: {
      employeeId,
      AND: [
        {
          OR: [
            { date: { gte: dayStart, lte: dayEnd } },
            { date: { gte: previousDayStart, lte: previousDayEnd } },
            { date: { gte: nextDayStart, lte: nextDayEnd } },
          ],
        },
        {
          // Nur WORK-Einträge prüfen (SLEEP und SLEEP_INTERRUPTION können überlappen)
          entryType: 'WORK',
        },
        // Schließe den aktuellen Eintrag aus (bei Updates)
        ...(excludeEntryId ? [{ id: { not: excludeEntryId } }] : []),
      ],
    },
  })

  // Prüfe Überlappung mit jedem bestehenden Eintrag
  // WICHTIG: Bei Ein-Tag-Buchung für Nachtdienste werden beide Blöcke auf das Startdatum gebucht
  // Wir müssen die tatsächlichen Zeiten vergleichen, nicht nur das Datum
  // Nachtdienst-Blöcke: Erster Block (18:00-24:00) und zweiter Block (00:00-08:00) überlappen nicht
  const isNightShiftFirstBlock = startTime.getHours() >= 18 && endTime && 
                                  (endTime.getHours() >= 22 || endTime.getHours() <= 1)
  const isNightShiftSecondBlock = startTime.getHours() < 8

  for (const entry of existingEntries) {
    // Prüfe ob der bestehende Eintrag ein Nachtdienst-Block ist
    const existingIsNightShiftFirstBlock = entry.startTime.getHours() >= 18 && entry.endTime &&
                                          (entry.endTime.getHours() >= 22 || entry.endTime.getHours() <= 1)
    const existingIsNightShiftSecondBlock = entry.startTime.getHours() < 8

    // Wenn beide Blöcke Nachtdienst-Blöcke sind, aber unterschiedliche Typen (erster vs. zweiter Block),
    // dann gehören sie zum gleichen Nachtdienst - das ist erlaubt
    if ((isNightShiftFirstBlock && existingIsNightShiftSecondBlock) ||
        (isNightShiftSecondBlock && existingIsNightShiftFirstBlock)) {
      // Prüfe ob sie zum gleichen Nachtdienst gehören (gleicher Tag oder Vortag/Folgetag)
      const entryDate = new Date(entry.date)
      const entryDateOnly = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate())
      const newDateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate())
      const dayDiff = Math.abs((entryDateOnly.getTime() - newDateOnly.getTime()) / (1000 * 60 * 60 * 24))
      
      // Wenn die Blöcke am gleichen Tag oder am Vortag/Folgetag sind, gehören sie zum gleichen Nachtdienst
      if (dayDiff <= 1) {
        continue // Überspringe diese Prüfung, da es zum gleichen Nachtdienst gehört
      }
    }

    // Prüfe Überlappung basierend auf tatsächlichen Zeiten (unabhängig vom Buchungsdatum)
    if (timeRangesOverlap(startTime, endTime, entry.startTime, entry.endTime)) {
      return { overlaps: true, overlappingEntry: entry }
    }
  }

  return { overlaps: false }
}

/**
 * Prüft ob Endzeit vor Startzeit liegt (negative Arbeitszeit)
 */
export function checkNegativeWorkTime(startTime: Date, endTime: Date | null): boolean {
  if (!endTime) {
    return false // Keine Endzeit ist erlaubt (offener Eintrag)
  }
  return endTime <= startTime
}

/**
 * Prüft ob Endzeit fehlt (nur für WORK-Einträge relevant)
 */
export function checkMissingEndTime(entryType: string, endTime: Date | null): boolean {
  // SLEEP_INTERRUPTION darf keine Endzeit haben
  if (entryType === 'SLEEP_INTERRUPTION') {
    return false
  }
  // WORK-Einträge müssen eine Endzeit haben
  return entryType === 'WORK' && !endTime
}



