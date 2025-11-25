import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import { calculateWorkHours, violatesMaxWorkBlock, isHolidayOrSunday, calculateSurchargeHours } from '@/lib/calculations'
import { updateMonthlyBalance } from '@/lib/update-monthly-balance'
import { checkOverlappingBlocks, checkNegativeWorkTime, checkMissingEndTime } from '@/lib/time-entry-validation'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const entry = await prisma.timeEntry.findUnique({
      where: { id: params.id },
    })

    if (!entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
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

    // Validierung 2: Prüfe negative Arbeitszeit
    if (endTimeDate && checkNegativeWorkTime(startTimeDate, endTimeDate)) {
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

    if (entry.entryType === 'SLEEP_INTERRUPTION') {
      if (sleepInterruptionMinutes !== undefined) {
        updateData.sleepInterruptionMinutes = parseInt(sleepInterruptionMinutes) || 0
      }
      updateData.startTime = entry.startTime
      updateData.endTime = entry.endTime
    } else {
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

    // Aktualisiere Monatssaldo
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
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const entry = await prisma.timeEntry.findUnique({
      where: { id: params.id },
    })

    if (!entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    }

    const employeeId = entry.employeeId
    const entryDate = new Date(entry.date)
    
    // Prüfe ob das Datum im laufenden Jahr liegt (ab 1.1.)
    const currentYear = new Date().getFullYear()
    const yearStart = new Date(currentYear, 0, 1) // 1. Januar des laufenden Jahres
    if (entryDate < yearStart) {
      return NextResponse.json(
        { error: 'Einträge können nur für das laufende Jahr (ab 1.1.) gelöscht werden.' },
        { status: 403 }
      )
    }

    const startTimeDate = new Date(entry.startTime)
    const startHour = startTimeDate.getHours()
    const startMinute = startTimeDate.getMinutes()
    const startTimeStr = `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`
    
    // Prüfe ob es ein Nachtdienst-Eintrag ist
    // Zweiter Block: Startzeit muss 06:01 sein (Sekunden werden ignoriert)
    const isNightShiftSecondBlock = startHour === 6 && startMinute === 1 // 06:01
    
    // Erster Block: Startzeit 19:00 und Endzeit 23:00 (Sekunden werden ignoriert)
    let isNightShiftFirstBlock = false
    if (startTimeStr === '19:00' && entry.endTime) {
      const endTimeDate = new Date(entry.endTime)
      const endHour = endTimeDate.getHours()
      const endMinute = endTimeDate.getMinutes()
      isNightShiftFirstBlock = endHour === 23 && endMinute === 0 // 19:00-23:00
    }

    // Bei Nachtdienst: Prüfe auch den zugehörigen Block und lösche ihn, sowie alle SLEEP-Einträge
    if (isNightShiftFirstBlock) {
      // Erster Block (19:00-23:00): Finde und lösche den zugehörigen zweiten Block (06:01) am Folgetag
      const nextDay = new Date(entryDate)
      nextDay.setDate(nextDay.getDate() + 1)
      
      // Prüfe ob Folgetag auch im laufenden Jahr liegt
      if (nextDay >= yearStart) {
        const nextDayStart = new Date(nextDay)
        nextDayStart.setHours(0, 0, 0, 0)
        const nextDayEnd = new Date(nextDay)
        nextDayEnd.setHours(23, 59, 59, 999)
        
        // Suche nach allen Einträgen am Folgetag (Arbeitszeit und SLEEP)
        const relatedEntries = await prisma.timeEntry.findMany({
          where: {
            employeeId: entry.employeeId,
            date: {
              gte: nextDayStart,
              lte: nextDayEnd,
            },
          },
        })
        
        // Finde und lösche Eintrag mit Startzeit 06:01 (zweiter Arbeitszeit-Block)
        const workEntry = relatedEntries.find(e => {
          const startTime = new Date(e.startTime)
          return startTime.getHours() === 6 && startTime.getMinutes() === 1 && e.entryType !== 'SLEEP' && e.entryType !== 'SLEEP_INTERRUPTION'
        })
        
        if (workEntry) {
          await prisma.timeEntry.delete({
            where: { id: workEntry.id },
          })
        }
        
        // Finde und lösche SLEEP-Einträge am Folgetag (00:00-06:00)
        const sleepEntries = relatedEntries.filter(e => e.entryType === 'SLEEP')
        for (const sleepEntry of sleepEntries) {
          await prisma.timeEntry.delete({
            where: { id: sleepEntry.id },
          })
        }
        
        // Aktualisiere Monatssaldo für Folgetag
        await updateMonthlyBalance(entry.employeeId, nextDay)
      }
      
      // Lösche auch SLEEP-Einträge am aktuellen Tag (23:01-23:59)
      const currentDayStart = new Date(entryDate)
      currentDayStart.setHours(0, 0, 0, 0)
      const currentDayEnd = new Date(entryDate)
      currentDayEnd.setHours(23, 59, 59, 999)
      
      const currentDayEntries = await prisma.timeEntry.findMany({
        where: {
          employeeId: entry.employeeId,
          date: {
            gte: currentDayStart,
            lte: currentDayEnd,
          },
          entryType: 'SLEEP',
        },
      })
      
      for (const sleepEntry of currentDayEntries) {
        await prisma.timeEntry.delete({
          where: { id: sleepEntry.id },
        })
      }
    } else if (isNightShiftSecondBlock) {
      // Zweiter Block (06:01): Finde und lösche den zugehörigen ersten Block (19:00-23:00) am Vortag
      const previousDay = new Date(entryDate)
      previousDay.setDate(previousDay.getDate() - 1)
      
      // Prüfe ob Vortag auch im laufenden Jahr liegt
      if (previousDay >= yearStart) {
        const previousDayStart = new Date(previousDay)
        previousDayStart.setHours(0, 0, 0, 0)
        const previousDayEnd = new Date(previousDay)
        previousDayEnd.setHours(23, 59, 59, 999)
        
        // Suche nach allen Einträgen am Vortag (Arbeitszeit und SLEEP)
        const relatedEntries = await prisma.timeEntry.findMany({
          where: {
            employeeId: entry.employeeId,
            date: {
              gte: previousDayStart,
              lte: previousDayEnd,
            },
          },
        })
        
        // Finde und lösche Eintrag mit Startzeit 19:00 und Endzeit 23:00 (erster Arbeitszeit-Block)
        const workEntry = relatedEntries.find(e => {
          if (!e.endTime || e.entryType === 'SLEEP' || e.entryType === 'SLEEP_INTERRUPTION') return false
          const startTime = new Date(e.startTime)
          const endTime = new Date(e.endTime)
          return startTime.getHours() === 19 && startTime.getMinutes() === 0 &&
                 endTime.getHours() === 23 && endTime.getMinutes() === 0
        })
        
        if (workEntry) {
          await prisma.timeEntry.delete({
            where: { id: workEntry.id },
          })
        }
        
        // Finde und lösche SLEEP-Einträge am Vortag (23:01-23:59)
        const sleepEntries = relatedEntries.filter(e => e.entryType === 'SLEEP')
        for (const sleepEntry of sleepEntries) {
          await prisma.timeEntry.delete({
            where: { id: sleepEntry.id },
          })
        }
        
        // Aktualisiere Monatssaldo für Vortag
        await updateMonthlyBalance(entry.employeeId, previousDay)
      }
      
      // Lösche auch SLEEP-Einträge am aktuellen Tag (00:00-06:00)
      const currentDayStart = new Date(entryDate)
      currentDayStart.setHours(0, 0, 0, 0)
      const currentDayEnd = new Date(entryDate)
      currentDayEnd.setHours(23, 59, 59, 999)
      
      const currentDayEntries = await prisma.timeEntry.findMany({
        where: {
          employeeId: entry.employeeId,
          date: {
            gte: currentDayStart,
            lte: currentDayEnd,
          },
          entryType: 'SLEEP',
        },
      })
      
      for (const sleepEntry of currentDayEntries) {
        await prisma.timeEntry.delete({
          where: { id: sleepEntry.id },
        })
      }
    }

    // Lösche den aktuellen Eintrag
    await prisma.timeEntry.delete({
      where: { id: params.id },
    })

    // Aktualisiere Monatssaldo nach Löschung
    if (entry.endTime) {
      await updateMonthlyBalance(employeeId, entryDate)
      
      // Bei Nachtdienst: Aktualisiere auch den Monatssaldo für den anderen Tag
      if (isNightShiftSecondBlock) {
        // Zweiter Block gelöscht: Aktualisiere auch Vortag
        const previousDay = new Date(entryDate)
        previousDay.setDate(previousDay.getDate() - 1)
        if (previousDay >= yearStart) {
          await updateMonthlyBalance(employeeId, previousDay)
        }
      } else if (isNightShiftFirstBlock) {
        // Erster Block gelöscht: Aktualisiere auch Folgetag
        const nextDay = new Date(entryDate)
        nextDay.setDate(nextDay.getDate() + 1)
        if (nextDay >= yearStart) {
          await updateMonthlyBalance(employeeId, nextDay)
        }
      }
    } else {
      // Auch wenn kein endTime, aktualisiere Monatssaldo für das Datum
      await updateMonthlyBalance(employeeId, entryDate)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting time entry:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


