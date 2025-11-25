/**
 * Prüft ob ein Datum im Dienstplan noch bearbeitbar ist
 * Rückwirkende Bearbeitung ist nur bis zum 5. Tag des Folgemonats möglich
 */
export function isScheduleDateEditable(date: Date): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const entryDate = new Date(date)
  entryDate.setHours(0, 0, 0, 0)

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





