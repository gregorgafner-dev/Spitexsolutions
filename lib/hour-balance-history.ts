import { prisma } from './db'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

export const MAX_HISTORY_MONTHS = 36

export type YearMonth = { year: number; month: number }

export type HistoryRow = {
  year: number
  month: number
  label: string
  hasData: boolean
  previousBalance: number
  actualHours: number
  surchargeHours: number
  targetHours: number
  monthDelta: number
  adjustmentHours: number
  balance: number
}

export function parseYearMonth(value: unknown, label: string): YearMonth {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) {
    throw new Error(`${label} muss im Format YYYY-MM übergeben werden.`)
  }
  const [y, m] = value.split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) {
    throw new Error(`Ungültiger Wert für ${label}.`)
  }
  return { year: y, month: m }
}

function endOfMonthUtc(year: number, month1to12: number) {
  return new Date(Date.UTC(year, month1to12, 0, 23, 59, 59, 999))
}

function startOfMonthUtc(year: number, month1to12: number) {
  return new Date(Date.UTC(year, month1to12 - 1, 1, 0, 0, 0, 0))
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function formatSignedHHMM(hours: number): string {
  const totalMinutes = Math.round(hours * 60)
  const sign = totalMinutes < 0 ? '-' : '+'
  const abs = Math.abs(totalMinutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `${sign}${h}:${String(m).padStart(2, '0')}`
}

/**
 * Baut den monatlichen Stundensaldoverlauf für einen Mitarbeiter im Bereich
 * [from..to] auf. Die Werte entsprechen exakt der bestehenden Saldo-Logik:
 *   Saldo Ende Monat = Vortrag + Ist + Zuschlag − Soll ± Anpassungen (kumuliert).
 * Manuelle Anpassungen (kind='SALDO') werden – wie in der Stundensaldi-Ansicht
 * und der Monats-Abrechnung – auf den gespeicherten Monatssaldo aufgeschlagen.
 */
export async function buildHourBalanceHistory(
  employeeId: string,
  from: YearMonth,
  to: YearMonth
): Promise<HistoryRow[]> {
  const balances = await prisma.monthlyBalance.findMany({ where: { employeeId } })
  const balanceByKey = new Map<string, (typeof balances)[number]>()
  for (const b of balances) balanceByKey.set(`${b.year}-${b.month}`, b)

  const rangeEnd = endOfMonthUtc(to.year, to.month)
  let adjustments: Array<{ minutes: number; effectiveDate: Date }> = []
  try {
    adjustments = await (prisma as any).hourBalanceAdjustment.findMany({
      where: { employeeId, kind: 'SALDO', effectiveDate: { lte: rangeEnd } },
      select: { minutes: true, effectiveDate: true },
    })
  } catch {
    adjustments = []
  }

  const sumAdjMinutes = (predicate: (d: Date) => boolean) =>
    adjustments.reduce(
      (sum, a) => (a.effectiveDate && predicate(a.effectiveDate) ? sum + Number(a.minutes || 0) : sum),
      0
    )

  const rows: HistoryRow[] = []
  let y = from.year
  let m = from.month
  let guard = 0
  while ((y < to.year || (y === to.year && m <= to.month)) && guard < MAX_HISTORY_MONTHS + 1) {
    guard++
    const monthStart = startOfMonthUtc(y, m)
    const monthEnd = endOfMonthUtc(y, m)
    const prevMonthEnd = new Date(monthStart.getTime() - 1)

    const adjUpToPrevMin = sumAdjMinutes((d) => d <= prevMonthEnd)
    const adjUpToMonthMin = sumAdjMinutes((d) => d <= monthEnd)
    const adjInMonthMin = sumAdjMinutes((d) => d >= monthStart && d <= monthEnd)

    const row = balanceByKey.get(`${y}-${m}`)
    const label = format(new Date(y, m - 1, 1), 'MMMM yyyy', { locale: de })

    if (row) {
      rows.push({
        year: y,
        month: m,
        label,
        hasData: true,
        previousBalance: round2(row.previousBalance + adjUpToPrevMin / 60),
        actualHours: round2(row.actualHours),
        surchargeHours: round2(row.surchargeHours),
        targetHours: round2(row.targetHours),
        monthDelta: round2(row.balance - row.previousBalance),
        adjustmentHours: round2(adjInMonthMin / 60),
        balance: round2(row.balance + adjUpToMonthMin / 60),
      })
    } else {
      rows.push({
        year: y,
        month: m,
        label,
        hasData: false,
        previousBalance: 0,
        actualHours: 0,
        surchargeHours: 0,
        targetHours: 0,
        monthDelta: 0,
        adjustmentHours: round2(adjInMonthMin / 60),
        balance: 0,
      })
    }

    if (m === 12) {
      m = 1
      y++
    } else {
      m++
    }
  }

  return rows
}

export async function renderHourBalanceHistoryPdf(opts: {
  employee: { firstName: string; lastName: string; email: string; pensum: number }
  from: YearMonth
  to: YearMonth
  rows: HistoryRow[]
}) {
  const { employee, from, to, rows } = opts
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Spitex Domus', 15, 18)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('persönlich, freundlich und kompetent', 15, 24)

  doc.setFontSize(15)
  doc.setFont('helvetica', 'bold')
  doc.text('Stundensaldoverlauf', 15, 36)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text(`${employee.firstName} ${employee.lastName} (Pensum ${employee.pensum}%)`, 15, 43)
  const fromLabel = format(new Date(from.year, from.month - 1, 1), 'MMMM yyyy', { locale: de })
  const toLabel = format(new Date(to.year, to.month - 1, 1), 'MMMM yyyy', { locale: de })
  doc.text(`Zeitraum: ${fromLabel} bis ${toLabel}`, 15, 49)

  const columns: Array<{ title: string; x: number; align: 'left' | 'right' }> = [
    { title: 'Monat', x: 15, align: 'left' },
    { title: 'Vortrag', x: 95, align: 'right' },
    { title: 'Ist (h)', x: 125, align: 'right' },
    { title: 'Zuschlag (h)', x: 160, align: 'right' },
    { title: 'Soll (h)', x: 190, align: 'right' },
    { title: 'Diff. Monat', x: 220, align: 'right' },
    { title: 'Anpassung', x: 252, align: 'right' },
    { title: 'Saldo Ende', x: 282, align: 'right' },
  ]

  let y = 60
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  for (const c of columns) doc.text(c.title, c.x, y, { align: c.align })
  y += 2
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.4)
  doc.line(15, y, 282, y)
  y += 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)

  for (const r of rows) {
    if (!r.hasData) {
      doc.text(r.label, columns[0].x, y, { align: 'left' })
      doc.setTextColor(150, 150, 150)
      doc.text('keine Daten', columns[2].x, y, { align: 'right' })
      if (r.adjustmentHours !== 0) {
        doc.text(formatSignedHHMM(r.adjustmentHours), columns[6].x, y, { align: 'right' })
      }
      doc.setTextColor(0, 0, 0)
      y += 6.5
      continue
    }
    doc.text(r.label, columns[0].x, y, { align: 'left' })
    doc.text(formatSignedHHMM(r.previousBalance), columns[1].x, y, { align: 'right' })
    doc.text(r.actualHours.toFixed(2), columns[2].x, y, { align: 'right' })
    doc.text(r.surchargeHours.toFixed(2), columns[3].x, y, { align: 'right' })
    doc.text(r.targetHours.toFixed(2), columns[4].x, y, { align: 'right' })
    doc.text(formatSignedHHMM(r.monthDelta), columns[5].x, y, { align: 'right' })
    doc.text(r.adjustmentHours !== 0 ? formatSignedHHMM(r.adjustmentHours) : '–', columns[6].x, y, { align: 'right' })
    doc.setFont('helvetica', 'bold')
    doc.text(formatSignedHHMM(r.balance), columns[7].x, y, { align: 'right' })
    doc.setFont('helvetica', 'normal')

    doc.setDrawColor(230, 230, 230)
    doc.setLineWidth(0.15)
    doc.line(15, y + 1.6, 282, y + 1.6)
    doc.setDrawColor(0, 0, 0)
    y += 6.5

    if (y > 195) {
      doc.addPage()
      y = 20
    }
  }

  const lastWithData = [...rows].reverse().find((r) => r.hasData)
  if (lastWithData) {
    y += 4
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(
      `Endsaldo per ${lastWithData.label}: ${formatSignedHHMM(lastWithData.balance)} (${lastWithData.balance.toFixed(2)} h)`,
      15,
      y
    )
    doc.setFont('helvetica', 'normal')
  }

  doc.setFontSize(8.5)
  doc.setTextColor(120, 120, 120)
  doc.text(`Erstellt am ${format(new Date(), 'dd.MM.yyyy HH:mm', { locale: de })}`, 15, 200)
  doc.setTextColor(0, 0, 0)

  return doc
}
