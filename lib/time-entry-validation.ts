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
  // Hole alle Einträge für diesen Tag
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)

  const existingEntries = await prisma.timeEntry.findMany({
    where: {
      employeeId,
      date: {
        gte: dayStart,
        lte: dayEnd,
      },
      // Nur WORK-Einträge prüfen (SLEEP und SLEEP_INTERRUPTION können überlappen)
      entryType: 'WORK',
      // Schließe den aktuellen Eintrag aus (bei Updates)
      ...(excludeEntryId ? { id: { not: excludeEntryId } } : {}),
    },
  })

  // Prüfe Überlappung mit jedem bestehenden Eintrag
  // WICHTIG: Bei Nachtdiensten: Blöcke 19:00-23:00 und 06:01-XX:XX am gleichen Tag
  // gehören zu verschiedenen Nachtdiensten und sollten nicht als Überschneidung gewertet werden
  const isNightShiftFirstBlock = startTime.getHours() === 19 && startTime.getMinutes() === 0 && 
                                  endTime && endTime.getHours() === 23 && endTime.getMinutes() === 0
  const isNightShiftSecondBlock = startTime.getHours() === 6 && startTime.getMinutes() === 1

  for (const entry of existingEntries) {
    // Prüfe ob der bestehende Eintrag ein Nachtdienst-Block ist
    const existingIsNightShiftFirstBlock = entry.startTime.getHours() === 19 && entry.startTime.getMinutes() === 0 &&
                                           entry.endTime && entry.endTime.getHours() === 23 && entry.endTime.getMinutes() === 0
    const existingIsNightShiftSecondBlock = entry.startTime.getHours() === 6 && entry.startTime.getMinutes() === 1

    // Wenn der neue Block ein Nachtdienst-Block ist und der bestehende Eintrag auch ein Nachtdienst-Block ist,
    // aber unterschiedliche Typen (erster vs. zweiter Block), dann keine Überschneidung prüfen
    // Diese gehören zu verschiedenen Nachtdiensten
    if ((isNightShiftFirstBlock && existingIsNightShiftSecondBlock) ||
        (isNightShiftSecondBlock && existingIsNightShiftFirstBlock)) {
      continue // Überspringe diese Prüfung, da es verschiedene Nachtdienste sind
    }

    if (timeRangesOverlap(startTime, endTime, entry.startTime, entry.endTime)) {
      return { overlaps: true, overlappingEntry: entry }
    }
  }

  // Bei Nachtdienst: Prüfe auch Einträge vom Vortag/Folgetag
  // Wenn Startzeit 06:01 ist, prüfe auch den Vortag
  if (isNightShiftSecondBlock) {
    const previousDay = new Date(date)
    previousDay.setDate(previousDay.getDate() - 1)
    const prevDayStart = new Date(previousDay)
    prevDayStart.setHours(0, 0, 0, 0)
    const prevDayEnd = new Date(previousDay)
    prevDayEnd.setHours(23, 59, 59, 999)

    const prevDayEntries = await prisma.timeEntry.findMany({
      where: {
        employeeId,
        date: {
          gte: prevDayStart,
          lte: prevDayEnd,
        },
        entryType: 'WORK',
        ...(excludeEntryId ? { id: { not: excludeEntryId } } : {}),
      },
    })

    for (const entry of prevDayEntries) {
      // Prüfe ob der bestehende Eintrag ein Nachtdienst-Block ist
      const existingIsNightShiftFirstBlock = entry.startTime.getHours() === 19 && entry.startTime.getMinutes() === 0 &&
                                             entry.endTime && entry.endTime.getHours() === 23 && entry.endTime.getMinutes() === 0
      
      // Wenn der bestehende Eintrag der erste Block eines Nachtdienstes ist (19:00-23:00),
      // dann gehört er zum gleichen Nachtdienst wie der aktuelle Block (06:01) - das ist erlaubt
      if (existingIsNightShiftFirstBlock) {
        continue // Überspringe diese Prüfung, da es zum gleichen Nachtdienst gehört
      }

      if (timeRangesOverlap(startTime, endTime, entry.startTime, entry.endTime)) {
        return { overlaps: true, overlappingEntry: entry }
      }
    }
  }

  // Wenn Startzeit 19:00 ist, prüfe auch den Folgetag
  if (isNightShiftFirstBlock) {
    const nextDay = new Date(date)
    nextDay.setDate(nextDay.getDate() + 1)
    const nextDayStart = new Date(nextDay)
    nextDayStart.setHours(0, 0, 0, 0)
    const nextDayEnd = new Date(nextDay)
    nextDayEnd.setHours(23, 59, 59, 999)

    const nextDayEntries = await prisma.timeEntry.findMany({
      where: {
        employeeId,
        date: {
          gte: nextDayStart,
          lte: nextDayEnd,
        },
        entryType: 'WORK',
        ...(excludeEntryId ? { id: { not: excludeEntryId } } : {}),
      },
    })

    for (const entry of nextDayEntries) {
      // Prüfe ob der bestehende Eintrag ein Nachtdienst-Block ist
      const existingIsNightShiftSecondBlock = entry.startTime.getHours() === 6 && entry.startTime.getMinutes() === 1
      
      // Wenn der bestehende Eintrag der zweite Block eines Nachtdienstes ist (06:01),
      // dann kann er entweder:
      // 1. Zum gleichen Nachtdienst gehören wie der aktuelle Block (19:00-23:00) - das ist erlaubt
      // 2. Zu einem Nachtdienst vom Vortag gehören - das ist auch erlaubt, da verschiedene Nachtdienste
      // In beiden Fällen sollte keine Überschneidung gewertet werden
      if (existingIsNightShiftSecondBlock) {
        continue // Überspringe diese Prüfung, da es entweder zum gleichen Nachtdienst gehört oder zu einem anderen
      }

      if (timeRangesOverlap(startTime, endTime, entry.startTime, entry.endTime)) {
        return { overlaps: true, overlappingEntry: entry }
      }
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



