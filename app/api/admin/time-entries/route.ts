import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import { calculateWorkHours, violatesMaxWorkBlock, isHolidayOrSunday, calculateSurchargeHours } from '@/lib/calculations'
import { updateMonthlyBalance } from '@/lib/update-monthly-balance'
import { checkOverlappingBlocks, checkNegativeWorkTime, checkMissingEndTime } from '@/lib/time-entry-validation'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const employeeId = searchParams.get('employeeId')
    const dateStr = searchParams.get('date')
    const startDateStr = searchParams.get('startDate')
    const endDateStr = searchParams.get('endDate')
    
    if (!employeeId) {
      return NextResponse.json({ error: 'employeeId required' }, { status: 400 })
    }
    
    let whereClause: any = {
      employeeId,
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

    return NextResponse.json(entries)
  } catch (error) {
    console.error('Error fetching time entries:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { employeeId, date, startTime, endTime, breakMinutes, entryType, sleepInterruptionMinutes } = body

    if (!employeeId || !date) {
      return NextResponse.json({ error: 'employeeId and date required' }, { status: 400 })
    }

    // Bei SLEEP_INTERRUPTION ist startTime nicht erforderlich
    if (entryType !== 'SLEEP_INTERRUPTION' && (!startTime)) {
      return NextResponse.json({ error: 'startTime required' }, { status: 400 })
    }
    
    if (entryType === 'SLEEP_INTERRUPTION' && !date) {
      return NextResponse.json({ error: 'Date required' }, { status: 400 })
    }

    // Prüfe ob Mitarbeiter existiert
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
    })

    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    const dateObj = new Date(date)
    dateObj.setHours(0, 0, 0, 0)

    // Validierung 1: Prüfe fehlende Endzeit (nur für WORK-Einträge)
    if (checkMissingEndTime(entryType || 'WORK', endTime ? new Date(endTime) : null)) {
      return NextResponse.json(
        { error: 'Endzeit ist erforderlich für Arbeitszeit-Einträge' },
        { status: 400 }
      )
    }

    // Validierung 2: Prüfe negative Arbeitszeit (nicht für SLEEP_INTERRUPTION)
    if (entryType !== 'SLEEP_INTERRUPTION' && endTime && startTime) {
      const startTimeDate = new Date(startTime)
      const endTimeDate = new Date(endTime)
      if (checkNegativeWorkTime(startTimeDate, endTimeDate)) {
        return NextResponse.json(
          { error: 'Endzeit muss nach Startzeit liegen' },
          { status: 400 }
        )
      }
    }

    // Bei SLEEP_INTERRUPTION: startTime und endTime sind optional
    if (entryType === 'SLEEP_INTERRUPTION') {
      const entry = await prisma.timeEntry.create({
        data: {
          employeeId,
          date: dateObj,
          startTime: startTime ? new Date(startTime) : dateObj,
          endTime: endTime ? new Date(endTime) : dateObj,
          breakMinutes: 0,
          surchargeHours: 0,
          entryType: 'SLEEP_INTERRUPTION',
          sleepInterruptionMinutes: sleepInterruptionMinutes || 0,
        },
      })

      // Aktualisiere Monatssaldo
      await updateMonthlyBalance(employeeId, dateObj)

      return NextResponse.json(entry)
    }

    const year = dateObj.getFullYear()
    
    // Wenn endTime vorhanden, prüfe 6-Stunden-Regel
    let surchargeHours = 0
    if (endTime && startTime) {
      const startTimeDate = new Date(startTime)
      const endTimeDate = new Date(endTime)
      
      // Validierung 3: Prüfe überlappende Blöcke (nur für WORK-Einträge)
      if (entryType !== 'SLEEP_INTERRUPTION') {
        const overlapCheck = await checkOverlappingBlocks(
          employeeId,
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

    const entry = await prisma.timeEntry.create({
      data: {
        employeeId,
        date: dateObj,
        startTime: new Date(startTime),
        endTime: endTime ? new Date(endTime) : null,
        breakMinutes: breakMinutes || 0,
        surchargeHours,
        entryType: entryType || 'WORK',
        sleepInterruptionMinutes: sleepInterruptionMinutes || 0,
      },
    })

    // Aktualisiere Monatssaldo
    await updateMonthlyBalance(employeeId, dateObj)

    return NextResponse.json(entry)
  } catch (error) {
    console.error('Error creating time entry:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

