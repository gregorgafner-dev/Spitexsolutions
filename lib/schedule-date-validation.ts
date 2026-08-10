/**
 * Prüft ob ein Datum im Dienstplan noch bearbeitbar ist
 * Rückwirkende Bearbeitung ist nur bis zum 5. Tag des Folgemonats möglich
 */
type ScheduleEditOptions = {
  /**
   * Temporäres Admin-Override für rückwirkende Anpassungen.
   * Wird NUR in Admin-Routen/Views verwendet.
   */
  adminRetroOverride?: boolean
}

// TEMP: Ausnahmefenster für rückwirkende Admin-Anpassung des Dienstplans
// (v.a. Juli). Läuft automatisch ab; danach greift wieder die Standardregel
// (bearbeitbar nur bis zum 5. Tag des Folgemonats -> Juli ist dann wieder eingefroren).
// Gesetzt am 10.08.2026 für 3 Tage. Zeitangabe in CEST (Schweiz, +02:00).
const ADMIN_RETRO_OVERRIDE_UNTIL = new Date('2026-08-13T23:59:59.999+02:00')

export function isScheduleDateEditable(date: Date, options?: ScheduleEditOptions): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const entryDate = new Date(date)
  entryDate.setHours(0, 0, 0, 0)

  // Admin-Ausnahmefenster: für kurze Zeit alles rückwirkend editierbar
  if (options?.adminRetroOverride && new Date() < ADMIN_RETRO_OVERRIDE_UNTIL) {
    return true
  }

  // Wenn das Datum in der Zukunft liegt, ist es immer bearbeitbar
  if (entryDate > today) {
    return true
  }

  // Berechne den 5. Tag des Folgemonats
  const nextMonth = new Date(entryDate.getFullYear(), entryDate.getMonth() + 1, 1)
  const fifthDayOfNextMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 5)

  // Das Datum ist bearbeitbar, wenn heute vor dem 5. Tag des Folgemonats liegt
  return today < fifthDayOfNextMonth
}








