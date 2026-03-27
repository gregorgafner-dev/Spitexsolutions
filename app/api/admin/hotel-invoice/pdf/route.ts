import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import { calculateWorkHours } from '@/lib/calculations'
import { endOfMonth, format, startOfMonth } from 'date-fns'
import { de } from 'date-fns/locale'

const HOTEL_RECIPIENT_LINES = [
  'Zentrum Elisabeth',
  'Frau Monika',
  'Leuenberger',
  'Hinterbergstrasse 41, 6318 Walchwil',
]

const HEADER_LINE =
  'Spitex Domus GmbH - Hinterbergstrasse 41 - 6318 Walchwil - Telefon 041 759 82 84 - info@spitex-domus.ch'

const CONTRACT_BASIS_LINE = 'Basis Vertrag vom 15. Dezember 2024'

// Fixe Parameter gemäss Rechnungsvorlage
const PAUSCHALE_CHF = 12000
const MWST_SATZ_PROZENT = 8.1
const MWST_SATZ = MWST_SATZ_PROZENT / 100
const RATE_ARBEIT_CHF_PRO_STD = 52.84
const RATE_SCHLAF_CHF_PRO_STD = 28.9
const SHARE_ARBEIT_HOTEL = 0.5 // 50%
const SHARE_SCHLAF_HOTEL = 1.0 // 100%

function formatCHF(amount: number): string {
  const fixed = (Number.isFinite(amount) ? amount : 0).toFixed(2)
  const [intPart, frac] = fixed.split('.')
  const withApos = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "'")
  return `${withApos}.${frac}`
}

function mustParseMonth(month: unknown): { year: number; monthIndex: number } {
  if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('Monat muss im Format YYYY-MM übergeben werden.')
  }
  const [y, m] = month.split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) {
    throw new Error('Ungültiger Monat.')
  }
  return { year: y, monthIndex: m - 1 }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const month = body?.month
    const klvHoursRaw = body?.klvHours

    const { year, monthIndex } = mustParseMonth(month)
    const klvHours = Number(klvHoursRaw)
    if (!Number.isFinite(klvHours) || klvHours < 0) {
      return NextResponse.json({ error: 'Ungültige Stunden KLV-verrechnet.' }, { status: 400 })
    }

    const monthDate = new Date(year, monthIndex, 1)
    const periodStart = startOfMonth(monthDate)
    const periodEnd = endOfMonth(monthDate)
    periodEnd.setHours(23, 59, 59, 999)

    // Employee employment type map
    const employees = await prisma.employee.findMany({
      select: { id: true, employmentType: true },
    })
    const employmentTypeByEmployeeId = new Map<string, string>()
    for (const e of employees) {
      employmentTypeByEmployeeId.set(e.id, e.employmentType)
    }

    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        employeeId: { in: employees.map((e) => e.id) },
        date: { gte: periodStart, lte: periodEnd },
      },
      select: {
        employeeId: true,
        entryType: true,
        startTime: true,
        endTime: true,
        breakMinutes: true,
        sleepInterruptionMinutes: true,
      },
    })

    let workMonthlySalary = 0
    let workHourlyWage = 0
    let sleepHourlyWage = 0

    for (const entry of timeEntries) {
      const employmentType = employmentTypeByEmployeeId.get(entry.employeeId) ?? 'UNKNOWN'

      // Schlaf: zählt nur mit Endzeit
      if (entry.entryType === 'SLEEP') {
        if (!entry.endTime) continue
        if (employmentType === 'HOURLY_WAGE') {
          const sleepMinutes = (entry.endTime.getTime() - entry.startTime.getTime()) / (1000 * 60)
          sleepHourlyWage += sleepMinutes / 60
        }
        continue
      }

      // Schlafunterbrechung: Minuten-Feld zählt zur Arbeitszeit (auch ohne Endzeit)
      if (entry.entryType === 'SLEEP_INTERRUPTION') {
        const hours = (entry.sleepInterruptionMinutes || 0) / 60
        if (employmentType === 'MONTHLY_SALARY') workMonthlySalary += hours
        else if (employmentType === 'HOURLY_WAGE') workHourlyWage += hours
        continue
      }

      // Arbeit/Sonstiges: nur mit Endzeit
      if (!entry.endTime) continue
      const hours = calculateWorkHours(entry.startTime, entry.endTime, entry.breakMinutes)
      if (employmentType === 'MONTHLY_SALARY') workMonthlySalary += hours
      else if (employmentType === 'HOURLY_WAGE') workHourlyWage += hours
    }

    const totalWorkHours = workMonthlySalary + workHourlyWage
    const totalSleepHours = sleepHourlyWage

    const productivity = totalWorkHours > 0 ? (klvHours / totalWorkHours) * 100 : 0
    const leerstundenWork = totalWorkHours - klvHours
    const leerstundenSleep = totalSleepHours

    const shareSpitexWorkHours = leerstundenWork * SHARE_ARBEIT_HOTEL
    const shareHotelWorkCost = shareSpitexWorkHours * RATE_ARBEIT_CHF_PRO_STD
    const shareHotelSleepCost = leerstundenSleep * RATE_SCHLAF_CHF_PRO_STD * SHARE_SCHLAF_HOTEL
    const totalHotelCost = shareHotelWorkCost + shareHotelSleepCost
    const diffToPauschale = totalHotelCost - PAUSCHALE_CHF

    const mwstBetrag = PAUSCHALE_CHF * MWST_SATZ
    const pauschaleTotal = PAUSCHALE_CHF + mwstBetrag

    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })

    // ---------------- Page 1 ----------------
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.text(HEADER_LINE, 15, 12, { maxWidth: 180 })

    doc.setFontSize(10)
    doc.text(`Rechnungsdatum ${format(new Date(), 'dd.MM.yy', { locale: de })}`, 15, 24)

    doc.setFontSize(10)
    let y = 36
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
    y += 8

    doc.setFontSize(9.5)
    doc.text(CONTRACT_BASIS_LINE, 15, y)
    y += 6
    doc.text(
      `Periode ${format(periodStart, 'dd.MM.yyyy', { locale: de })} bis ${format(periodEnd, 'dd.MM.yyyy', {
        locale: de,
      })}`,
      15,
      y
    )
    y += 10

    // Simple table header
    doc.setFont('helvetica', 'bold')
    doc.text('Rubrik', 15, y)
    doc.text('Details', 75, y)
    doc.text('CHF', 180, y, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    y += 7

    doc.text('Monatspauschale', 15, y)
    doc.text('Reduktion gemäss Sitzung der Gesellschafter vom 15. Juli 2025', 75, y, { maxWidth: 95 })
    doc.text(formatCHF(PAUSCHALE_CHF), 180, y, { align: 'right' })
    y += 12

    doc.text('MwSt %', 15, y)
    doc.text(MWST_SATZ_PROZENT.toFixed(1), 180, y, { align: 'right' })
    y += 7

    doc.text('MwSt Betrag', 15, y)
    doc.text(formatCHF(mwstBetrag), 180, y, { align: 'right' })
    y += 7

    doc.setFont('helvetica', 'bold')
    doc.text('Total inkl. MwSt', 15, y)
    doc.text(formatCHF(pauschaleTotal), 180, y, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    y += 12

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
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.text(HEADER_LINE, 15, 12, { maxWidth: 180 })

    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Produktivität / Leerstunden', 15, 26)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text('Kostenanteil Zentrum Elisabeth', 15, 34)

    doc.setFontSize(10)
    doc.text(String(year), 15, 46)
    doc.text(`Monat ${format(monthDate, 'MMMM', { locale: de })}`, 15, 53)

    // Table headings
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('Arbeits-h', 110, 53, { align: 'right' })
    doc.text('Schlaf-h', 170, 53, { align: 'right' })
    doc.setFont('helvetica', 'normal')

    let y2 = 62
    const xLabel = 15
    const xWork = 110
    const xSleep = 170

    const line = (label: string, work?: string, sleep?: string, opts?: { bold?: boolean }) => {
      if (opts?.bold) doc.setFont('helvetica', 'bold')
      else doc.setFont('helvetica', 'normal')
      doc.text(label, xLabel, y2)
      if (work !== undefined) doc.text(work, xWork, y2, { align: 'right' })
      if (sleep !== undefined) doc.text(sleep, xSleep, y2, { align: 'right' })
      y2 += 6
    }

    line("Std M'Arb Monatslohn", workMonthlySalary.toFixed(2), '0.00')
    line("Std M'Arb Stundenlohn", workHourlyWage.toFixed(2), totalSleepHours.toFixed(2))
    line('Std Total', totalWorkHours.toFixed(2), totalSleepHours.toFixed(2), { bold: true })

    y2 += 2
    line('hiervon: Std KLV-verrechnet', klvHours.toFixed(2), '')
    line('Produktivität in %', `${productivity.toFixed(2)}%`, '')
    line('Leerstunden', leerstundenWork.toFixed(2), leerstundenSleep.toFixed(2))

    y2 += 2
    line('hiervon Anteil Spitex Domus % 50', (leerstundenWork * 0.5).toFixed(2), '')
    line('hiervon Anteil Zentrum Elisabeth % 50', (leerstundenWork * 0.5).toFixed(2), '')
    line('Anteil Zentrum Elisabeth % 100', '', leerstundenSleep.toFixed(2))

    y2 += 4
    const verrechnungArbeitTotal = leerstundenWork * RATE_ARBEIT_CHF_PRO_STD
    const verrechnungSchlafTotal = leerstundenSleep * RATE_SCHLAF_CHF_PRO_STD

    doc.setFont('helvetica', 'normal')
    doc.text('Verrechnung CHF/Std', xLabel, y2)
    doc.text('Arbeit', xLabel + 50, y2)
    doc.text(RATE_ARBEIT_CHF_PRO_STD.toFixed(2), xWork, y2, { align: 'right' })
    doc.text(formatCHF(verrechnungArbeitTotal), 195, y2, { align: 'right' })
    y2 += 7

    doc.text('Verrechnung CHF/Std', xLabel, y2)
    doc.text('Schlaf', xLabel + 50, y2)
    doc.text(RATE_SCHLAF_CHF_PRO_STD.toFixed(1), xWork, y2, { align: 'right' })
    doc.text(formatCHF(verrechnungSchlafTotal), 195, y2, { align: 'right' })
    y2 += 10

    doc.setFont('helvetica', 'bold')
    doc.text('Total Kosten Anteil Hotel', xLabel, y2)
    doc.text(formatCHF(totalHotelCost), 195, y2, { align: 'right' })
    y2 += 7

    doc.setFont('helvetica', 'normal')
    doc.text('Vereinbarte Pauschale', xLabel, y2)
    doc.text(formatCHF(PAUSCHALE_CHF), 195, y2, { align: 'right' })
    y2 += 7

    doc.setFont('helvetica', 'bold')
    doc.text('Differenz', xLabel, y2)
    doc.text(formatCHF(diffToPauschale), 195, y2, { align: 'right' })

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
    const response = new NextResponse(pdfBuffer)
    response.headers.set('Content-Type', 'application/pdf')
    response.headers.set(
      'Content-Disposition',
      `attachment; filename="Rechnung_Hotel_${format(monthDate, 'yyyy-MM', { locale: de })}.pdf"`
    )
    return response
  } catch (error) {
    console.error('[hotel-invoice/pdf] error', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

