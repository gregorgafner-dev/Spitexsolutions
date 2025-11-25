/**
 * Client-seitige Datumsvalidierung
 * Diese Datei kann sowohl client- als auch server-seitig verwendet werden
 */

/**
 * Prüft ob ein Datum für normale Mitarbeiter noch bearbeitbar ist
 * Regel: Mitarbeiter können rückwirkend die letzten 2 Tage bearbeiten (vom aktuellen Tag aus gesehen)
 * Admins können alle Einträge im laufenden Jahr bearbeiten
 * @param entryDate Das Datum des Zeiteintrags
 * @param isAdmin Ob der Benutzer ein Admin ist (Admins können alle Einträge im laufenden Jahr bearbeiten)
 * @returns true wenn das Datum bearbeitbar ist, false sonst
 */
export function isDateEditableForEmployee(entryDate: Date, isAdmin: boolean = false): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const entry = new Date(entryDate)
  entry.setHours(0, 0, 0, 0)
  
  // Zukünftige Daten sind nicht bearbeitbar
  if (entry > today) {
    return false
  }
  
  // Admins können alle Einträge im laufenden Jahr bearbeiten
  if (isAdmin) {
    const currentYear = today.getFullYear()
    const entryYear = entry.getFullYear()
    return entryYear === currentYear
  }

  // Berechne die Differenz in Tagen
  const diffTime = today.getTime() - entry.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  
  // Erlaubt: Heute und die letzten 2 Tage (also 0, 1 oder 2 Tage zurück)
  return diffDays <= 2
}


