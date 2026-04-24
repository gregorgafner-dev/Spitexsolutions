import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import { calculateWorkHours, violatesMaxWorkBlock, isHolidayOrSunday, calculateSurchargeHours } from '@/lib/calculations'
import { isDateEditableForEmployee } from '@/lib/date-validation'
import { checkOverlappingBlocks, checkNegativeWorkTime, checkMissingEndTime } from '@/lib/time-entry-validation'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'EMPLOYEE' || !session.user.employeeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const dateStr = searchParams.get('date')
    const startDateStr = searchParams.get('startDate')
    const endDateStr = searchParams.get('endDate')
    
    let whereClause: any = {
      employeeId: session.user.employeeId,
    }

    if (dateStr) {
      const date = new Date(dateStr)
      date.setHours(0, 0, 0, 0)
      const nextDay = new Date(date)
      nextDay.setDate(nextDay.getDate() + 1)
      whereClause.date = {
        gte: date,
        lt: nextDay,
      }
    } else if (startDateStr && endDateStr) {
      const startDate = new Date(startDateStr)
      startDate.setHours(0, 0, 0, 0)
      const endDate = new Date(endDateStr)
      endDate.setHours(23, 59, 59, 999)
      whereClause.date = {
        gte: startDate,
        lte: endDate,
      }
    } else {
      return NextResponse.json({ error: 'Date or startDate/endDate parameter required' }, { status: 400 })
    }

    const entries = await prisma.timeEntry.findMany({
      where: whereClause,
      orderBy: {
        startTime: 'asc',
      },
    })

    console.log('[API] GET time-entries:', {
      employeeId: session.user.employeeId,
      whereClause: whereClause,
      entriesCount: entries.length,
      entries: entries.map(e => ({
        id: e.id,
        date: e.date.toISOString(),
        startTime: e.startTime.toISOString(),
        endTime: e.endTime?.toISOString() || null,
        entryType: e.entryType,
      })),
    })

    return NextResponse.json(entries)
  } catch (error) {
    console.error('Error fetching time entries:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'EMPLOYEE' || !session.user.employeeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { date, startTime, endTime, breakMinutes, entryType, sleepInterruptionMinutes } = body

    // Bei SLEEP_INTERRUPTION ist startTime nicht erforderlich
    if (entryType !== 'SLEEP_INTERRUPTION' && (!date || !startTime)) {
      return NextResponse.json({ error: 'Date and startTime required' }, { status: 400 })
    }
    
    if (entryType === 'SLEEP_INTERRUPTION' && !date) {
      return NextResponse.json({ error: 'Date required' }, { status: 400 })
    }

    // Buchungsdatum: Nachtdienst wird vollständig auf dem erfassten Datum gebucht.
    // Deshalb gilt die Editierbarkeitsprüfung immer für das übergebene Datum (date).
    const dateObj = new Date(date)
    dateObj.setHours(0, 0, 0, 0)
    if (!isDateEditableForEmployee(dateObj, false)) {
      return NextResponse.json(
        { error: 'Dieses Datum kann nicht mehr bearbeitet werden. Rückwirkende Zeiterfassung ist nur für die letzten 2 Tage möglich.' },
        { status: 403 }
      )
    }

    // Bei SLEEP_INTERRUPTION: startTime und endTime sind optional
    if (entryType === 'SLEEP_INTERRUPTION') {
      const entry = await prisma.timeEntry.create({
        data: {
          employeeId: session.user.employeeId,
          date: dateObj,
          startTime: startTime ? new Date(startTime) : dateObj,
          endTime: endTime ? new Date(endTime) : dateObj,
          breakMinutes: 0,
          surchargeHours: 0,
          entryType: 'SLEEP_INTERRUPTION',
          sleepInterruptionMinutes: sleepInterruptionMinutes || 0,
        },
      })
      return NextResponse.json(entry)
    }

    // Validierung 1: Prüfe fehlende Endzeit (nur für WORK-Einträge)
    if (checkMissingEndTime(entryType || 'WORK', endTime ? new Date(endTime) : null)) {
      return NextResponse.json(
        { error: 'Endzeit ist erforderlich für Arbeitszeit-Einträge' },
        { status: 400 }
      )
    }

    // Validierung 2: Prüfe negative Arbeitszeit
    if (endTime) {
      const startTimeDate = new Date(startTime)
      const endTimeDate = new Date(endTime)
      if (checkNegativeWorkTime(startTimeDate, endTimeDate)) {
        return NextResponse.json(
          { error: 'Endzeit muss nach Startzeit liegen' },
          { status: 400 }
        )
      }
    }

    // Wenn endTime nicht vorhanden, prüfe ob bereits ein aktiver Eintrag existiert
    if (!endTime) {
      const activeEntry = await prisma.timeEntry.findFirst({
        where: {
          employeeId: session.user.employeeId,
          endTime: null,
        },
      })

      if (activeEntry) {
        return NextResponse.json({ error: 'Es läuft bereits eine Arbeitszeit' }, { status: 400 })
      }
    }

    // Validierung 3: Prüfe überlappende Blöcke (nur für WORK-Einträge, nicht für SLEEP oder SLEEP_INTERRUPTION)
    if (endTime && entryType === 'WORK') {
      const startTimeDate = new Date(startTime)
      const endTimeDate = new Date(endTime)
      const overlapCheck = await checkOverlappingBlocks(
        session.user.employeeId,
        dateObj,
        startTimeDate,
        endTimeDate
      )

      if (overlapCheck.overlaps) {
        return NextResponse.json(
          { error: 'Dieser Block überschneidet sich mit einem bereits erfassten Block' },
          { status: 400 }
        )
      }
    }

    const year = dateObj.getFullYear()
    
    // Wenn endTime vorhanden, prüfe 6-Stunden-Regel (nur für WORK-Einträge, nicht für SLEEP)
    let surchargeHours = 0
    if (endTime && entryType === 'WORK') {
      const startTimeDate = new Date(startTime)
      const endTimeDate = new Date(endTime)
      
      if (violatesMaxWorkBlock(startTimeDate, endTimeDate)) {
        return NextResponse.json(
          { error: 'Zwischen Start und Ende dürfen maximal 6 Stunden liegen. Bitte teilen Sie die Arbeitszeit auf mehrere Blöcke auf.' },
          { status: 400 }
        )
      }
      
      // Berechne Zeitzuschlag für Sonn-/Feiertage
      if (isHolidayOrSunday(dateObj, year)) {
        const workHours = calculateWorkHours(startTimeDate, endTimeDate, breakMinutes || 0)
        surchargeHours = calculateSurchargeHours(workHours)
      }
    }

    console.log('[API] Erstelle Zeiteintrag:', {
      employeeId: session.user.employeeId,
      date: dateObj.toISOString(),
      startTime: startTime,
      endTime: endTime,
      entryType: entryType || 'WORK',
      breakMinutes: breakMinutes || 0,
      surchargeHours,
    })

    const entry = await prisma.timeEntry.create({
      data: {
        employeeId: session.user.employeeId,
        date: dateObj,
        startTime: new Date(startTime),
        endTime: endTime ? new Date(endTime) : null,
        breakMinutes: breakMinutes || 0,
        surchargeHours,
        entryType: entryType || 'WORK',
        sleepInterruptionMinutes: sleepInterruptionMinutes || 0,
      },
    })

    console.log('[API] Zeiteintrag erfolgreich erstellt:', {
      id: entry.id,
      employeeId: entry.employeeId,
      date: entry.date.toISOString(),
      startTime: entry.startTime.toISOString(),
      endTime: entry.endTime?.toISOString() || null,
      entryType: entry.entryType,
    })

    // Aktualisiere Monatssaldo für das Buchungsdatum (date)
    const { updateMonthlyBalance } = await import('@/lib/update-monthly-balance')
    await updateMonthlyBalance(session.user.employeeId, dateObj)

    console.log('[API] Zeiteintrag wird zurückgegeben:', { id: entry.id, entryType: entry.entryType })
    return NextResponse.json(entry)
  } catch (error) {
    console.error('[API] Fehler beim Erstellen des Zeiteintrags:', error)
    if (error instanceof Error) {
      console.error('[API] Fehlerdetails:', {
        message: error.message,
        stack: error.stack,
      })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

