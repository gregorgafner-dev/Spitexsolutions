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
    const isNightShiftSecondBlock = entry.entryType === 'WORK' && startHour === 6 && startMinute === 1 // 06:01
    
    // Erster Block: Startzeit 19:00 und Endzeit 23:00 (Sekunden werden ignoriert)
    let isNightShiftFirstBlock = false
    if (entry.entryType === 'WORK' && startTimeStr === '19:00' && entry.endTime) {
      const endTimeDate = new Date(entry.endTime)
      const endHour = endTimeDate.getHours()
      const endMinute = endTimeDate.getMinutes()
      isNightShiftFirstBlock = endHour === 23 && endMinute === 0 // 19:00-23:00
    }
    
    // Prüfe ob es ein Nachtdienst-SLEEP-Eintrag ist (23:01-23:59 oder 00:00-06:00)
    let isNightShiftSleep = false
    if (entry.entryType === 'SLEEP' && entry.endTime) {
      const endTimeDate = new Date(entry.endTime)
      const endHour = endTimeDate.getHours()
      const endMinute = endTimeDate.getMinutes()
      // 23:01-23:59 (59 Minuten) oder 00:00-06:00 (6 Stunden)
      const isNightSleep23 = startHour === 23 && startMinute === 1 && endHour === 23 && endMinute === 59
      const isNightSleep00 = startHour === 0 && startMinute === 0 && endHour === 6 && endMinute === 0
      isNightShiftSleep = isNightSleep23 || isNightSleep00
    }

    // WICHTIG: Alle Nachtdienst-Einträge werden am Startdatum gebucht
    // Bei Nachtdienst: Lösche alle zugehörigen Einträge am gleichen Datum (und auch am Folgetag/Vortag für alte Einträge)
    if (isNightShiftFirstBlock || isNightShiftSecondBlock || isNightShiftSleep) {
      const dayStart = new Date(entryDate)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(entryDate)
      dayEnd.setHours(23, 59, 59, 999)
      
      // Hole alle Einträge am gleichen Tag
      const allDayEntries = await prisma.timeEntry.findMany({
        where: {
          employeeId: entry.employeeId,
          date: {
            gte: dayStart,
            lte: dayEnd,
          },
        },
      })
      
      // Finde und lösche den zugehörigen anderen Arbeitszeit-Block am gleichen Tag
      if (isNightShiftFirstBlock || isNightShiftSleep) {
        // Erster Block oder SLEEP-Eintrag gelöscht: Lösche zweiten Block (06:01) am gleichen Tag
        const secondBlock = allDayEntries.find(e => {
          if (e.id === entry.id || e.entryType !== 'WORK') return false
          const startTime = new Date(e.startTime)
          return startTime.getHours() === 6 && startTime.getMinutes() === 1
        })
        if (secondBlock) {
          await prisma.timeEntry.delete({
            where: { id: secondBlock.id },
          })
        }
        
        // Wenn SLEEP-Eintrag gelöscht wurde, lösche auch den ersten Block (19:00-23:00)
        if (isNightShiftSleep) {
          const firstBlock = allDayEntries.find(e => {
            if (e.id === entry.id || !e.endTime || e.entryType !== 'WORK') return false
            const startTime = new Date(e.startTime)
            const endTime = new Date(e.endTime)
            return startTime.getHours() === 19 && startTime.getMinutes() === 0 &&
                   endTime.getHours() === 23 && endTime.getMinutes() === 0
          })
          if (firstBlock) {
            await prisma.timeEntry.delete({
              where: { id: firstBlock.id },
            })
          }
        }
      }
      
      if (isNightShiftSecondBlock) {
        // Zweiter Block gelöscht: Lösche ersten Block (19:00-23:00) am gleichen Tag
        const firstBlock = allDayEntries.find(e => {
          if (e.id === entry.id || !e.endTime || e.entryType !== 'WORK') return false
          const startTime = new Date(e.startTime)
          const endTime = new Date(e.endTime)
          return startTime.getHours() === 19 && startTime.getMinutes() === 0 &&
                 endTime.getHours() === 23 && endTime.getMinutes() === 0
        })
        if (firstBlock) {
          await prisma.timeEntry.delete({
            where: { id: firstBlock.id },
          })
        }
      }
      
      // Lösche alle SLEEP-Einträge am gleichen Tag, die zu einem Nachtdienst gehören
      // (23:01-23:59 oder 00:00-06:00)
      const sleepEntries = allDayEntries.filter(e => {
        if (e.entryType !== 'SLEEP' || e.id === entry.id || !e.endTime) return false
        const startTime = new Date(e.startTime)
        const endTime = new Date(e.endTime)
        const startHour = startTime.getHours()
        const startMinute = startTime.getMinutes()
        const endHour = endTime.getHours()
        const endMinute = endTime.getMinutes()
        
        // Prüfe ob es ein Nachtdienst-SLEEP-Eintrag ist (23:01-23:59 oder 00:00-06:00)
        const isNightSleep23 = startHour === 23 && startMinute === 1 && endHour === 23 && endMinute === 59
        const isNightSleep00 = startHour === 0 && startMinute === 0 && endHour === 6 && endMinute === 0
        
        return isNightSleep23 || isNightSleep00
      })
      for (const sleepEntry of sleepEntries) {
        await prisma.timeEntry.delete({
          where: { id: sleepEntry.id },
        })
      }
      
      // Lösche alle SLEEP_INTERRUPTION-Einträge am gleichen Tag
      const sleepInterruptionEntries = allDayEntries.filter(e => e.entryType === 'SLEEP_INTERRUPTION' && e.id !== entry.id)
      for (const interruptionEntry of sleepInterruptionEntries) {
        await prisma.timeEntry.delete({
          where: { id: interruptionEntry.id },
        })
      }
      
      // FALLBACK: Für alte Einträge, die noch nach dem alten System (über zwei Tage) gespeichert sind:
      // Prüfe auch Folgetag (bei erstem Block/SLEEP) bzw. Vortag (bei zweitem Block)
      if (isNightShiftFirstBlock || (isNightShiftSleep && startHour === 23)) {
        // Prüfe Folgetag für alte Einträge
        const nextDay = new Date(entryDate)
        nextDay.setDate(nextDay.getDate() + 1)
        if (nextDay >= yearStart) {
          const nextDayStart = new Date(nextDay)
          nextDayStart.setHours(0, 0, 0, 0)
          const nextDayEnd = new Date(nextDay)
          nextDayEnd.setHours(23, 59, 59, 999)
          
          const nextDayEntries = await prisma.timeEntry.findMany({
            where: {
              employeeId: entry.employeeId,
              date: {
                gte: nextDayStart,
                lte: nextDayEnd,
              },
            },
          })
          
          // Lösche zweiten Block am Folgetag (falls vorhanden)
          const secondBlockNextDay = nextDayEntries.find(e => {
            if (e.entryType === 'SLEEP' || e.entryType === 'SLEEP_INTERRUPTION') return false
            const startTime = new Date(e.startTime)
            return startTime.getHours() === 6 && startTime.getMinutes() === 1
          })
          if (secondBlockNextDay) {
            await prisma.timeEntry.delete({
              where: { id: secondBlockNextDay.id },
            })
          }
          
          // Lösche SLEEP-Einträge am Folgetag, die zu einem Nachtdienst gehören
          // (00:00-06:00 - diese könnten vom alten System stammen)
          const sleepEntriesNextDay = nextDayEntries.filter(e => {
            if (e.entryType !== 'SLEEP' || !e.endTime) return false
            const startTime = new Date(e.startTime)
            const endTime = new Date(e.endTime)
            const startHour = startTime.getHours()
            const startMinute = startTime.getMinutes()
            const endHour = endTime.getHours()
            const endMinute = endTime.getMinutes()
            
            // Prüfe ob es ein Nachtdienst-SLEEP-Eintrag ist (00:00-06:00)
            return startHour === 0 && startMinute === 0 && endHour === 6 && endMinute === 0
          })
          for (const sleepEntry of sleepEntriesNextDay) {
            await prisma.timeEntry.delete({
              where: { id: sleepEntry.id },
            })
          }
          
          // Lösche SLEEP_INTERRUPTION am Folgetag
          const interruptionEntriesNextDay = nextDayEntries.filter(e => e.entryType === 'SLEEP_INTERRUPTION')
          for (const interruptionEntry of interruptionEntriesNextDay) {
            await prisma.timeEntry.delete({
              where: { id: interruptionEntry.id },
            })
          }
          
          await updateMonthlyBalance(entry.employeeId, nextDay)
        }
      }
      
      // Prüfe auch Vortag für SLEEP-Einträge (00:00-06:00), die nach altem System am Folgetag gebucht wurden
      if ((isNightShiftSleep && startHour === 0) || isNightShiftSecondBlock) {
        // Prüfe Vortag für alte Einträge
        const previousDay = new Date(entryDate)
        previousDay.setDate(previousDay.getDate() - 1)
        if (previousDay >= yearStart) {
          const previousDayStart = new Date(previousDay)
          previousDayStart.setHours(0, 0, 0, 0)
          const previousDayEnd = new Date(previousDay)
          previousDayEnd.setHours(23, 59, 59, 999)
          
          const previousDayEntries = await prisma.timeEntry.findMany({
            where: {
              employeeId: entry.employeeId,
              date: {
                gte: previousDayStart,
                lte: previousDayEnd,
              },
            },
          })
          
          // Lösche ersten Block am Vortag (falls vorhanden)
          const firstBlockPrevDay = previousDayEntries.find(e => {
            if (!e.endTime || e.entryType === 'SLEEP' || e.entryType === 'SLEEP_INTERRUPTION') return false
            const startTime = new Date(e.startTime)
            const endTime = new Date(e.endTime)
            return startTime.getHours() === 19 && startTime.getMinutes() === 0 &&
                   endTime.getHours() === 23 && endTime.getMinutes() === 0
          })
          if (firstBlockPrevDay) {
            await prisma.timeEntry.delete({
              where: { id: firstBlockPrevDay.id },
            })
          }
          
          // Lösche SLEEP-Einträge am Vortag, die zu einem Nachtdienst gehören
          // (23:01-23:59 - diese könnten vom alten System stammen)
          const sleepEntriesPrevDay = previousDayEntries.filter(e => {
            if (e.entryType !== 'SLEEP' || !e.endTime) return false
            const startTime = new Date(e.startTime)
            const endTime = new Date(e.endTime)
            const startHour = startTime.getHours()
            const startMinute = startTime.getMinutes()
            const endHour = endTime.getHours()
            const endMinute = endTime.getMinutes()
            
            // Prüfe ob es ein Nachtdienst-SLEEP-Eintrag ist (23:01-23:59)
            return startHour === 23 && startMinute === 1 && endHour === 23 && endMinute === 59
          })
          for (const sleepEntry of sleepEntriesPrevDay) {
            await prisma.timeEntry.delete({
              where: { id: sleepEntry.id },
            })
          }
          
          await updateMonthlyBalance(entry.employeeId, previousDay)
        }
      }
      
      // Wenn SLEEP-Eintrag (00:00-06:00) gelöscht wurde, prüfe auch Folgetag (für alte Einträge)
      if (isNightShiftSleep && startHour === 0) {
        const nextDay = new Date(entryDate)
        nextDay.setDate(nextDay.getDate() + 1)
        if (nextDay >= yearStart) {
          const nextDayStart = new Date(nextDay)
          nextDayStart.setHours(0, 0, 0, 0)
          const nextDayEnd = new Date(nextDay)
          nextDayEnd.setHours(23, 59, 59, 999)
          
          const nextDayEntries = await prisma.timeEntry.findMany({
            where: {
              employeeId: entry.employeeId,
              date: {
                gte: nextDayStart,
                lte: nextDayEnd,
              },
            },
          })
          
          // Lösche zweiten Block am Folgetag (falls vorhanden)
          const secondBlockNextDay = nextDayEntries.find(e => {
            if (e.entryType === 'SLEEP' || e.entryType === 'SLEEP_INTERRUPTION') return false
            const startTime = new Date(e.startTime)
            return startTime.getHours() === 6 && startTime.getMinutes() === 1
          })
          if (secondBlockNextDay) {
            await prisma.timeEntry.delete({
              where: { id: secondBlockNextDay.id },
            })
          }
          
          await updateMonthlyBalance(entry.employeeId, nextDay)
        }
      }
    }

    // Lösche den aktuellen Eintrag
    await prisma.timeEntry.delete({
      where: { id: params.id },
    })

    // Aktualisiere Monatssaldo nach Löschung
    // WICHTIG: Alle Nachtdienst-Einträge sind am gleichen Datum, daher nur einmal aktualisieren
    await updateMonthlyBalance(employeeId, entryDate)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting time entry:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


