/**
 * Zentrale Logik für den Aktiv-/Archiviert-Status von Mitarbeitern.
 *
 * Regel (Entscheidung: automatische Archivierung ab Austrittsdatum):
 *   - Aktiv:       exitDate == null  ODER  exitDate > heute (00:00 Ortszeit)
 *   - Archiviert:  exitDate != null  UND   exitDate <= heute
 *
 * Ein Mitarbeiter mit einem in der Zukunft liegenden Austrittsdatum bleibt also
 * bis zu diesem Tag voll aktiv (kann geplant werden, Zeit erfassen, sich einloggen)
 * und wird erst ab dem Austrittsdatum automatisch archiviert.
 *
 * Wichtig: Es werden NIE Daten gelöscht. "Archiviert" ist ein reiner Status;
 * alle Zeiteinträge, Salden, Ferien, Dienstpläne und Nachrichten bleiben erhalten.
 */

export type EmployeeExitInfo = {
  exitDate?: Date | string | null
}

/** Beginn des heutigen Tages (Ortszeit) als Referenz für den Austrittsvergleich. */
export function startOfToday(now: Date = new Date()): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d
}

/** true, wenn der Mitarbeiter zum Referenzzeitpunkt archiviert ist. */
export function isEmployeeArchived(employee: EmployeeExitInfo, ref: Date = new Date()): boolean {
  if (!employee.exitDate) return false
  const exit = new Date(employee.exitDate)
  if (Number.isNaN(exit.getTime())) return false
  // Austrittstag zählt als Ende des Arbeitsverhältnisses -> ab diesem Tag archiviert.
  return exit.getTime() <= startOfToday(ref).getTime()
}

/** Gegenstück zu isEmployeeArchived. */
export function isEmployeeActive(employee: EmployeeExitInfo, ref: Date = new Date()): boolean {
  return !isEmployeeArchived(employee, ref)
}

/**
 * Prisma-`where`-Fragment für "nur aktive Mitarbeiter".
 * Verwendung: prisma.employee.findMany({ where: { ...activeEmployeeWhere() } })
 * oder in verschachtelten Relationen: where: { employee: activeEmployeeWhere() }
 */
export function activeEmployeeWhere(ref: Date = new Date()) {
  const today = startOfToday(ref)
  return {
    OR: [{ exitDate: null }, { exitDate: { gt: today } }],
  }
}

/**
 * Prisma-`where`-Fragment für "nur archivierte Mitarbeiter".
 */
export function archivedEmployeeWhere(ref: Date = new Date()) {
  const today = startOfToday(ref)
  return {
    exitDate: { not: null, lte: today },
  }
}
