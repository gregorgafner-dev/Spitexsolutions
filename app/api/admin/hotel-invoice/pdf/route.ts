import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import { calculateWorkHours, DEFAULT_WEEKLY_HOURS } from '@/lib/calculations'
import { computeCreditedAbsenceHours, qualifyingAbsenceServices } from '@/lib/absence-credit'
import { endOfMonth, format, startOfMonth } from 'date-fns'
import { de } from 'date-fns/locale'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { renderHotelInvoicePdf, type HotelInvoiceRenderParams } from '@/lib/hotel-invoice-pdf'

const HOTEL_RECIPIENT_LINES = [
  'Zentrum Elisabeth',
  'Frau Monika Leuenberger',
  'Hinterbergstrasse 41',
  '6318 Walchwil',
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

async function loadHotelLogoBase64(): Promise<string | null> {
  try {
    const p = join(process.cwd(), 'public', 'hotel-logo.png')
    const buf = await readFile(p)
    return buf.toString('base64')
  } catch {
    return null
  }
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

    // Employee employment type + pensum map
    const employees = await prisma.employee.findMany({
      select: { id: true, employmentType: true, pensum: true },
    })
    const employmentTypeByEmployeeId = new Map<string, string>()
    const pensumByEmployeeId = new Map<string, number>()
    for (const e of employees) {
      employmentTypeByEmployeeId.set(e.id, e.employmentType)
      pensumByEmployeeId.set(e.id, e.pensum)
    }

    // Wochenstunden für Soll-basierte Absenz-Gutschrift.
    const workTimeConfig = await prisma.workTimeConfig.findUnique({ where: { year } })
    const weeklyHours = workTimeConfig?.weeklyHours ?? DEFAULT_WEEKLY_HOURS

    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        employeeId: { in: employees.map((e) => e.id) },
        date: { gte: periodStart, lte: periodEnd },
      },
      select: {
        employeeId: true,
        date: true,
        entryType: true,
        startTime: true,
        endTime: true,
        breakMinutes: true,
        sleepInterruptionMinutes: true,
      },
    })

    let workMonthlySalary = 0
    let workHourlyWage = 0
    let sleepHourlyWageGross = 0
    let sleepInterruptionHoursHourlyWage = 0

    // Bereits gearbeitete Stunden je Mitarbeiter/Kalendertag (für Absenz-Deckelung).
    const workedByEmployeeDay = new Map<string, Map<string, number>>()
    const addWorked = (employeeId: string, date: Date, hours: number) => {
      if (hours === 0) return
      const key = format(date, 'yyyy-MM-dd')
      let m = workedByEmployeeDay.get(employeeId)
      if (!m) {
        m = new Map<string, number>()
        workedByEmployeeDay.set(employeeId, m)
      }
      m.set(key, (m.get(key) || 0) + hours)
    }

    for (const entry of timeEntries) {
      const employmentType = employmentTypeByEmployeeId.get(entry.employeeId) ?? 'UNKNOWN'

      // Schlaf: zählt nur mit Endzeit (Brutto, Unterbrechungen werden weiter unten abgezogen)
      if (entry.entryType === 'SLEEP') {
        if (!entry.endTime) continue
        if (employmentType === 'HOURLY_WAGE') {
          const sleepMinutes = (entry.endTime.getTime() - entry.startTime.getTime()) / (1000 * 60)
          sleepHourlyWageGross += sleepMinutes / 60
        }
        continue
      }

      // Schlafunterbrechung: Minuten-Feld zählt zur Arbeitszeit (auch ohne Endzeit).
      // Zusätzlich wird die Unterbrechung weiter unten von der Brutto-Schlafzeit abgezogen,
      // damit das gleiche Zeitfenster nicht doppelt verrechnet wird (Arbeit + Schlaf).
      if (entry.entryType === 'SLEEP_INTERRUPTION') {
        const hours = (entry.sleepInterruptionMinutes || 0) / 60
        if (employmentType === 'MONTHLY_SALARY') workMonthlySalary += hours
        else if (employmentType === 'HOURLY_WAGE') {
          workHourlyWage += hours
          sleepInterruptionHoursHourlyWage += hours
        }
        addWorked(entry.employeeId, entry.date, hours)
        continue
      }

      // Arbeit/Sonstiges: nur mit Endzeit
      if (!entry.endTime) continue
      const hours = calculateWorkHours(entry.startTime, entry.endTime, entry.breakMinutes)
      if (employmentType === 'MONTHLY_SALARY') workMonthlySalary += hours
      else if (employmentType === 'HOURLY_WAGE') workHourlyWage += hours
      addWorked(entry.employeeId, entry.date, hours)
    }

    // Bezahlte Absenzen (Krankheit/Ferien) "gem. Soll" als Arbeitsstunden in die
    // Belastung aufnehmen (Spitex zahlt Absenzen -> Hotel trägt 50% Arbeitsanteil mit).
    // Monatslohn: K+FE, Stundenlohn: nur K. Deckelung auf Tages-Soll je Werktag.
    const scheduleAbsences = await prisma.scheduleEntry.findMany({
      where: {
        employeeId: { in: employees.map((e) => e.id) },
        date: { gte: periodStart, lte: periodEnd },
        service: { name: { in: ['K', 'FE'] } },
      },
      select: { employeeId: true, date: true, service: { select: { name: true } } },
    })

    const absenceDaysByEmployee = new Map<string, Date[]>()
    for (const a of scheduleAbsences) {
      const employmentType = employmentTypeByEmployeeId.get(a.employeeId) ?? 'UNKNOWN'
      const allowed = qualifyingAbsenceServices(employmentType)
      if (!allowed.includes(a.service.name)) continue
      const list = absenceDaysByEmployee.get(a.employeeId) ?? []
      list.push(a.date)
      absenceDaysByEmployee.set(a.employeeId, list)
    }

    let paidAbsenceWorkHours = 0
    for (const [employeeId, absenceDays] of absenceDaysByEmployee) {
      const credited = computeCreditedAbsenceHours({
        weeklyHours,
        pensum: pensumByEmployeeId.get(employeeId) ?? 0,
        year,
        absenceDays,
        workedHoursByDay: workedByEmployeeDay.get(employeeId) ?? new Map<string, number>(),
      })
      paidAbsenceWorkHours += credited
    }
    paidAbsenceWorkHours = Math.round(paidAbsenceWorkHours * 100) / 100

    // Effektive Schlafzeit (Stundenlöhner): Brutto-Schlaf abzüglich Unterbrechungen.
    const sleepHourlyWage = Math.max(0, sleepHourlyWageGross - sleepInterruptionHoursHourlyWage)

    const totalWorkHours = workMonthlySalary + workHourlyWage + paidAbsenceWorkHours
    const totalSleepHours = sleepHourlyWage

    const productivity = totalWorkHours > 0 ? (klvHours / totalWorkHours) * 100 : 0
    const leerstundenWork = totalWorkHours - klvHours
    const leerstundenSleep = totalSleepHours

    const shareSpitexWorkHours = leerstundenWork * SHARE_ARBEIT_HOTEL
    const shareHotelWorkCost = shareSpitexWorkHours * RATE_ARBEIT_CHF_PRO_STD
    const shareHotelSleepCost = leerstundenSleep * RATE_SCHLAF_CHF_PRO_STD * SHARE_SCHLAF_HOTEL
    const totalHotelCost = shareHotelWorkCost + shareHotelSleepCost
    const diffToPauschale = totalHotelCost - PAUSCHALE_CHF
    const verrechnungArbeitTotal = leerstundenWork * RATE_ARBEIT_CHF_PRO_STD
    const verrechnungSchlafTotal = leerstundenSleep * RATE_SCHLAF_CHF_PRO_STD

    const mwstBetrag = PAUSCHALE_CHF * MWST_SATZ
    const pauschaleTotal = PAUSCHALE_CHF + mwstBetrag

    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const hotelLogoBase64 = await loadHotelLogoBase64()

    const renderParams: HotelInvoiceRenderParams = {
      now: new Date(),
      year,
      monthDate,
      periodStart,
      periodEnd,
      klvHours,
      workMonthlySalary,
      workHourlyWage,
      paidAbsenceWorkHours,
      totalSleepHours,
      productivity,
      leerstundenWork,
      leerstundenSleep,
      verrechnungArbeitTotal,
      verrechnungSchlafTotal,
      totalHotelCost,
      diffToPauschale,
      mwstBetrag,
      pauschaleTotal,
    }

    renderHotelInvoicePdf({ doc, logoBase64: hotelLogoBase64, params: renderParams })

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

