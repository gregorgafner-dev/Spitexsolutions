import { addDays, isSameDay, parseISO, format } from 'date-fns'

type MinimalEntry = {
  id: string
  date: string | Date
  startTime: string | Date
  endTime: string | Date | null
  entryType: 'WORK' | 'SLEEP' | 'SLEEP_INTERRUPTION' | string
}

const sameYMD = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/**
 * Ermittelt alle TimeEntry-IDs, die zu einem Nachtdienst gehören und beim Löschen
 * zusammen entfernt werden sollen.
 *
 * Unterstützt:
 * - Neues Modell: alles am Startdatum gebucht (entry.date = Startdatum), Zeitstempel teils Folgetag
 * - Altes Split-Modell: 00:00–06:00 / 06:01 / Unterbrechung am Folgetag gebucht (date == startTime-Kalendertag)
 */
export function computeNightShiftRelatedEntryIdsForEmployeeDelete(args: {
  entryId: string
  selectedDate: Date
  entries: MinimalEntry[]
}): Set<string> {
  const { entryId, selectedDate, entries } = args

  const related = new Set<string>([entryId])

  // Bestimme Buchungsdatum (für den Fall, dass ein alter Split-Eintrag am Folgetag gelöscht wird)
  const clicked = entries.find((e) => e.id === entryId)
  let bookingDate = new Date(selectedDate)
  bookingDate.setHours(0, 0, 0, 0)

  if (clicked) {
    const entryDate = typeof clicked.date === 'string' ? new Date(clicked.date) : new Date(clicked.date)
    entryDate.setHours(0, 0, 0, 0)
    const startIso = typeof clicked.startTime === 'string' ? parseISO(clicked.startTime) : new Date(clicked.startTime)
    const startHm = format(startIso, 'HH:mm')
    const isOldSplit = sameYMD(entryDate, startIso)
    if (isOldSplit && (startHm.startsWith('06:01') || startHm.startsWith('00:00') || clicked.entryType === 'SLEEP_INTERRUPTION')) {
      bookingDate = new Date(entryDate)
      bookingDate.setDate(bookingDate.getDate() - 1)
      bookingDate.setHours(0, 0, 0, 0)
    } else {
      bookingDate = new Date(entryDate)
      bookingDate.setHours(0, 0, 0, 0)
    }
  }

  const bookingNextDay = addDays(bookingDate, 1)

  for (const e of entries) {
    const entryDate = typeof e.date === 'string' ? new Date(e.date) : new Date(e.date)
    const startIso = typeof e.startTime === 'string' ? parseISO(e.startTime) : new Date(e.startTime)
    const endIso = e.endTime ? (typeof e.endTime === 'string' ? parseISO(e.endTime) : new Date(e.endTime)) : null
    const startHm = format(startIso, 'HH:mm')
    const endHm = endIso ? format(endIso, 'HH:mm') : ''

    const isBookingDay = isSameDay(entryDate, bookingDate)
    const isNextDay = isSameDay(entryDate, bookingNextDay)

    // Neues Modell: alles am Buchungsdatum
    if (isBookingDay) {
      if (e.entryType === 'WORK' && endIso) {
        const isFirstWork = (startHm.startsWith('19:') || startHm === '19:00') && (endHm === '23:00' || endHm.startsWith('23:'))
        const isSecondWork = startHm === '06:01' || startHm.startsWith('06:01')
        if (isFirstWork || isSecondWork) related.add(e.id)
      }
      if (e.entryType === 'SLEEP' && endIso) {
        if (startHm.startsWith('23:01') || startHm.startsWith('00:00')) related.add(e.id)
      }
      if (e.entryType === 'SLEEP_INTERRUPTION') related.add(e.id)
    }

    // Legacy: Split am Folgetag gebucht (date == startTime-Kalendertag)
    if (isNextDay) {
      const entryDateIsStartDay = sameYMD(entryDate, startIso)
      if (!entryDateIsStartDay) continue
      if (e.entryType === 'WORK' && endIso && (startHm === '06:01' || startHm.startsWith('06:01'))) related.add(e.id)
      if (e.entryType === 'SLEEP' && endIso && startHm.startsWith('00:00')) related.add(e.id)
      if (e.entryType === 'SLEEP_INTERRUPTION') related.add(e.id)
    }
  }

  return related
}

