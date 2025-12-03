import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDaysInMonth } from 'date-fns'
import { de } from 'date-fns/locale'
import { isHolidayOrSunday } from '@/lib/calculations'
import { readFile } from 'fs/promises'
import { join } from 'path'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))

    // Definiere die gewünschte Reihenfolge der Mitarbeiter (nach Vorname)
    // Die Sortierung funktioniert auch mit Teilnamen (z.B. "Anna" passt zu "Anna Joelle")
    const employeeOrder = [
      'Samantha',
      'Adelina',
      'Almina',
      'Katja',
      'Barbara',
      'Anna', // Passt zu "Anna Joelle"
      'Yvonne',
      'Sebastian',
      'Gyler',
      'Mareen',
      'Brigitte',
    ]

    // Hole alle Mitarbeiter
    const employeesData = await prisma.employee.findMany({
      include: {
        user: true,
      },
    })

    // Sortiere Mitarbeiter nach der definierten Reihenfolge
    const employees = employeesData.sort((a, b) => {
      const firstNameA = a.user.firstName
      const firstNameB = b.user.firstName
      
      // Finde Index basierend auf exaktem Match oder Teilstring
      const findIndex = (name: string) => {
        // Exakter Match
        const exactIndex = employeeOrder.indexOf(name)
        if (exactIndex !== -1) return exactIndex
        
        // Teilstring-Match (z.B. "Anna" passt zu "Anna Joelle")
        for (let i = 0; i < employeeOrder.length; i++) {
          if (name.startsWith(employeeOrder[i]) || employeeOrder[i].startsWith(name)) {
            return i
          }
        }
        return -1
      }
      
      const indexA = findIndex(firstNameA)
      const indexB = findIndex(firstNameB)
      
      // Wenn beide in der Liste sind, sortiere nach Index
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB
      }
      
      // Wenn nur A in der Liste ist, kommt A zuerst
      if (indexA !== -1) return -1
      
      // Wenn nur B in der Liste ist, kommt B zuerst
      if (indexB !== -1) return 1
      
      // Wenn keiner in der Liste ist, sortiere alphabetisch nach Nachname
      return a.user.lastName.localeCompare(b.user.lastName)
    })

    // Hole alle Services
    const services = await prisma.service.findMany()

    // Bereite Datum vor
    const monthDate = new Date(year, month - 1, 1)
    monthDate.setHours(0, 0, 0, 0)
    const monthStart = startOfMonth(monthDate)
    monthStart.setHours(0, 0, 0, 0)
    const monthEnd = endOfMonth(monthDate)
    monthEnd.setHours(23, 59, 59, 999)
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

    // Hole alle Schedule-Einträge für den Monat
    const scheduleEntries = await prisma.scheduleEntry.findMany({
      where: {
        date: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      include: {
        service: true,
      },
    })

    // Hole Monthly Balances für den Monat
    const monthlyBalances = await prisma.monthlyBalance.findMany({
      where: {
        year,
        month,
      },
    })

    // Erstelle Map für schnellen Zugriff
    const balancesMap = new Map(monthlyBalances.map(b => [b.employeeId, b]))

    // Organisiere Einträge nach Mitarbeiter und Datum
    const entriesByEmployee: Record<string, Record<string, typeof scheduleEntries>> = {}
    scheduleEntries.forEach(entry => {
      if (!entriesByEmployee[entry.employeeId]) {
        entriesByEmployee[entry.employeeId] = {}
      }
      // entry.date ist bereits ein Date-Objekt von Prisma
      const entryDate = entry.date instanceof Date ? entry.date : new Date(entry.date)
      const dateKey = format(entryDate, 'yyyy-MM-dd')
      if (!entriesByEmployee[entry.employeeId][dateKey]) {
        entriesByEmployee[entry.employeeId][dateKey] = []
      }
      entriesByEmployee[entry.employeeId][dateKey].push(entry)
    })

    // Erstelle PDF
    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF('landscape', 'mm', 'a4')
    
    // Logo einfügen - versuche zuerst das Logo von spitex-domus.ch
    let logoLoaded = false
    const logoPaths = [
      join(process.cwd(), 'public', 'logo-spitex-domus.png'),
      join(process.cwd(), 'public', 'logo-spitex-domus.svg'),
      join(process.cwd(), 'public', 'logo.png'),
    ]
    
    for (const logoPath of logoPaths) {
      try {
        const logoData = await readFile(logoPath)
        const logoBase64 = logoData.toString('base64')
        const isSvg = logoPath.endsWith('.svg')
        doc.addImage(logoBase64, isSvg ? 'SVG' : 'PNG', 20, 10, 40, 15) // x, y, width, height in mm
        logoLoaded = true
        break
      } catch (error) {
        // Versuche nächsten Pfad
        continue
      }
    }
    
    if (!logoLoaded) {
      console.warn('Logo konnte nicht geladen werden, verwende Text')
      // Fallback: Text-Logo
      doc.setFontSize(20)
      doc.text('Spitex Domus', 20, 20)
      doc.setFontSize(12)
      doc.text('persönlich, freundlich und kompetent', 20, 27)
    }
    
    // Titel
    doc.setFontSize(18)
    const monthTitle = format(monthDate, 'MMMM yyyy', { locale: de })
    const pageWidth = doc.internal.pageSize.width
    doc.text(`Dienstplan ${monthTitle}`, 70, 20) // Nach dem Logo
    
    // Aktuelles Datum
    doc.setFontSize(10)
    const currentDate = format(new Date(), 'dd.MM.yyyy HH:mm', { locale: de })
    doc.text(`Erstellt am: ${currentDate}`, pageWidth - 60, 15)
    
    // Tabellen-Header
    let yPos = 35 // Etwas höher wegen Logo
    const cellHeight = 7
    const headerCellHeight = 10 // Höhere Header-Zeile
    const firstColWidth = 40
    const dayColWidth = 6
    const summaryColWidth = 18 // Breite für die zusätzlichen Spalten
    const startX = 10
    
    // Spaltenbreiten berechnen
    const totalDays = days.length
    const summaryColsWidth = 5 * summaryColWidth // 5 zusätzliche Spalten
    const availableWidth = pageWidth - 20 - firstColWidth - summaryColsWidth
    const actualDayColWidth = Math.min(dayColWidth, availableWidth / totalDays)
    
    // Header-Zeile
    doc.setFontSize(8)
    doc.setFont(undefined, 'bold')
    doc.setFillColor(240, 240, 240)
    doc.rect(startX, yPos - 5, firstColWidth, headerCellHeight, 'FD')
    doc.setFillColor(255, 255, 255)
    doc.text('Mitarbeiter', startX + 2, yPos + 2)
    
    // Tage-Header
    let currentX = startX + firstColWidth
    days.forEach((day, index) => {
      const xPos = currentX
      // Stelle sicher, dass day ein gültiges Date-Objekt ist
      const dayDate = day instanceof Date ? day : new Date(day)
      if (isNaN(dayDate.getTime())) {
        console.error('Invalid date in header:', day)
        return
      }
      const isHoliday = isHolidayOrSunday(dayDate, year)
      
      doc.setFillColor(isHoliday ? 220 : 240, isHoliday ? 220 : 240, isHoliday ? 220 : 240)
      doc.rect(xPos, yPos - 5, actualDayColWidth, headerCellHeight, 'FD')
      doc.setFillColor(255, 255, 255)
      
      if (!isNaN(dayDate.getTime())) {
        doc.setFontSize(5)
        const dayText = format(dayDate, 'dd', { locale: de })
        doc.text(dayText, xPos + 1, yPos)
        doc.setFontSize(4)
        const dayNameText = format(dayDate, 'EEE', { locale: de })
        doc.text(dayNameText, xPos + 1, yPos + 4)
      }
      currentX += actualDayColWidth
    })
    
    // Zusätzliche Spalten-Header
    const summaryHeaders = ['Geplant', 'Soll', 'Saldo geplant', 'Saldo Vormonat', 'Saldo total']
    summaryHeaders.forEach((header, index) => {
      const xPos = currentX + (index * summaryColWidth)
      doc.setFillColor(240, 240, 240)
      doc.rect(xPos, yPos - 5, summaryColWidth, headerCellHeight, 'FD')
      doc.setFillColor(255, 255, 255)
      doc.setFontSize(6)
      // Zentriere Text in der Spalte
      const textWidth = (doc as any).getTextWidth(header)
      doc.text(header, xPos + (summaryColWidth / 2) - (textWidth / 2), yPos + 3)
    })
    
    doc.setFont(undefined, 'normal')
    yPos += headerCellHeight
    
    // Mitarbeiter-Zeilen
    doc.setFontSize(7)
    employees.forEach((employee, empIndex) => {
      // Prüfe ob neue Seite nötig
      if (yPos > doc.internal.pageSize.height - 25) {
        doc.addPage()
        yPos = 20
        
        // Header wiederholen
        doc.setFontSize(8)
        doc.setFont(undefined, 'bold')
        doc.setFillColor(240, 240, 240)
        doc.rect(startX, yPos - 5, firstColWidth, headerCellHeight, 'FD')
        doc.setFillColor(255, 255, 255)
        doc.text('Mitarbeiter', startX + 2, yPos + 2)
        
        let headerX = startX + firstColWidth
        days.forEach((day, index) => {
          const xPos = headerX
          // Stelle sicher, dass day ein gültiges Date-Objekt ist
          const dayDate = day instanceof Date ? day : new Date(day)
          if (isNaN(dayDate.getTime())) {
            console.error('Invalid date in header (new page):', day)
            headerX += actualDayColWidth
            return
          }
          const isHoliday = isHolidayOrSunday(dayDate, year)
          
      doc.setFillColor(isHoliday ? 220 : 240, isHoliday ? 220 : 240, isHoliday ? 220 : 240)
      doc.rect(xPos, yPos - 5, actualDayColWidth, headerCellHeight, 'FD')
      doc.setFillColor(255, 255, 255)
      
      if (!isNaN(dayDate.getTime())) {
        doc.setFontSize(5)
        const dayText = format(dayDate, 'dd', { locale: de })
        doc.text(dayText, xPos + 1, yPos)
        doc.setFontSize(4)
        const dayNameText = format(dayDate, 'EEE', { locale: de })
        doc.text(dayNameText, xPos + 1, yPos + 4)
      }
          headerX += actualDayColWidth
        })
        
        // Zusätzliche Spalten-Header wiederholen
        const summaryHeaders = ['Geplant', 'Soll', 'Saldo geplant', 'Saldo Vormonat', 'Saldo total']
        summaryHeaders.forEach((header, index) => {
          const xPos = headerX + (index * summaryColWidth)
          doc.setFillColor(240, 240, 240)
          doc.rect(xPos, yPos - 5, summaryColWidth, headerCellHeight, 'FD')
          doc.setFillColor(255, 255, 255)
          doc.setFontSize(6)
          // Zentriere Text in der Spalte
          const textWidth = (doc as any).getTextWidth(header)
          doc.text(header, xPos + (summaryColWidth / 2) - (textWidth / 2), yPos + 3)
        })
        
        doc.setFont(undefined, 'normal')
        yPos += headerCellHeight
      }
      
      // Mitarbeiter-Name
      const employeeName = `${employee.user.lastName}, ${employee.user.firstName.charAt(0)}.`
      doc.setFillColor(250, 250, 250)
      doc.rect(startX, yPos - 5, firstColWidth, cellHeight, 'FD')
      doc.setFillColor(255, 255, 255)
      doc.setFontSize(6)
      doc.text(employeeName, startX + 2, yPos)
      
      // Tage-Zellen
      let dayX = startX + firstColWidth
      days.forEach((day, dayIndex) => {
        const xPos = dayX
        // Stelle sicher, dass day ein gültiges Date-Objekt ist
        const dayDate = day instanceof Date ? day : new Date(day)
        if (isNaN(dayDate.getTime())) {
          console.error('Invalid date:', day)
          dayX += actualDayColWidth
          return
        }
        const dateKey = format(dayDate, 'yyyy-MM-dd')
        const dayEntries = entriesByEmployee[employee.id]?.[dateKey] || []
        const isHoliday = isHolidayOrSunday(dayDate, year)
        
        // Hintergrundfarbe für Feiertage/Sonntage
        doc.setFillColor(isHoliday ? 240 : 255, isHoliday ? 240 : 255, isHoliday ? 240 : 255)
        doc.rect(xPos, yPos - 5, actualDayColWidth, cellHeight, 'FD')
        doc.setFillColor(255, 255, 255)
        
        // Service-Einträge
        if (dayEntries.length > 0) {
          const entry = dayEntries[0] // Ersten Eintrag nehmen
          const service = entry.service
          
          // Service-Farbe als Hintergrund
          const color = service.color
          const r = parseInt(color.slice(1, 3), 16)
          const g = parseInt(color.slice(3, 5), 16)
          const b = parseInt(color.slice(5, 7), 16)
          
          doc.setFillColor(r, g, b)
          doc.rect(xPos, yPos - 5, actualDayColWidth, cellHeight, 'FD')
          doc.setFillColor(255, 255, 255)
          
          // Service-Name (weiß, wenn Hintergrund dunkel) - größer
          const brightness = (r + g + b) / 3
          doc.setFontSize(7)
          if (brightness < 128) {
            doc.setTextColor(255, 255, 255)
          } else {
            doc.setTextColor(0, 0, 0)
          }
          doc.text(service.name, xPos + 1, yPos)
          doc.setTextColor(0, 0, 0)
        }
        dayX += actualDayColWidth
      })
      
      // Berechne Werte für zusätzliche Spalten
      const balance = balancesMap.get(employee.id)
      const employeeEntries = scheduleEntries.filter(e => e.employeeId === employee.id)
      const plannedHours = employeeEntries.reduce((sum, e) => {
        const start = new Date(e.startTime)
        const end = new Date(e.endTime)
        return sum + (end.getTime() - start.getTime()) / (1000 * 60 * 60)
      }, 0)
      
      const targetHours = balance?.targetHours || 0
      const actualHours = balance?.actualHours || 0
      const previousBalance = balance?.previousBalance || 0
      const projectedBalance = actualHours + plannedHours - targetHours + previousBalance
      const currentBalance = balance?.balance || 0
      
      // Zusätzliche Spalten
      const summaryValues = [
        plannedHours.toFixed(1) + 'h',
        targetHours.toFixed(1) + 'h',
        (projectedBalance >= 0 ? '+' : '') + projectedBalance.toFixed(1) + 'h',
        (previousBalance >= 0 ? '+' : '') + previousBalance.toFixed(1) + 'h',
        (currentBalance >= 0 ? '+' : '') + currentBalance.toFixed(1) + 'h',
      ]
      
      summaryValues.forEach((value, index) => {
        const xPos = dayX + (index * summaryColWidth)
        doc.setFillColor(250, 250, 250)
        doc.rect(xPos, yPos - 5, summaryColWidth, cellHeight, 'FD')
        doc.setFillColor(255, 255, 255)
        doc.setFontSize(6)
        // Zentriere Text in der Spalte
        const textWidth = (doc as any).getTextWidth(value)
        doc.text(value, xPos + (summaryColWidth / 2) - (textWidth / 2), yPos)
      })
      
      yPos += cellHeight
    })
    
    // Legende der Dienste hinzufügen
    const pageHeight = doc.internal.pageSize.height
    let legendY = pageHeight - 40
    
    // Prüfe ob genug Platz für Legende
    if (legendY < yPos + 20) {
      doc.addPage()
      legendY = 20
      yPos = 20
    }
    
    doc.setFontSize(10)
    doc.setFont(undefined, 'bold')
    doc.text('Legende der Dienste:', 20, legendY)
    
    legendY += 5
    doc.setFontSize(8)
    doc.setFont(undefined, 'normal')
    
    // Sortiere Services nach Name
    const sortedServices = [...services].sort((a, b) => a.name.localeCompare(b.name))
    
    const legendCols = 3 // 3 Spalten für die Legende
    const legendColWidth = (pageWidth - 40) / legendCols
    let legendX = 20
    let legendCol = 0
    
    sortedServices.forEach((service, index) => {
      if (legendCol >= legendCols) {
        legendCol = 0
        legendX = 20
        legendY += 6
      }
      
      // Farbiges Quadrat
      const color = service.color
      const r = parseInt(color.slice(1, 3), 16)
      const g = parseInt(color.slice(3, 5), 16)
      const b = parseInt(color.slice(5, 7), 16)
      
      doc.setFillColor(r, g, b)
      doc.rect(legendX, legendY - 3, 4, 4, 'FD')
      doc.setFillColor(255, 255, 255)
      
      // Service-Name und Beschreibung
      const serviceText = service.description 
        ? `${service.name} = ${service.description}`
        : service.name
      doc.text(serviceText, legendX + 5, legendY)
      
      legendX += legendColWidth
      legendCol++
    })
    
    // Footer auf jeder Seite
    const totalPages = (doc as any).internal.pages.length - 1
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i)
      const pageHeight = doc.internal.pageSize.height
      doc.setFontSize(8)
      doc.text(`Seite ${i} von ${totalPages}`, pageWidth - 30, pageHeight - 10)
    }
    
    // Generiere PDF als Buffer
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
    
    // Setze Response-Header
    const response = new NextResponse(pdfBuffer)
    response.headers.set('Content-Type', 'application/pdf')
    response.headers.set(
      'Content-Disposition',
      `attachment; filename="Dienstplan_${format(monthDate, 'yyyy-MM', { locale: de })}.pdf"`
    )
    
    return response
  } catch (error) {
    console.error('Error generating schedule PDF:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorStack = error instanceof Error ? error.stack : undefined
    console.error('Error details:', errorMessage)
    console.error('Error stack:', errorStack)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: errorMessage 
    }, { status: 500 })
  }
}

