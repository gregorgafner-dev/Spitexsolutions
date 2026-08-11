import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { de } from 'date-fns/locale'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')
    const month = searchParams.get('month') // Format: YYYY-MM

    if (!employeeId || !month) {
      return NextResponse.json({ error: 'employeeId and month required' }, { status: 400 })
    }

    // Prüfe ob der 3. Tag des Folgemonats erreicht ist
    const [year, monthNum] = month.split('-').map(Number)
    const reportDate = new Date(year, monthNum - 1, 1) // Erster Tag des Monats
    const nextMonth = new Date(year, monthNum, 1) // Erster Tag des Folgemonats
    const thirdDayOfNextMonth = new Date(year, monthNum, 3) // 3. Tag des Folgemonats
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (today < thirdDayOfNextMonth) {
      return NextResponse.json(
        { error: `PDF-Generierung ist erst ab dem ${format(thirdDayOfNextMonth, 'd. MMMM yyyy', { locale: de })} möglich.` },
        { status: 403 }
      )
    }

    // Hole Mitarbeiter-Daten
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        user: true,
      },
    })

    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    // Monatssaldo des GEWÄHLTEN Abrechnungsmonats (kein zusätzlicher Vormonats-Versatz).
    const reportMonthDate = reportDate

    const monthlyBalance = await prisma.monthlyBalance.findUnique({
      where: {
        employeeId_year_month: {
          employeeId,
          year,
          month: monthNum,
        },
      },
    })

    // Hole Feriensaldo
    const currentDate = new Date()
    const currentYearVacation = currentDate.getFullYear()
    const vacationBalance = await prisma.vacationBalance.findUnique({
      where: {
        employeeId_year: {
          employeeId,
          year: currentYearVacation,
        },
      },
    })

    // Berechne gearbeitete Stunden des Abrechnungsmonats
    const startOfReportMonth = startOfMonth(reportMonthDate)
    const endOfReportMonth = endOfMonth(reportMonthDate)

    // Manuelle Stundensaldo-Anpassungen (kind='SALDO', z.B. Auszahlung Plusstunden)
    // bis Ende des Abrechnungsmonats einrechnen – analog zur Stundensaldi-Ansicht.
    // So ist der ausgewiesene Saldo eine Momentaufnahme PER ENDE des gewählten
    // Monats (und nicht für alle Monate identisch "per heute").
    let adjHoursUpToReportMonth = 0
    try {
      const saldoAdjustments = await (prisma as any).hourBalanceAdjustment.findMany({
        where: { employeeId, kind: 'SALDO' },
        select: { minutes: true, effectiveDate: true },
      })
      for (const a of saldoAdjustments as Array<{ minutes: number; effectiveDate: Date }>) {
        if (a.effectiveDate <= endOfReportMonth) adjHoursUpToReportMonth += Number(a.minutes || 0)
      }
    } catch {
      // Tabelle evtl. nicht vorhanden -> Anpassungen ignorieren
    }
    adjHoursUpToReportMonth = adjHoursUpToReportMonth / 60

    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        employeeId,
        date: {
          gte: startOfReportMonth,
          lte: endOfReportMonth,
        },
        endTime: { not: null },
      },
    })

    // Berechne tatsächliche Arbeitsstunden (ohne SLEEP und SLEEP_INTERRUPTION)
    const { calculateWorkHours } = await import('@/lib/calculations')
    const actualWorkHours = timeEntries.reduce((sum, entry) => {
      if (entry.endTime && entry.entryType !== 'SLEEP' && entry.entryType !== 'SLEEP_INTERRUPTION') {
        return sum + calculateWorkHours(entry.startTime, entry.endTime, entry.breakMinutes)
      }
      // Addiere Unterbrechungen während des Schlafens zur Arbeitszeit
      if (entry.entryType === 'SLEEP_INTERRUPTION') {
        return sum + (entry.sleepInterruptionMinutes || 0) / 60
      }
      return sum
    }, 0)

    // Summiere Zeitzuschläge
    const surchargeHours = timeEntries.reduce((sum, entry) => {
      return sum + (entry.surchargeHours || 0)
    }, 0)

    // Erstelle PDF (dynamischer Import für Next.js)
    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF()
    
    // Logo/Header
    doc.setFontSize(20)
    doc.text('Spitex Domus', 20, 20)
    doc.setFontSize(12)
    doc.text('persönlich, freundlich und kompetent', 20, 28)
    
    // Titel
    doc.setFontSize(16)
    doc.text('Arbeitszeitabrechnung', 20, 45)
    
    // Mitarbeiter-Informationen
    doc.setFontSize(12)
    doc.text(`Mitarbeiter: ${employee.user.firstName} ${employee.user.lastName}`, 20, 60)
    doc.text(`Email: ${employee.user.email}`, 20, 68)
    doc.text(`Pensum: ${employee.pensum}%`, 20, 76)
    
    // Monat
    doc.setFontSize(14)
    doc.text(`Abrechnungsmonat: ${format(reportMonthDate, 'MMMM yyyy', { locale: de })}`, 20, 90)
    
    // Arbeitszeit im Abrechnungsmonat
    doc.setFontSize(12)
    doc.text('Arbeitszeit im Abrechnungsmonat:', 20, 110)
    let currentY = 118
    
    // Normale Arbeitsstunden
    doc.text(`Gearbeitete Stunden: ${actualWorkHours.toFixed(2)}h`, 30, currentY)
    currentY += 8
    
    // Zeitzuschlag separat ausweisen (für alle Mitarbeiter)
    if (surchargeHours > 0) {
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(200, 100, 0) // Orange
      doc.text(`Zeitzuschlag (Sonn-/Feiertage, 10%): ${surchargeHours.toFixed(2)}h`, 30, currentY)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(0, 0, 0) // Schwarz
      currentY += 8
    }

    // Bezahlte Absenzen (Krankheit/Ferien) gem. Soll, die dem Ist gutgeschrieben
    // wurden (Monatslohn: K+FE, Stundenlohn: nur K). Ohne diese Zeile würde der
    // Monatssaldo rechnerisch nicht mit Ist/Soll aufgehen.
    const creditedAbsenceHours = monthlyBalance
      ? Math.max(0, Math.round((monthlyBalance.actualHours - actualWorkHours) * 100) / 100)
      : 0
    if (creditedAbsenceHours > 0) {
      doc.text(`Bezahlte Absenzen (Kr./Fe.) gem. Soll: ${creditedAbsenceHours.toFixed(2)}h`, 30, currentY)
      currentY += 8
    }

    // Gesamt angerechnete Arbeitszeit (Ist + Zuschlag + bezahlte Absenzen)
    if (surchargeHours > 0 || creditedAbsenceHours > 0) {
      doc.setFont('helvetica', 'bold')
      doc.text(
        `Gesamt angerechnet: ${(actualWorkHours + surchargeHours + creditedAbsenceHours).toFixed(2)}h`,
        30,
        currentY
      )
      doc.setFont('helvetica', 'normal')
      currentY += 8
    }

    // Für Stundenlohnangestellte: Zuschläge besonders hervorheben
    if (employee.employmentType === 'HOURLY_WAGE' && surchargeHours > 0) {
      currentY += 4
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(200, 100, 0) // Orange
      doc.text('Aufschlüsselung für Stundenlohnangestellte:', 20, currentY)
      currentY += 8
      doc.setFont('helvetica', 'normal')
      doc.text(`Normale Stunden: ${actualWorkHours.toFixed(2)}h`, 30, currentY)
      currentY += 8
      doc.setFont('helvetica', 'bold')
      doc.text(`Zuschlag Stunden (Sonn-/Feiertage): ${surchargeHours.toFixed(2)}h`, 30, currentY)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(0, 0, 0) // Schwarz
      currentY += 8
    }

    if (monthlyBalance) {
      doc.text(`Soll-Stunden: ${monthlyBalance.targetHours.toFixed(2)}h`, 30, currentY)
      currentY += 8
      // Saldo NUR dieses Monats (Ist inkl. Zuschlag/Absenzen − Soll), ohne Vormonate.
      const monthDelta = Math.round((monthlyBalance.balance - monthlyBalance.previousBalance) * 100) / 100
      doc.text(
        `Saldo Abrechnungsmonat (Ist - Soll): ${monthDelta >= 0 ? '+' : ''}${monthDelta.toFixed(2)}h`,
        30,
        currentY
      )
      currentY += 8
    }

    // Kumulierter Stundensaldo PER ENDE des Abrechnungsmonats (inkl. Vormonate und
    // manuelle Anpassungen bis zu diesem Zeitpunkt). Dadurch ist jede Monats-
    // abrechnung eine Momentaufnahme dieses Monats – und nicht für alle Monate
    // identisch "per heute".
    currentY += 6
    doc.setFontSize(14)
    doc.text(
      `Stundensaldo per Ende ${format(reportMonthDate, 'MMMM yyyy', { locale: de })} (inkl. Vormonate):`,
      20,
      currentY
    )
    currentY += 8
    doc.setFontSize(12)
    const cumulativeBalance = (monthlyBalance ? monthlyBalance.balance : 0) + adjHoursUpToReportMonth
    const cumulativeText =
      `${cumulativeBalance >= 0 ? '+' : ''}${cumulativeBalance.toFixed(2)}h` +
      (adjHoursUpToReportMonth !== 0 ? ` (inkl. ${adjHoursUpToReportMonth.toFixed(2)}h Anpassungen)` : '')
    doc.text(cumulativeText, 30, currentY)
    currentY += 14

    // Feriensaldo
    doc.setFontSize(14)
    doc.text('Feriensaldo:', 20, currentY)
    currentY += 8
    doc.setFontSize(12)
    if (vacationBalance) {
      const remainingDays = vacationBalance.totalDays - vacationBalance.usedDays
      doc.text(`Verbleibend: ${remainingDays.toFixed(1)} Tage`, 30, currentY)
      currentY += 8
      doc.text(`Bezogen: ${vacationBalance.usedDays.toFixed(1)} Tage`, 30, currentY)
      currentY += 8
    } else {
      doc.text('Keine Daten verfügbar', 30, currentY)
      currentY += 8
    }
    
    // Footer
    const pageHeight = doc.internal.pageSize.height
    doc.setFontSize(10)
    doc.text(`Erstellt am: ${format(new Date(), 'dd.MM.yyyy HH:mm', { locale: de })}`, 20, pageHeight - 20)
    
    // Generiere PDF als Buffer
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
    
    // Setze Response-Header
    const response = new NextResponse(pdfBuffer)
    response.headers.set('Content-Type', 'application/pdf')
    response.headers.set(
      'Content-Disposition',
      `attachment; filename="Abrechnung_${employee.user.lastName}_${format(reportMonthDate, 'yyyy-MM', { locale: de })}.pdf"`
    )
    
    return response
  } catch (error) {
    console.error('Error generating PDF:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

