import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'EMPLOYEE' || !session.user.employeeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const startDateStr = searchParams.get('startDate')
    const endDateStr = searchParams.get('endDate')
    
    if (!startDateStr || !endDateStr) {
      return NextResponse.json({ error: 'startDate and endDate required' }, { status: 400 })
    }

    const startDate = new Date(startDateStr)
    startDate.setHours(0, 0, 0, 0)
    const endDate = new Date(endDateStr)
    endDate.setHours(23, 59, 59, 999)

      // Hole alle relevanten Services (Ferien, Weiterbildung, Krankheit)
      // Service-Namen: FE = Ferien, WB = Weiterbildung, K = Krankheit
      const relevantServices = await prisma.service.findMany({
        where: {
          name: {
            in: ['FE', 'WB', 'K'], // Ferien, Weiterbildung und Krankheit
          },
        },
      })

    if (relevantServices.length === 0) {
      return NextResponse.json([])
    }

    const serviceIds = relevantServices.map(s => s.id)

    // Hole alle Schedule-Einträge mit relevanten Services für den Mitarbeiter
    const scheduleEntries = await prisma.scheduleEntry.findMany({
      where: {
        employeeId: session.user.employeeId,
        serviceId: {
          in: serviceIds,
        },
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        service: true,
      },
      orderBy: {
        date: 'asc',
      },
    })

    // Hole Employee für Pensum-Berechnung
    const employee = await prisma.employee.findUnique({
      where: { id: session.user.employeeId },
      select: { pensum: true },
    })

    if (!employee) {
      return NextResponse.json([])
    }

    // Berechne Stunden für jeden Eintrag basierend auf Pensum
    const scheduleEntriesWithHours = scheduleEntries.map(entry => {
      // Bestimme Typ basierend auf Service-Name
      let entryType: 'VACATION' | 'TRAINING' | 'SICK' = 'VACATION'
      if (entry.service.name === 'WB') {
        entryType = 'TRAINING'
      } else if (entry.service.name === 'K') {
        entryType = 'SICK'
      } else if (entry.service.name === 'FE') {
        entryType = 'VACATION'
      }

      // Berechne Dauer: Bei Ferien (FE) und Krankheit (K) wird die Dauer auf das Pensum angepasst
      let durationMinutes = entry.service.duration
      if (entry.service.name === 'FE' || entry.service.name === 'K') {
        // Ferien/Krankheit-Dauer wird auf Pensum angepasst (100% = 504 Min., 50% = 252 Min., etc.)
        durationMinutes = Math.round(entry.service.duration * (employee.pensum / 100))
      }

      // Berechne Stunden aus startTime und endTime (falls vorhanden)
      // Oder verwende die berechnete Dauer
      const start = new Date(entry.startTime)
      const end = new Date(entry.endTime)
      const hoursFromTimes = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
      
      // Verwende die Stunden aus den Zeiten, falls sie sinnvoll sind, sonst die berechnete Dauer
      const hours = hoursFromTimes > 0 ? hoursFromTimes : durationMinutes / 60

      return {
        id: entry.id,
        date: entry.date.toISOString(),
        hours: Math.round(hours * 10) / 10, // Runde auf 1 Dezimalstelle
        durationMinutes,
        entryType,
        serviceName: entry.service.name,
      }
    })

    return NextResponse.json(scheduleEntriesWithHours)
  } catch (error) {
    console.error('Error fetching schedule entries:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

