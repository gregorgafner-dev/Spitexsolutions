import { format, isWeekend } from 'date-fns'
import { getHolidaysForYear } from './calculations'

/**
 * Gemeinsame Logik für die Gutschrift bezahlter Absenzen (Krankheit/Ferien)
 * "gem. Soll". Wird von Stundensaldo UND Hotelrechnung genutzt, damit beide
 * exakt dieselben Werte verwenden.
 *
 * Regeln (Entscheidung Geschäftsführung, 06.08.2026):
 *   - Es darf pro Tag MAXIMAL das Tages-Soll gebucht werden (keine Überstunden
 *     durch Absenz).
 *   - Nur Werktage zählen (Mo–Fr ohne Zuger Feiertage). Wochenende/Feiertag = 0.
 *   - Monatslohn: Krankheit (K) UND Ferien (FE).
 *   - Stundenlohn: NUR Krankheit (K) – Ferien werden über den Lohn abgegolten.
 *   - Pro Tag gilt: gutgeschriebene Absenz = max(0, Tages-Soll − bereits gearbeitet),
 *     d.h. eine voll krankgeschriebene Woche ergibt exakt das Soll (Saldo ±0).
 */

/** Tages-Soll = Wochenstunden/5 × Pensum. */
export function dailyTargetHours(weeklyHours: number, pensum: number): number {
  return (weeklyHours / 5) * (pensum / 100)
}

/** Menge der Feiertags-Tagesschlüssel (yyyy-MM-dd) für ein Jahr. */
export function holidayKeySet(year: number): Set<string> {
  return new Set(getHolidaysForYear(year).map((h) => format(h, 'yyyy-MM-dd')))
}

/** true, wenn das Datum ein Werktag ist (kein Wochenende, kein Feiertag). */
export function isWorkDay(date: Date, holidays: Set<string>): boolean {
  if (isWeekend(date)) return false
  return !holidays.has(format(date, 'yyyy-MM-dd'))
}

/**
 * Dienstplan-Services, die je Anstellungstyp als bezahlte Absenz "gem. Soll"
 * gelten.
 */
export function qualifyingAbsenceServices(employmentType: string): string[] {
  return employmentType === 'MONTHLY_SALARY' ? ['K', 'FE'] : ['K']
}

export type AbsenceCreditInput = {
  weeklyHours: number
  pensum: number
  year: number
  /** Kalendertage (Date, i.d.R. Mitternacht) mit qualifizierender Absenz. */
  absenceDays: Date[]
  /** Bereits gearbeitete Stunden je Tagesschlüssel (yyyy-MM-dd). */
  workedHoursByDay: Map<string, number>
}

/**
 * Summe der gutzuschreibenden Absenz-Stunden gem. Soll:
 * pro Werktag max. (Tages-Soll − bereits gearbeitet), Wochenende/Feiertag = 0,
 * jeder Kalendertag zählt höchstens einmal.
 */
export function computeCreditedAbsenceHours(input: AbsenceCreditInput): number {
  const soll = dailyTargetHours(input.weeklyHours, input.pensum)
  const holidays = holidayKeySet(input.year)
  const seen = new Set<string>()
  let total = 0
  for (const d of input.absenceDays) {
    const key = format(d, 'yyyy-MM-dd')
    if (seen.has(key)) continue
    seen.add(key)
    if (!isWorkDay(d, holidays)) continue
    const worked = input.workedHoursByDay.get(key) ?? 0
    total += Math.max(0, soll - worked)
  }
  return Math.round(total * 100) / 100
}
