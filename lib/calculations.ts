import { startOfMonth, endOfMonth, eachDayOfInterval, getDaysInMonth, isWeekend, format } from 'date-fns'

/**
 * Berechnet das Osterdatum für ein gegebenes Jahr (Gauß'sche Osterformel)
 */
function getEasterDate(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

/**
 * Gibt alle Feiertage des Kantons Zug für ein gegebenes Jahr zurück.
 *
 * Quelle: offizielle Feiertagsliste Kanton Zug
 * (https://www.zg.ch / Feiertage_2024-2027_Kt-ZG_Daten.pdf)
 *
 * Feste Feiertage:
 *   - 01.01. Neujahr
 *   - 02.01. Berchtoldstag
 *   - 19.03. Josefstag
 *   - 01.08. Bundesfeier
 *   - 15.08. Mariä Himmelfahrt
 *   - 01.11. Allerheiligen
 *   - 08.12. Mariä Empfängnis
 *   - 25.12. Weihnachten
 *   - 26.12. Stephanstag
 *
 * Bewegliche Feiertage (Osterzyklus):
 *   - Karfreitag        (Ostern -2)
 *   - Ostermontag       (Ostern +1)
 *   - Auffahrt          (Ostern +39)
 *   - Pfingstmontag     (Ostern +50)
 *   - Fronleichnam      (Ostern +60)
 */
export function getHolidaysForYear(year: number): Date[] {
  const holidays: Date[] = []

  // Feste Feiertage
  holidays.push(new Date(year, 0, 1))   // Neujahrstag
  holidays.push(new Date(year, 0, 2))   // Berchtoldstag
  holidays.push(new Date(year, 2, 19))  // Josefstag
  holidays.push(new Date(year, 7, 1))   // Bundesfeier (1. August)
  holidays.push(new Date(year, 7, 15))  // Mariä Himmelfahrt
  holidays.push(new Date(year, 10, 1))  // Allerheiligen
  holidays.push(new Date(year, 11, 8))  // Mariä Empfängnis
  holidays.push(new Date(year, 11, 25)) // Weihnachten
  holidays.push(new Date(year, 11, 26)) // Stephanstag

  // Bewegliche Feiertage (basierend auf Ostern)
  const easter = getEasterDate(year)

  const goodFriday = new Date(easter)
  goodFriday.setDate(easter.getDate() - 2) // Karfreitag
  holidays.push(goodFriday)

  const easterMonday = new Date(easter)
  easterMonday.setDate(easter.getDate() + 1) // Ostermontag
  holidays.push(easterMonday)

  const ascension = new Date(easter)
  ascension.setDate(easter.getDate() + 39) // Auffahrt
  holidays.push(ascension)

  const pentecostMonday = new Date(easter)
  pentecostMonday.setDate(easter.getDate() + 50) // Pfingstmontag
  holidays.push(pentecostMonday)

  const corpusChristi = new Date(easter)
  corpusChristi.setDate(easter.getDate() + 60) // Fronleichnam
  holidays.push(corpusChristi)

  return holidays
}

/**
 * Zählt die tatsächlichen Arbeitstage in einem Monat (Wochentage minus Feiertage)
 */
export function countWorkDaysInMonth(year: number, month: number): number {
  const start = startOfMonth(new Date(year, month - 1))
  const end = endOfMonth(new Date(year, month - 1))
  const days = eachDayOfInterval({ start, end })
  
  const holidays = getHolidaysForYear(year)
  const holidayStrings = holidays.map(h => format(h, 'yyyy-MM-dd'))
  
  let workDays = 0
  for (const day of days) {
    // Nur Wochentage (Mo-Fr) zählen
    if (!isWeekend(day)) {
      const dayString = format(day, 'yyyy-MM-dd')
      // Feiertage ausschließen
      if (!holidayStrings.includes(dayString)) {
        workDays++
      }
    }
  }
  
  return workDays
}

/**
 * Berechnet die Soll-Arbeitszeit für einen Monat basierend auf:
 * - Wochenstunden (Standard für Kanton Zug: ~42.5 Stunden/Woche)
 * - Pensum (0 - 100, z.B. 50 = 50%)
 * - Anzahl Arbeitstage im Monat (Wochentage minus Feiertage des Kantons Zug)
 */
export function calculateMonthlyTargetHours(
  weeklyHours: number,
  pensum: number,
  year: number,
  month: number
): number {
  // Durchschnittliche Stunden pro Arbeitstag
  const hoursPerWorkDay = weeklyHours / 5
  
  // Zähle tatsächliche Arbeitstage (Wochentage minus Feiertage)
  const workDays = countWorkDaysInMonth(year, month)
  
  // Pensum von Prozent (0-100) zu Dezimal (0.0-1.0) umwandeln
  const pensumDecimal = pensum / 100
  
  // Soll-Stunden für den Monat
  const monthlyHours = workDays * hoursPerWorkDay * pensumDecimal
  
  return Math.round(monthlyHours * 100) / 100 // Auf 2 Dezimalstellen gerundet
}

/**
 * Prüft ob ein Datum ein Sonntag oder Feiertag im Kanton Zug ist
 */
export function isHolidayOrSunday(date: Date, year: number): boolean {
  // Prüfe Sonntag
  if (date.getDay() === 0) {
    return true
  }
  
  // Prüfe Feiertage
  const holidays = getHolidaysForYear(year)
  const dateString = format(date, 'yyyy-MM-dd')
  const holidayStrings = holidays.map(h => format(h, 'yyyy-MM-dd'))
  
  return holidayStrings.includes(dateString)
}

/**
 * Berechnet den Zeitzuschlag (10%) für Sonn-/Feiertage
 */
export function calculateSurchargeHours(workHours: number): number {
  return Math.round((workHours * 0.1) * 100) / 100
}

/**
 * Berechnet die effektive Arbeitszeit aus einem TimeEntry
 */
export function calculateWorkHours(
  startTime: Date,
  endTime: Date,
  breakMinutes: number = 0
): number {
  const diffMs = endTime.getTime() - startTime.getTime()
  const diffMinutes = diffMs / (1000 * 60)
  const workMinutes = diffMinutes - breakMinutes
  return Math.round((workMinutes / 60) * 100) / 100
}

/**
 * Prüft ob ein Arbeitszeit-Block die 6-Stunden-Regel verletzt
 */
export function violatesMaxWorkBlock(startTime: Date, endTime: Date): boolean {
  const diffMs = endTime.getTime() - startTime.getTime()
  const diffMinutes = diffMs / (1000 * 60)
  // 6 Stunden = 360 Minuten, prüfe ob mehr als 360 Minuten
  return diffMinutes > 360
}

/**
 * Prüft ob eine Pause mindestens 45 Minuten lang ist
 */
export function isValidBreak(breakMinutes: number): boolean {
  return breakMinutes >= 45
}

// Re-export für Kompatibilität
export { isDateEditableForEmployee } from './date-validation'

/**
 * Standard Wochenstunden für Kanton Zug, Schweiz
 * Basierend auf dem Schweizer Arbeitsgesetz
 */
export const DEFAULT_WEEKLY_HOURS = 42.5

