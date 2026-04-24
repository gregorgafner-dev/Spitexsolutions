import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import { calculateWorkHours, violatesMaxWorkBlock, isValidBreak, isHolidayOrSunday, calculateSurchargeHours } from '@/lib/calculations'
import { isDateEditableForEmployee } from '@/lib/date-validation'
import { checkOverlappingBlocks, checkNegativeWorkTime, checkMissingEndTime } from '@/lib/time-entry-validation'
import { updateMonthlyBalance } from '@/lib/update-monthly-balance'
import { formatInTimeZone } from 'date-fns-tz'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'EMPLOYEE' || !session.user.employeeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const entry = await prisma.timeEntry.findUnique({
      where: { id: params.id },
    })

    if (!entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    }

    if (entry.employeeId !== session.user.employeeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Prüfe ob das Datum noch bearbeitbar ist (nur für Mitarbeiter, nicht für Admins)
    const entryDate = new Date(entry.date)
    if (!isDateEditableForEmployee(entryDate, false)) {
      return NextResponse.json(
        { error: 'Dieses Datum kann nicht mehr bearbeitet werden. Rückwirkende Zeiterfassung ist nur für die letzten 2 Tage möglich.' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { startTime, endTime, breakMinutes, entryType, sleepInterruptionMinutes } = body

    // Bei SLEEP_INTERRUPTION ist endTime nicht erforderlich
    if (entry.entryType !== 'SLEEP_INTERRUPTION' && !endTime) {
      return NextResponse.json({ error: 'endTime required' }, { status: 400 })
    }

    const startTimeDate = startTime ? new Date(startTime) : entry.startTime
    const endTimeDate = endTime ? new Date(endTime) : entry.endTime

    // Validierung 1: Prüfe fehlende Endzeit (nur für WORK-Einträge)
    const finalEntryType = entryType || entry.entryType || 'WORK'
    if (checkMissingEndTime(finalEntryType, endTimeDate)) {
      return NextResponse.json(
        { error: 'Endzeit ist erforderlich für Arbeitszeit-Einträge' },
        { status: 400 }
      )
    }

    // Validierung 2: Prüfe negative Arbeitszeit (nicht für SLEEP_INTERRUPTION)
    if (entry.entryType !== 'SLEEP_INTERRUPTION' && endTimeDate && checkNegativeWorkTime(startTimeDate, endTimeDate)) {
      return NextResponse.json(
        { error: 'Endzeit muss nach Startzeit liegen' },
        { status: 400 }
      )
    }

    // Validierung 3: Prüfe überlappende Blöcke (nur für WORK-Einträge mit endTime)
    if (entry.entryType !== 'SLEEP_INTERRUPTION' && endTimeDate) {
      const overlapCheck = await checkOverlappingBlocks(
        entry.employeeId,
        entry.date,
        startTimeDate,
        endTimeDate,
        entry.id // Schließe den aktuellen Eintrag aus
      )

      if (overlapCheck.overlaps) {
        return NextResponse.json(
          { error: 'Dieser Block überschneidet sich mit einem bereits erfassten Block' },
          { status: 400 }
        )
      }
    }

    // Prüfe 6-Stunden-Regel (nur für normale Einträge, nicht für SLEEP_INTERRUPTION)
    let surchargeHours = 0
    if (entry.entryType !== 'SLEEP_INTERRUPTION' && endTimeDate) {
      if (violatesMaxWorkBlock(startTimeDate, endTimeDate)) {
        return NextResponse.json(
          { error: 'Zwischen Start und Ende dürfen maximal 6 Stunden liegen. Bitte teilen Sie die Arbeitszeit auf mehrere Blöcke auf.' },
          { status: 400 }
        )
      }

      // Berechne Zeitzuschlag für Sonn-/Feiertage
      const dateObj = new Date(entry.date)
      const year = dateObj.getFullYear()
      if (isHolidayOrSunday(dateObj, year)) {
        const workHours = calculateWorkHours(startTimeDate, endTimeDate, parseInt(breakMinutes) || 0)
        surchargeHours = calculateSurchargeHours(workHours)
      }
    }

    const updateData: any = {
      breakMinutes: parseInt(breakMinutes) || 0,
      surchargeHours,
      entryType: entryType || entry.entryType || 'WORK',
    }
    
    // Bei SLEEP_INTERRUPTION: sleepInterruptionMinutes kann auch ohne startTime/endTime aktualisiert werden
    if (entry.entryType === 'SLEEP_INTERRUPTION') {
      if (sleepInterruptionMinutes !== undefined) {
        updateData.sleepInterruptionMinutes = parseInt(sleepInterruptionMinutes) || 0
      }
      // Behalte bestehende Zeiten für SLEEP_INTERRUPTION
      updateData.startTime = entry.startTime
      updateData.endTime = entry.endTime
    } else {
      // Normale Einträge: aktualisiere Zeiten
      updateData.startTime = startTimeDate
      updateData.endTime = endTimeDate
      if (sleepInterruptionMinutes !== undefined) {
        updateData.sleepInterruptionMinutes = parseInt(sleepInterruptionMinutes) || 0
      }
    }

    const updatedEntry = await prisma.timeEntry.update({
      where: { id: params.id },
      data: updateData,
    })

    // Aktualisiere Monatssaldo immer für das Buchungsdatum (entry.date)
    await updateMonthlyBalance(entry.employeeId, entry.date)

    return NextResponse.json(updatedEntry)
  } catch (error) {
    console.error('Error updating time entry:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'EMPLOYEE' || !session.user.employeeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const entry = await prisma.timeEntry.findUnique({
      where: { id: params.id },
    })

    if (!entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    }

    if (entry.employeeId !== session.user.employeeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const entryDate = new Date(entry.date)
    entryDate.setHours(0, 0, 0, 0)

    const startTimeDate = new Date(entry.startTime)
    const endTimeDate = entry.endTime ? new Date(entry.endTime) : null

    const ZONE = 'Europe/Zurich'
    const ymdZ = (d: Date) => formatInTimeZone(d, ZONE, 'yyyy-MM-dd')
    const hmZ = (d: Date) => formatInTimeZone(d, ZONE, 'HH:mm')
    const hourZ = (d: Date) => parseInt(formatInTimeZone(d, ZONE, 'H'), 10)
    const minuteZ = (d: Date) => parseInt(formatInTimeZone(d, ZONE, 'm'), 10)
    const sameYMDZ = (a: Date, b: Date) => ymdZ(a) === ymdZ(b)

    const isNightShiftSecondBlock =
      entry.entryType === 'WORK' && hmZ(startTimeDate) === '06:01'

    const isNightShiftFirstBlock =
      entry.entryType === 'WORK' &&
      !!endTimeDate &&
      // Startzeit kann abweichen (z.B. 18:xx), Endzeit ist bei Nachtdienst immer 23:00
      hmZ(endTimeDate) === '23:00' &&
      hourZ(startTimeDate) >= 17 &&
      hourZ(startTimeDate) <= 22

    const isNightShiftSleep =
      entry.entryType === 'SLEEP' &&
      !!endTimeDate &&
      ((hmZ(startTimeDate) === '23:01' && hmZ(endTimeDate) === '23:59') ||
        // tolerant: Ende kann in Ausnahmefällen abweichen (z.B. 06:59)
        (hmZ(startTimeDate) === '00:00' && hourZ(endTimeDate) <= 7))

    const isNightShiftInterruption = entry.entryType === 'SLEEP_INTERRUPTION'

    const isNightShift = isNightShiftFirstBlock || isNightShiftSecondBlock || isNightShiftSleep || isNightShiftInterruption

    // Kompatibilität: alte Daten waren auf den Folgetag "gebucht" (date == startTime-Kalendertag).
    // Dann muss das Buchungsdatum für 06:01 / 00:00-06:00 um einen Tag zurück verschoben werden.
    const isOldSplitBooking = sameYMDZ(entryDate, startTimeDate)
    let bookingDate = new Date(entryDate)
    if (isOldSplitBooking && (isNightShiftSecondBlock || (isNightShiftSleep && hmZ(startTimeDate) === '00:00'))) {
      bookingDate.setDate(bookingDate.getDate() - 1)
      bookingDate.setHours(0, 0, 0, 0)
    }

    // Bearbeitbarkeit immer auf Buchungsdatum prüfen
    if (!isDateEditableForEmployee(bookingDate, false)) {
      return NextResponse.json(
        { error: 'Dieses Datum kann nicht mehr bearbeitet werden. Rückwirkende Zeiterfassung ist nur für die letzten 2 Tage möglich.' },
        { status: 403 }
      )
    }

    const bookingDayStart = new Date(bookingDate)
    bookingDayStart.setHours(0, 0, 0, 0)
    const bookingDayEnd = new Date(bookingDate)
    bookingDayEnd.setHours(23, 59, 59, 999)

    const nextDay = new Date(bookingDate)
    nextDay.setDate(nextDay.getDate() + 1)
    const nextDayStart = new Date(nextDay)
    nextDayStart.setHours(0, 0, 0, 0)
    const nextDayEnd = new Date(nextDay)
    nextDayEnd.setHours(23, 59, 59, 999)

    const isNightShiftRelatedEntry = (e: typeof entry) => {
      const st = new Date(e.startTime)
      const et = e.endTime ? new Date(e.endTime) : null
      const isSecond = e.entryType === 'WORK' && hmZ(st) === '06:01'
      const isFirst =
        e.entryType === 'WORK' &&
        !!et &&
        hmZ(et) === '23:00' &&
        hourZ(st) >= 17 &&
        hourZ(st) <= 22
      const isSleep =
        e.entryType === 'SLEEP' &&
        !!et &&
        ((hmZ(st) === '23:01' && hmZ(et) === '23:59') ||
          (hmZ(st) === '00:00' && hourZ(et) <= 7))
      const isInterruption = e.entryType === 'SLEEP_INTERRUPTION'
      return isFirst || isSecond || isSleep || isInterruption
    }

    let deletedNextDay = false

    await prisma.$transaction(async (tx) => {
      const idsToDelete = new Set<string>()

      if (!isNightShift) {
        idsToDelete.add(entry.id)
      } else {
        // Neues System: alles auf bookingDate
        const bookingEntries = await tx.timeEntry.findMany({
          where: {
            employeeId: entry.employeeId,
            date: { gte: bookingDayStart, lte: bookingDayEnd },
          },
        })

        for (const e of bookingEntries) {
          if (isNightShiftRelatedEntry(e)) {
            idsToDelete.add(e.id)
          }
        }

        // Fallback: altes System (Teile am Folgetag gebucht)
        const nextEntries = await tx.timeEntry.findMany({
          where: {
            employeeId: entry.employeeId,
            date: { gte: nextDayStart, lte: nextDayEnd },
          },
        })
        for (const e of nextEntries) {
          const st = new Date(e.startTime)
          const et = e.endTime ? new Date(e.endTime) : null
          const isCarryOverWork = e.entryType === 'WORK' && hmZ(st) === '06:01'
          const isCarryOverSleep = e.entryType === 'SLEEP' && !!et && hmZ(st) === '00:00' && hourZ(et) <= 7
          const isCarryOverInterruption = e.entryType === 'SLEEP_INTERRUPTION'
          if (isCarryOverWork || isCarryOverSleep || isCarryOverInterruption) {
            idsToDelete.add(e.id)
            deletedNextDay = true
          }
        }
      }

      const ids = Array.from(idsToDelete)
      if (ids.length > 0) {
        await tx.timeEntry.deleteMany({
          where: { id: { in: ids } },
        })
      }
    })

    // Salden neu berechnen (Buchungsdatum + ggf. Folgetag für alte Daten)
    await updateMonthlyBalance(entry.employeeId, bookingDate)
    if (deletedNextDay) {
      await updateMonthlyBalance(entry.employeeId, nextDay)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting time entry:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

