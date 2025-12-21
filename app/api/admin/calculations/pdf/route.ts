import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import { calculateWorkHours } from '@/lib/calculations'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { readFile } from 'fs/promises'
import { join } from 'path'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { employeeIds, startDate, endDate } = body

    if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      return NextResponse.json({ error: 'Keine Mitarbeiter ausgewählt' }, { status: 400 })
    }

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'Datumbereich fehlt' }, { status: 400 })
    }

    const start = new Date(startDate)
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999)

    if (start > end) {
      return NextResponse.json({ error: 'Startdatum muss vor Enddatum liegen' }, { status: 400 })
    }

    // Hole Mitarbeiter mit User-Informationen
    const employees = await prisma.employee.findMany({
      where: {
        id: {
          in: employeeIds,
        },
      },
      include: {
        user: true,
      },
    })

    if (employees.length === 0) {
      return NextResponse.json({ error: 'Keine Mitarbeiter gefunden' }, { status: 404 })
    }

    const results = []

    for (const employee of employees) {
      const timeEntries = await prisma.timeEntry.findMany({
        where: {
          employeeId: employee.id,
          date: {
            gte: start,
            lte: end,
          },
          endTime: { not: null },
        },
      })

      let hours = 0
      let surchargeHours = 0
      let sleepHours = 0
      let sleepInterruptionHours = 0

      for (const entry of timeEntries) {
        if (entry.endTime && entry.entryType === 'SLEEP') {
          const sleepStart = new Date(entry.startTime).getTime()
          const sleepEnd = new Date(entry.endTime).getTime()
          const sleepMinutes = (sleepEnd - sleepStart) / (1000 * 60)
          sleepHours += sleepMinutes / 60
        } else if (entry.endTime && entry.entryType !== 'SLEEP' && entry.entryType !== 'SLEEP_INTERRUPTION') {
          hours += calculateWorkHours(entry.startTime, entry.endTime, entry.breakMinutes)
        }
        if (entry.entryType === 'SLEEP_INTERRUPTION') {
          sleepInterruptionHours += (entry.sleepInterruptionMinutes || 0) / 60
          hours += (entry.sleepInterruptionMinutes || 0) / 60
        }
        surchargeHours += entry.surchargeHours || 0
      }

      results.push({
        employeeId: employee.id,
        employeeName: `${employee.user.lastName}, ${employee.user.firstName}`,
        employmentType: employee.employmentType,
        hours: hours,
        surchargeHours: surchargeHours,
        sleepHours: sleepHours,
        sleepInterruptionHours: sleepInterruptionHours,
        totalHours: hours + surchargeHours,
      })
    }

    // Sortiere nach Nachname
    results.sort((a, b) => {
      const nameA = a.employeeName.toLowerCase()
      const nameB = b.employeeName.toLowerCase()
      if (nameA < nameB) return -1
      if (nameA > nameB) return 1
      return 0
    })

    // Erstelle PDF
    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF()
    
    // Logo einfügen - Spitex Solutions Logo
    let logoLoaded = false
    const logoPaths = [
      join(process.cwd(), 'public', 'logo.png'), // Spitex Solutions Logo
      join(process.cwd(), 'public', 'logo-spitex-domus.png'), // Fallback
    ]
    
    for (const logoPath of logoPaths) {
      try {
        // SVG wird von jsPDF nicht direkt unterstützt, nur PNG/JPG
        if (logoPath.endsWith('.svg')) {
          continue
        }
        
        const logoData = await readFile(logoPath)
        const logoBase64 = logoData.toString('base64')
        const mimeType = 'image/png'
        
        doc.addImage(logoBase64, mimeType, 20, 10, 60, 20)
        logoLoaded = true
        break
      } catch (error) {
        // Versuche nächsten Logo-Pfad
        continue
      }
    }

    // Header mit Logo oder Text
    let currentY = logoLoaded ? 40 : 20
    
    if (!logoLoaded) {
      doc.setFontSize(20)
      doc.setFont('helvetica', 'bold')
      doc.text('SPITEX SOLUTIONS', 20, currentY)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(12)
      doc.text('für Spitex Domus GmbH', 20, currentY + 8)
      currentY += 20
    }
    
    // Titel
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('Berechnung Arbeitsstunden', 20, currentY)
    doc.setFont('helvetica', 'normal')
    currentY += 10
    
    // Zeitraum
    doc.setFontSize(12)
    doc.text(
      `Zeitraum: ${format(start, 'dd.MM.yyyy', { locale: de })} - ${format(end, 'dd.MM.yyyy', { locale: de })}`,
      20,
      currentY
    )
    currentY += 15
    
    // Gesamtstunden
    const totalHours = results.reduce((sum, r) => sum + r.totalHours, 0)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(`Gesamt: ${totalHours.toFixed(2)} Stunden`, 20, currentY)
    doc.setFont('helvetica', 'normal')
    currentY += 15
    
    // Trennlinie
    doc.setLineWidth(0.5)
    doc.line(20, currentY, 190, currentY)
    currentY += 10
    
    // Mitarbeiter-Details
    doc.setFontSize(12)
    const pageHeight = doc.internal.pageSize.height
    const marginBottom = 30
    
    for (const result of results) {
      // Prüfe ob neue Seite nötig ist
      if (currentY > pageHeight - marginBottom) {
        doc.addPage()
        currentY = 20
      }
      
      // Mitarbeitername
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.text(result.employeeName, 20, currentY)
      currentY += 7 // Abstand nach Name
      
      // (Stundenlohn) in neuer Zeile, leicht eingerückt
      if (result.employmentType === 'HOURLY_WAGE') {
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(0, 0, 255) // Blau
        doc.text('(Stundenlohn)', 25, currentY)
        doc.setTextColor(0, 0, 0) // Zurück zu Schwarz
        currentY += 6
      }
      
      // Arbeitsstunden
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(`Arbeitsstunden: ${result.hours.toFixed(2)}h`, 25, currentY)
      currentY += 7.5 // Mehr Abstand zwischen Zeilen
      
      // Zeitzuschlag
      if (result.surchargeHours > 0) {
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(200, 100, 0) // Orange
        doc.text(`Zeitzuschlag (Sonn-/Feiertage): ${result.surchargeHours.toFixed(2)}h`, 25, currentY)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(0, 0, 0) // Schwarz
        currentY += 7.5
      }
      
      // Schlafstunden
      if (result.sleepHours > 0) {
        doc.setTextColor(0, 0, 255) // Blau
        doc.text(`Schlafstunden: ${result.sleepHours.toFixed(2)}h`, 25, currentY)
        doc.setTextColor(0, 0, 0) // Schwarz
        currentY += 7.5
      }
      
      // Schlafunterbrechungen
      if (result.sleepInterruptionHours > 0) {
        doc.setTextColor(200, 100, 0) // Orange
        doc.text(`Schlafunterbrechungen: ${result.sleepInterruptionHours.toFixed(2)}h`, 25, currentY)
        doc.setTextColor(0, 0, 0) // Schwarz
        currentY += 7.5
      }
      
      // Total Arbeitszeit
      doc.setFont('helvetica', 'bold')
      doc.text(`Total Arbeitszeit: ${result.totalHours.toFixed(2)}h`, 25, currentY)
      doc.setFont('helvetica', 'normal')
      currentY += 10 // Mehr Abstand vor gelber Box
      
      // Für Stundenlohnangestellte: Aufschlüsselung
      if (result.employmentType === 'HOURLY_WAGE' && result.surchargeHours > 0) {
        const boxHeight = 26 // Größere Box für besseren Abstand
        
        // Prüfe ob Box auf diese Seite passt
        if (currentY + boxHeight > pageHeight - marginBottom) {
          doc.addPage()
          currentY = 20
        }
        
        const boxY = currentY
        doc.setFillColor(255, 240, 200) // Hellorange Hintergrund
        doc.rect(25, boxY, 165, boxHeight, 'F')
        
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(200, 80, 0) // Dunkleres Orange
        doc.text('Für Stundenlohnangestellte:', 27, boxY + 6)
        doc.setFont('helvetica', 'normal')
        doc.text(`Normale Stunden: ${result.hours.toFixed(2)}h`, 27, boxY + 13)
        doc.setFont('helvetica', 'bold')
        doc.text(`Zuschlag Stunden: ${result.surchargeHours.toFixed(2)}h`, 27, boxY + 20)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(0, 0, 0) // Schwarz
        currentY += boxHeight + 5 // Box-Höhe + zusätzlicher Abstand
      }
      
      // Abstand zwischen Mitarbeitern
      currentY += 5
      
      // Trennlinie zwischen Mitarbeitern (außer beim letzten)
      if (result !== results[results.length - 1]) {
        doc.setLineWidth(0.2)
        doc.setDrawColor(200, 200, 200) // Hellgrau
        doc.line(20, currentY, 190, currentY)
        currentY += 5
      }
    }
    
    // Footer
    const lastPageHeight = doc.internal.pageSize.height
    doc.setFontSize(10)
    doc.setTextColor(128, 128, 128) // Grau
    doc.text(
      `Erstellt am: ${format(new Date(), 'dd.MM.yyyy HH:mm', { locale: de })}`,
      20,
      lastPageHeight - 15
    )
    
    // Generiere PDF als Buffer
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
    
    // Setze Response-Header
    const response = new NextResponse(pdfBuffer)
    response.headers.set('Content-Type', 'application/pdf')
    response.headers.set(
      'Content-Disposition',
      `attachment; filename="Berechnung_${format(start, 'yyyy-MM-dd', { locale: de })}_${format(end, 'yyyy-MM-dd', { locale: de })}.pdf"`
    )
    
    return response
  } catch (error) {
    console.error('Error generating PDF:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
