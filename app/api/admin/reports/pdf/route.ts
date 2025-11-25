import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns'
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

    // Hole Monatssaldo vom Vormonat
    const previousMonthDate = subMonths(reportDate, 1)
    const previousYear = previousMonthDate.getFullYear()
    const previousMonth = previousMonthDate.getMonth() + 1

    const monthlyBalance = await prisma.monthlyBalance.findUnique({
      where: {
        employeeId_year_month: {
          employeeId,
          year: previousYear,
          month: previousMonth,
        },
      },
    })

    // Hole aktuelles Monatssaldo (für Stundensaldo)
    const currentDate = new Date()
    const currentYear = currentDate.getFullYear()
    const currentMonth = currentDate.getMonth() + 1

    const currentMonthlyBalance = await prisma.monthlyBalance.findUnique({
      where: {
        employeeId_year_month: {
          employeeId,
          year: currentYear,
          month: currentMonth,
        },
      },
    })

    // Hole Feriensaldo
    const currentYearVacation = currentDate.getFullYear()
    const vacationBalance = await prisma.vacationBalance.findUnique({
      where: {
        employeeId_year: {
          employeeId,
          year: currentYearVacation,
        },
      },
    })

    // Berechne gearbeitete Stunden vom Vormonat
    const startOfPreviousMonth = startOfMonth(previousMonthDate)
    const endOfPreviousMonth = endOfMonth(previousMonthDate)

    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        employeeId,
        date: {
          gte: startOfPreviousMonth,
          lte: endOfPreviousMonth,
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
    doc.text(`Abrechnungsmonat: ${format(previousMonthDate, 'MMMM yyyy', { locale: de })}`, 20, 90)
    
    // Arbeitszeit vom Vormonat
    doc.setFontSize(12)
    doc.text('Arbeitszeit vom Vormonat:', 20, 110)
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
      doc.text(`Gesamt Arbeitszeit: ${(actualWorkHours + surchargeHours).toFixed(2)}h`, 30, currentY)
      currentY += 8
    } else {
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
      doc.text(`Monatssaldo: ${monthlyBalance.balance >= 0 ? '+' : ''}${monthlyBalance.balance.toFixed(2)}h`, 30, currentY)
      currentY += 8
    }
    
    // Aktueller Stundensaldo (gem. Vormonaten)
    // Im Employee Dashboard wird monthlyBalance.balance angezeigt, was bereits den Vormonatssaldo enthält
    const saldoY = monthlyBalance && monthlyBalance.surchargeHours > 0 ? 170 : 154
    doc.setFontSize(14)
    doc.text('Aktueller Stundensaldo (gem. Vormonaten):', 20, saldoY)
    doc.setFontSize(12)
    
    // Berechne Stundensaldo wie im Employee Dashboard
    // Der balance im MonthlyBalance ist bereits (actualHours - targetHours) + previousBalance
    let totalBalance = 0
    if (currentMonthlyBalance) {
      // Der balance enthält bereits den Vormonatssaldo
      totalBalance = currentMonthlyBalance.balance
    } else if (monthlyBalance) {
      // Falls kein aktueller Monatssaldo existiert, verwende den Saldo vom Vormonat
      totalBalance = monthlyBalance.balance
    }
    
    doc.text(`${totalBalance >= 0 ? '+' : ''}${totalBalance.toFixed(2)}h`, 30, saldoY + 8)
    
    // Feriensaldo
    const ferienY = saldoY + 20
    doc.setFontSize(14)
    doc.text('Feriensaldo:', 20, ferienY)
    doc.setFontSize(12)
    if (vacationBalance) {
      const remainingDays = vacationBalance.totalDays - vacationBalance.usedDays
      doc.text(`Verbleibend: ${remainingDays.toFixed(1)} Tage`, 30, ferienY + 8)
      doc.text(`Bezogen: ${vacationBalance.usedDays.toFixed(1)} Tage`, 30, ferienY + 16)
    } else {
      doc.text('Keine Daten verfügbar', 30, ferienY + 8)
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
      `attachment; filename="Abrechnung_${employee.user.lastName}_${format(previousMonthDate, 'yyyy-MM', { locale: de })}.pdf"`
    )
    
    return response
  } catch (error) {
    console.error('Error generating PDF:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

