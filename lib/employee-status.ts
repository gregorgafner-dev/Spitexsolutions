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

/** Beginn des angegebenen Monats (Ortszeit). `month` ist 1-basiert (1 = Januar). */
export function startOfMonthLocal(year: number, month: number): Date {
  const d = new Date(year, month - 1, 1)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * true, wenn der Mitarbeiter im angegebenen Monat im Dienstplan sichtbar sein soll.
 *
 * Regel (monatsgenau): sichtbar bis und mit Austrittsmonat.
 *   - exitDate == null            -> immer sichtbar
 *   - exitDate >= Monatsbeginn    -> sichtbar (Austritt in diesem oder einem späteren Monat)
 *   - exitDate <  Monatsbeginn    -> nicht sichtbar (bereits vor diesem Monat ausgetreten)
 *
 * `month` ist 1-basiert (1 = Januar).
 */
export function isEmployeeVisibleInMonth(
  employee: EmployeeExitInfo,
  year: number,
  month: number
): boolean {
  if (!employee.exitDate) return true
  const exit = new Date(employee.exitDate)
  if (Number.isNaN(exit.getTime())) return true
  return exit.getTime() >= startOfMonthLocal(year, month).getTime()
}

/**
 * Prisma-`where`-Fragment für "im angegebenen Monat sichtbar" (bis und mit Austrittsmonat).
 * `month` ist 1-basiert (1 = Januar).
 */
export function employeesForMonthWhere(year: number, month: number) {
  const monthStart = startOfMonthLocal(year, month)
  return {
    OR: [{ exitDate: null }, { exitDate: { gte: monthStart } }],
  }
}
