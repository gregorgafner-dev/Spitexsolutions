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

// TEMP: Ausnahmefenster "ab jetzt + 2 Tage" (automatisch ablaufend).
// Hinweis: Zeitangabe in CEST (Schweiz, +02:00). Danach greift wieder die Standardregel.
const ADMIN_RETRO_OVERRIDE_UNTIL = new Date('2026-04-17T23:59:59.999+02:00')

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








