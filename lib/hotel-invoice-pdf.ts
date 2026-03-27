import { format } from 'date-fns'
import { de } from 'date-fns/locale'

export type HotelInvoiceRenderParams = {
  now: Date
  year: number
  monthDate: Date
  periodStart: Date
  periodEnd: Date
  klvHours: number

  workMonthlySalary: number
  workHourlyWage: number
  totalSleepHours: number

  productivity: number
  leerstundenWork: number
  leerstundenSleep: number

  verrechnungArbeitTotal: number
  verrechnungSchlafTotal: number
  totalHotelCost: number
  diffToPauschale: number

  mwstBetrag: number
  pauschaleTotal: number
}

const HEADER_LINE =
  'Spitex Domus GmbH - Hinterbergstrasse 41 - 6318 Walchwil - Telefon 041 759 82 84 - info@spitex-domus.ch'

const HOTEL_RECIPIENT_LINES = [
  'Zentrum Elisabeth',
  'Frau Monika',
  'Leuenberger',
  'Hinterbergstrasse 41, 6318 Walchwil',
]

function formatCHF(amount: number): string {
  const fixed = (Number.isFinite(amount) ? amount : 0).toFixed(2)
  const [intPart, frac] = fixed.split('.')
  const withApos = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "'")
  return `${withApos}.${frac}`
}

function debugLog(runId: string | undefined, hypothesisId: string, location: string, message: string, data: any) {
  if (!runId) return
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/d02b158b-8692-42bb-9636-87edc733d28f', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '42d3e1' },
    body: JSON.stringify({
      sessionId: '42d3e1',
      runId,
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion
}

function drawHeader(doc: any, logoBase64: string | null, runId?: string) {
  if (logoBase64) {
    const w = 62
    const h = w / 3.46
    doc.addImage(logoBase64, 'PNG', 15, 10, w, h)
    debugLog(runId, 'H2', 'lib/hotel-invoice-pdf.ts:drawHeader', 'logo', { w, h })
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text(HEADER_LINE, 15, 32, { maxWidth: 180 })

  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.3)
  doc.line(15, 35, 195, 35)
  doc.setDrawColor(0, 0, 0)
  debugLog(runId, 'H1', 'lib/hotel-invoice-pdf.ts:drawHeader', 'headerLine', { y: 35, w: 0.3 })
}

export function renderHotelInvoicePdf(opts: {
  doc: any
  logoBase64: string | null
  params: HotelInvoiceRenderParams
  debugRunId?: string
}) {
  const { doc, logoBase64, params, debugRunId } = opts

  const drawFineSeparator = (yLine: number, id: string) => {
    doc.setDrawColor(190, 190, 190)
    doc.setLineWidth(0.15)
    doc.line(15, yLine, 195, yLine)
    doc.setDrawColor(0, 0, 0)
    debugLog(debugRunId, 'H3', 'lib/hotel-invoice-pdf.ts:drawFineSeparator', 'fineLine', { id, y: yLine, w: 0.15 })
  }

  // ---------------- Page 1 ----------------
  drawHeader(doc, logoBase64, debugRunId)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Rechnungsdatum ${format(params.now, 'dd.MM.yy', { locale: de })}`, 15, 48)

  let y = 60
  for (const line of HOTEL_RECIPIENT_LINES) {
    doc.text(line, 15, y)
    y += 5
  }

  y += 2
  doc.setFontSize(9.5)
  doc.text('Rechnung Zahlungsfrist: 30 Tage MwSt-Nr. CHE-283.375.390', 15, y)
  y += 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.text('Position', 15, y)
  doc.setFont('helvetica', 'normal')
  doc.text('Kosten Betreuung/Begleitung', 45, y)
  y += 6
  doc.text('Kosten Nachtwache', 45, y)
  y += 10

  doc.setFontSize(9.5)
  doc.setFont('helvetica', 'normal')
  doc.text('Basis: Vertrag vom 15. Dezember 2024', 15, y)
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.text(
    `Periode: ${format(params.periodStart, 'dd.MM.yyyy', { locale: de })} bis ${format(params.periodEnd, 'dd.MM.yyyy', {
      locale: de,
    })}`,
    15,
    y
  )
  doc.setFont('helvetica', 'normal')
  y += 12

  const xRubrik = 15
  const xDetails = 70
  const xCHF = 195
  const detailsWidth = 110

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.text('Rubrik', xRubrik, y)
  doc.text('Details', xDetails, y)
  doc.text('CHF', xCHF, y, { align: 'right' })
  y += 4
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.4)
  doc.line(15, y, 195, y)
  doc.setLineWidth(0.2)
  doc.setDrawColor(200, 200, 200)
  y += 6

  const writeRow = (rubrik: string, details: string, chf: string | null, rowId: string) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.text(rubrik, xRubrik, y)

    const detailLines = doc.splitTextToSize(details, detailsWidth)
    doc.text(detailLines, xDetails, y)

    if (chf !== null) doc.text(chf, xCHF, y, { align: 'right' })

    const lineCount = Array.isArray(detailLines) ? detailLines.length : 1
    const rowHeight = Math.max(6, lineCount * 4.2)
    const yBefore = y
    y += rowHeight

    doc.setDrawColor(230, 230, 230)
    doc.setLineWidth(0.2)
    // Linie näher an Text (Vorlage)
    doc.line(15, y - 4.2, 195, y - 4.2)
    doc.setDrawColor(0, 0, 0)
    debugLog(debugRunId, 'H1', 'lib/hotel-invoice-pdf.ts:writeRow', 'rowLine', {
      rowId,
      yText: yBefore,
      yLine: y - 4.2,
      rowHeight,
      lineCount,
    })
  }

  writeRow(
    'Monatspauschale',
    'Reduktion gemäss Sitzung der Gesellschafter vom 15. Juli 2025',
    formatCHF(12000),
    'pauschale'
  )
  writeRow('MwSt %', '', '8.1', 'mwst_pct')
  writeRow('MwSt Betrag', '', formatCHF(params.mwstBetrag), 'mwst_amount')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('Total inkl. MwSt', xRubrik, y + 2)
  doc.text(formatCHF(params.pauschaleTotal), xCHF, y + 2, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  y += 14

  doc.text('Für Ihre fristgerechte Zahlung danken wir Ihnen.', 15, y)
  y += 10

  doc.text('Bankverbindung:', 15, y)
  y += 5
  doc.text('Zuger Kantonalbank,', 15, y)
  y += 5
  doc.text('Zug', 15, y)
  y += 5
  doc.text('IBAN: CH78 0078 7786 2611 5368 5', 15, y)

  // ---------------- Page 2 ----------------
  doc.addPage()
  drawHeader(doc, logoBase64, debugRunId)

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Produktivität / Leerstunden', 15, 48)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Kostenanteil Zentrum Elisabeth', 15, 56)

  doc.setFontSize(10)
  doc.text(String(params.year), 15, 70)
  doc.text(`Monat ${format(params.monthDate, 'MMMM', { locale: de })}`, 15, 78)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('Arbeits-h', 120, 78, { align: 'right' })
  doc.text('Schlaf-h', 175, 78, { align: 'right' })
  doc.setFont('helvetica', 'normal')

  let y2 = 90
  const xLabel = 15
  const xWork = 120
  const xSleep = 175
  const xAmountRight = 195

  // Obere Trennlinie (wird im Fix auf "fein" angepasst)
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.4)
  doc.line(15, 82, 195, 82)
  doc.setLineWidth(0.2)
  doc.setDrawColor(230, 230, 230)

  const line = (label: string, work?: string, sleep?: string, opts?: { bold?: boolean }) => {
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal')
    doc.text(label, xLabel, y2)
    if (work !== undefined) doc.text(work, xWork, y2, { align: 'right' })
    if (sleep !== undefined) doc.text(sleep, xSleep, y2, { align: 'right' })
    y2 += 6
  }

  line("Std M'Arb Monatslohn", params.workMonthlySalary.toFixed(2), '0.00')
  line("Std M'Arb Stundenlohn", params.workHourlyWage.toFixed(2), params.totalSleepHours.toFixed(2))
  line('Std Total', (params.workMonthlySalary + params.workHourlyWage).toFixed(2), params.totalSleepHours.toFixed(2), {
    bold: true,
  })
  drawFineSeparator(y2 - 2.5, 'after_std_total')

  y2 += 2
  line('hiervon: Std KLV-verrechnet', params.klvHours.toFixed(2), '')
  line('Produktivität in %', `${params.productivity.toFixed(2)}%`, '')
  line('Leerstunden', params.leerstundenWork.toFixed(2), params.leerstundenSleep.toFixed(2))
  drawFineSeparator(y2 - 2.5, 'after_leerstunden')

  y2 += 2
  line('hiervon Anteil Spitex Domus % 50', (params.leerstundenWork * 0.5).toFixed(2), '')
  line('hiervon Anteil Zentrum Elisabeth % 50', (params.leerstundenWork * 0.5).toFixed(2), '')
  line('Anteil Zentrum Elisabeth % 100', '', params.leerstundenSleep.toFixed(2))
  drawFineSeparator(y2 - 2.5, 'after_anteil_zentrum')

  y2 += 6

  doc.setFont('helvetica', 'normal')
  doc.text('Verrechnung CHF/Std', xLabel, y2)
  doc.text('Arbeit', xLabel + 55, y2)
  doc.text('52.84', xWork, y2, { align: 'right' })
  doc.text(formatCHF(params.verrechnungArbeitTotal), xAmountRight, y2, { align: 'right' })
  y2 += 7

  doc.text('Verrechnung CHF/Std', xLabel, y2)
  doc.text('Schlaf', xLabel + 55, y2)
  doc.text('28.9', xWork, y2, { align: 'right' })
  doc.text(formatCHF(params.verrechnungSchlafTotal), xAmountRight, y2, { align: 'right' })
  y2 += 12

  drawFineSeparator(y2 - 6.5, 'before_total_kosten')

  doc.setFont('helvetica', 'bold')
  doc.text('Total Kosten Anteil Hotel', xLabel, y2)
  doc.text(formatCHF(params.totalHotelCost), xAmountRight, y2, { align: 'right' })
  y2 += 7

  doc.setFont('helvetica', 'normal')
  doc.text('Vereinbarte Pauschale', xLabel, y2)
  doc.text(formatCHF(12000), xAmountRight, y2, { align: 'right' })
  y2 += 7

  doc.setFont('helvetica', 'bold')
  doc.text('Differenz', xLabel, y2)
  doc.text(formatCHF(params.diffToPauschale), xAmountRight, y2, { align: 'right' })
}

