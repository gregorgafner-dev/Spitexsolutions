/**
 * Gesetzliche Feiertage im Kanton Zürich.
 *
 * Quelle: offizielle Feiertagsregelung des Kantons Zürich
 * https://www.zh.ch/de/politik-staat/gesetze-beschluesse/feiertage.html
 *
 * Fixe Feiertage:
 *   Neujahr (01.01), Berchtoldstag (02.01), Tag der Arbeit (01.05),
 *   Nationalfeiertag (01.08), Weihnachten (25.12), Stephanstag (26.12)
 *
 * Bewegliche Feiertage (Osterzyklus):
 *   Karfreitag (Ostern −2), Ostermontag (Ostern +1),
 *   Auffahrt (Ostern +39), Pfingstmontag (Ostern +50)
 *
 * Berechnung der Osterdaten erfolgt nach Gauss (Western Easter).
 * Für 2026 fällt Ostern auf 05.04.2026, für 2027 auf 28.03.2027.
 *
 * In dieser Tabelle sind die Feiertage für 2026 und 2027 ausgerechnet
 * und hartkodiert, damit keine Laufzeit-Berechnung nötig ist.
 */

export type PoolHoliday = {
  /** ISO-Datum yyyy-mm-dd (lokales Kalenderdatum, keine Zeit) */
  date: string
  /** Anzeigename im Kalender */
  name: string
}

const HOLIDAYS_ZH: Record<number, PoolHoliday[]> = {
  2026: [
    { date: '2026-01-01', name: 'Neujahr' },
    { date: '2026-01-02', name: 'Berchtoldstag' },
    { date: '2026-04-03', name: 'Karfreitag' },
    { date: '2026-04-06', name: 'Ostermontag' },
    { date: '2026-05-01', name: 'Tag der Arbeit' },
    { date: '2026-05-14', name: 'Auffahrt' },
    { date: '2026-05-25', name: 'Pfingstmontag' },
    { date: '2026-08-01', name: 'Nationalfeiertag' },
    { date: '2026-12-25', name: 'Weihnachten' },
    { date: '2026-12-26', name: 'Stephanstag' },
  ],
  2027: [
    { date: '2027-01-01', name: 'Neujahr' },
    { date: '2027-01-02', name: 'Berchtoldstag' },
    { date: '2027-03-26', name: 'Karfreitag' },
    { date: '2027-03-29', name: 'Ostermontag' },
    { date: '2027-05-01', name: 'Tag der Arbeit' },
    { date: '2027-05-06', name: 'Auffahrt' },
    { date: '2027-05-17', name: 'Pfingstmontag' },
    { date: '2027-08-01', name: 'Nationalfeiertag' },
    { date: '2027-12-25', name: 'Weihnachten' },
    { date: '2027-12-26', name: 'Stephanstag' },
  ],
}

/** Liste aller bekannten Pool-Jahre (im Kalender auswählbar). */
export const POOL_AVAILABLE_YEARS: readonly number[] = [2026, 2027] as const

/** Alle Feiertage des angegebenen Jahres im Kanton Zürich. */
export function getHolidaysForYear(year: number): PoolHoliday[] {
  return HOLIDAYS_ZH[year] ?? []
}

/**
 * Map von ISO-Datum (yyyy-mm-dd) auf Feiertag, falls vorhanden.
 * Praktisch für O(1)-Lookup beim Rendern eines Kalendermonats.
 */
export function getHolidayMap(year: number): Map<string, PoolHoliday> {
  const map = new Map<string, PoolHoliday>()
  for (const h of getHolidaysForYear(year)) {
    map.set(h.date, h)
  }
  return map
}

/** Schicht-Definitionen (vorerst fix). */
export const POOL_SHIFTS = {
  EARLY: { id: 'EARLY', label: 'Frühdienst', short: 'F' },
  LATE: { id: 'LATE', label: 'Spätdienst', short: 'S' },
} as const

export type PoolShiftId = keyof typeof POOL_SHIFTS
