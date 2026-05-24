/**
 * Datums-Utilities für den Pool-Bereich.
 *
 * Konvention: Datums-Felder in der DB (PoolAvailability.date, PoolBooking.date,
 * PoolShiftRequest.date) speichern reine Kalendertage als Mitternacht UTC.
 * In der UI und in API-Antworten verwenden wir ISO-Datumsstrings "yyyy-mm-dd".
 */

/** Konvertiert ein Date in einen ISO-Datumsstring (yyyy-mm-dd, UTC-Tag). */
export function toIsoDay(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Erzeugt ein Date für den angegebenen ISO-Tag (Mitternacht UTC). */
export function fromIsoDay(iso: string): Date {
  // Strict yyyy-mm-dd parse
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new Error(`Invalid ISO day: ${iso}`)
  const date = new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)))
  return date
}

/** Erster Tag des Monats (Mitternacht UTC). */
export function startOfMonthUTC(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex, 1))
}

/** Erster Tag des Folgemonats (Mitternacht UTC), für exklusive Range-Queries. */
export function startOfNextMonthUTC(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex + 1, 1))
}

export type PoolShiftValue = 'EARLY' | 'LATE'

export function isValidShift(value: unknown): value is PoolShiftValue {
  return value === 'EARLY' || value === 'LATE'
}
