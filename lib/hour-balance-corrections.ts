import { prisma } from './db'

export type PeriodCorrection = {
  /** Nacherfasste Arbeitsstunden (signiert, in Minuten) */
  workMinutes: number
  /** Nacherfasste Schlafstunden (signiert, in Minuten) */
  sleepMinutes: number
}

/**
 * Lädt manuelle Nacherfassungen (kind = "WORK" / "SLEEP") für die angegebenen
 * Mitarbeiter im Zeitraum [start, end] und gruppiert sie pro Mitarbeiter.
 *
 * Diese Korrekturen fliessen in die Perioden-Berechnung (Stundenlohn) ein.
 * SALDO-Anpassungen (Monatslohn-Stundensaldo) werden hier bewusst ignoriert.
 */
export async function getPeriodCorrectionsByEmployee(
  employeeIds: string[],
  start: Date,
  end: Date
): Promise<Map<string, PeriodCorrection>> {
  const map = new Map<string, PeriodCorrection>()
  if (!employeeIds || employeeIds.length === 0) return map

  const rows = await (prisma as any).hourBalanceAdjustment.findMany({
    where: {
      employeeId: { in: employeeIds },
      effectiveDate: { gte: start, lte: end },
      kind: { in: ['WORK', 'SLEEP'] },
    },
    select: { employeeId: true, minutes: true, kind: true },
  })

  for (const r of rows as Array<{ employeeId: string; minutes: number; kind: string }>) {
    const cur = map.get(r.employeeId) ?? { workMinutes: 0, sleepMinutes: 0 }
    if (r.kind === 'SLEEP') {
      cur.sleepMinutes += Number(r.minutes || 0)
    } else {
      cur.workMinutes += Number(r.minutes || 0)
    }
    map.set(r.employeeId, cur)
  }

  return map
}
