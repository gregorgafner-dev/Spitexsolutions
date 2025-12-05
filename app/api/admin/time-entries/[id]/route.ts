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
      console.log('[Admin DELETE] Erster Nachtdienst-Block wird gelöscht:', {
        entryId: params.id,
        entryDate: entryDate.toISOString(),
        employeeId: entry.employeeId
      })
      
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
        
        console.log('[Admin DELETE] Einträge am Folgetag gefunden:', {
          nextDay: nextDay.toISOString(),
          count: relatedEntries.length,
          entries: relatedEntries.map(e => ({
            id: e.id,
            entryType: e.entryType,
            startTime: e.startTime.toISOString(),
            endTime: e.endTime?.toISOString()
          }))
        })
        
        // Finde und lösche Eintrag mit Startzeit 06:01 (zweiter Arbeitszeit-Block)
        const workEntry = relatedEntries.find(e => {
          const startTime = new Date(e.startTime)
          return startTime.getHours() === 6 && startTime.getMinutes() === 1 && e.entryType !== 'SLEEP' && e.entryType !== 'SLEEP_INTERRUPTION'
        })
        
        if (workEntry) {
          console.log('[Admin DELETE] Lösche zweiten Block (06:01):', workEntry.id)
          await prisma.timeEntry.delete({
            where: { id: workEntry.id },
          })
        }
        
        // WICHTIG: Lösche ALLE SLEEP-Einträge am Folgetag (00:00-06:00), die zu DIESEM Nachtdienst gehören
        // Wenn wir den ersten Block löschen, gehören die SLEEP-Einträge am Folgetag zu diesem Nachtdienst
        // WICHTIG: Auch wenn der zweite Block (06:01) bereits gelöscht wurde, müssen wir die SLEEP-Einträge löschen
        // Prüfe, ob es einen 06:01-Block gibt ODER ob wir den ersten Block löschen (dann gehören die SLEEP-Einträge definitiv zu diesem Nachtdienst)
        const hasSecondBlock = relatedEntries.some(e => {
          if (e.entryType === 'SLEEP' || e.entryType === 'SLEEP_INTERRUPTION') return false
          const startTime = new Date(e.startTime)
          return startTime.getHours() === 6 && startTime.getMinutes() === 1
        })
        
        // Wenn der zweite Block existiert ODER wenn wir den ersten Block löschen, gehören die SLEEP-Einträge zu diesem Nachtdienst
        // WICHTIG: Auch wenn der zweite Block bereits gelöscht wurde, müssen wir die SLEEP-Einträge löschen
        // Daher löschen wir IMMER die SLEEP-Einträge, wenn wir den ersten Block löschen
        const sleepEntries = relatedEntries.filter(e => {
          if (e.entryType !== 'SLEEP') return false
          const startTime = new Date(e.startTime)
          // Nur SLEEP-Einträge, die um 00:00 beginnen (gehören zu diesem Nachtdienst)
          return startTime.getHours() === 0 && startTime.getMinutes() === 0
        })
        
        console.log('[Admin DELETE] SLEEP-Einträge am Folgetag gefunden:', {
          count: sleepEntries.length,
          hasSecondBlock,
          entries: sleepEntries.map(e => ({
            id: e.id,
            startTime: e.startTime.toISOString(),
            endTime: e.endTime?.toISOString()
          }))
        })
        
        // Lösche SLEEP-Einträge IMMER, wenn wir den ersten Block löschen
        // (auch wenn der zweite Block bereits gelöscht wurde)
        for (const sleepEntry of sleepEntries) {
          console.log('[Admin DELETE] Lösche SLEEP-Eintrag am Folgetag:', sleepEntry.id)
          await prisma.timeEntry.delete({
            where: { id: sleepEntry.id },
          })
        }
        
        // Finde und lösche SLEEP_INTERRUPTION-Einträge am Folgetag
        // WICHTIG: Auch diese werden IMMER gelöscht, wenn wir den ersten Block löschen
        const interruptionEntries = relatedEntries.filter(e => e.entryType === 'SLEEP_INTERRUPTION')
        console.log('[Admin DELETE] SLEEP_INTERRUPTION-Einträge am Folgetag gefunden:', {
          count: interruptionEntries.length,
          entries: interruptionEntries.map(e => ({
            id: e.id,
            startTime: e.startTime.toISOString()
          }))
        })
        
        for (const interruptionEntry of interruptionEntries) {
          console.log('[Admin DELETE] Lösche SLEEP_INTERRUPTION-Eintrag am Folgetag:', interruptionEntry.id)
          await prisma.timeEntry.delete({
            where: { id: interruptionEntry.id },
          })
        }
        
        // Aktualisiere Monatssaldo für Folgetag
        await updateMonthlyBalance(entry.employeeId, nextDay)
      }
      
      // Lösche auch SLEEP-Einträge am aktuellen Tag (23:01-23:59), die zu DIESEM Nachtdienst gehören
      // Ein SLEEP-Eintrag gehört zu diesem Nachtdienst, wenn er um 23:01 beginnt
      // WICHTIG: Diese werden IMMER gelöscht, wenn der erste Block gelöscht wird
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
          entryType: { in: ['SLEEP', 'SLEEP_INTERRUPTION'] },
        },
      })
      
      console.log('[Admin DELETE] SLEEP-Einträge am aktuellen Tag gefunden:', {
        entryDate: entryDate.toISOString(),
        count: currentDayEntries.length,
        entries: currentDayEntries.map(e => ({
          id: e.id,
          entryType: e.entryType,
          startTime: e.startTime.toISOString(),
          endTime: e.endTime?.toISOString()
        }))
      })
      
      // Lösche SLEEP-Einträge, die um 23:01 beginnen (gehören zu diesem Nachtdienst)
      // Diese werden IMMER gelöscht, wenn der erste Block (19:00-23:00) gelöscht wird
      for (const sleepEntry of currentDayEntries) {
        const startTime = new Date(sleepEntry.startTime)
        // Nur löschen, wenn um 23:01 beginnt (gehört zu diesem Nachtdienst)
        if (startTime.getHours() === 23 && startTime.getMinutes() === 1) {
          console.log('[Admin DELETE] Lösche SLEEP-Eintrag am aktuellen Tag (23:01):', sleepEntry.id)
          await prisma.timeEntry.delete({
            where: { id: sleepEntry.id },
          })
        }
      }
    } else if (isNightShiftSecondBlock) {
      console.log('[Admin DELETE] Zweiter Nachtdienst-Block wird gelöscht:', {
        entryId: params.id,
        entryDate: entryDate.toISOString(),
        employeeId: entry.employeeId
      })
      
      // Zweiter Block (06:01): Finde und lösche den zugehörigen ersten Block (19:00-23:00) am Vortag
      const previousDay = new Date(entryDate)
      previousDay.setDate(previousDay.getDate() - 1)
      
      // Definiere workEntry außerhalb des if-Blocks, damit es später verwendet werden kann
      let workEntry: typeof entry | undefined = undefined
      
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
        
        console.log('[Admin DELETE] Einträge am Vortag gefunden:', {
          previousDay: previousDay.toISOString(),
          count: relatedEntries.length,
          entries: relatedEntries.map(e => ({
            id: e.id,
            entryType: e.entryType,
            startTime: e.startTime.toISOString(),
            endTime: e.endTime?.toISOString()
          }))
        })
        
        // Finde und lösche Eintrag mit Startzeit 19:00 und Endzeit 23:00 (erster Arbeitszeit-Block)
        workEntry = relatedEntries.find(e => {
          if (!e.endTime || e.entryType === 'SLEEP' || e.entryType === 'SLEEP_INTERRUPTION') return false
          const startTime = new Date(e.startTime)
          const endTime = new Date(e.endTime)
          return startTime.getHours() === 19 && startTime.getMinutes() === 0 &&
                 endTime.getHours() === 23 && endTime.getMinutes() === 0
        })
        
        if (workEntry) {
          console.log('[Admin DELETE] Lösche ersten Block (19:00-23:00):', workEntry.id)
          await prisma.timeEntry.delete({
            where: { id: workEntry.id },
          })
        }
        
        // WICHTIG: Lösche ALLE SLEEP-Einträge am Vortag (23:01-23:59), die zu DIESEM Nachtdienst gehören
        // Wenn wir den zweiten Block löschen, gehören die SLEEP-Einträge am Vortag zu diesem Nachtdienst
        // WICHTIG: Auch wenn der erste Block (19:00-23:00) bereits gelöscht wurde, müssen wir die SLEEP-Einträge löschen
        // Prüfe, ob es einen 19:00-23:00-Block gibt ODER ob wir den zweiten Block löschen (dann gehören die SLEEP-Einträge definitiv zu diesem Nachtdienst)
        const hasFirstBlock = relatedEntries.some(e => {
          if (!e.endTime || e.entryType === 'SLEEP' || e.entryType === 'SLEEP_INTERRUPTION') return false
          const startTime = new Date(e.startTime)
          const endTime = new Date(e.endTime)
          return startTime.getHours() === 19 && startTime.getMinutes() === 0 &&
                 endTime.getHours() === 23 && endTime.getMinutes() === 0
        })
        
        // Wenn der erste Block existiert ODER wenn wir den zweiten Block löschen, gehören die SLEEP-Einträge zu diesem Nachtdienst
        // WICHTIG: Auch wenn der erste Block bereits gelöscht wurde, müssen wir die SLEEP-Einträge löschen
        // Daher löschen wir IMMER die SLEEP-Einträge, wenn wir den zweiten Block löschen
        const sleepEntries = relatedEntries.filter(e => {
          if (e.entryType !== 'SLEEP') return false
          const startTime = new Date(e.startTime)
          // Nur SLEEP-Einträge, die um 23:01 beginnen (gehören zu diesem Nachtdienst)
          return startTime.getHours() === 23 && startTime.getMinutes() === 1
        })
        
        console.log('[Admin DELETE] SLEEP-Einträge am Vortag gefunden:', {
          count: sleepEntries.length,
          hasFirstBlock,
          entries: sleepEntries.map(e => ({
            id: e.id,
            startTime: e.startTime.toISOString(),
            endTime: e.endTime?.toISOString()
          }))
        })
        
        // Lösche SLEEP-Einträge IMMER, wenn wir den zweiten Block löschen
        // (auch wenn der erste Block bereits gelöscht wurde)
        for (const sleepEntry of sleepEntries) {
          console.log('[Admin DELETE] Lösche SLEEP-Eintrag am Vortag (23:01):', sleepEntry.id)
          await prisma.timeEntry.delete({
            where: { id: sleepEntry.id },
          })
        }
        
        // Finde und lösche SLEEP_INTERRUPTION-Einträge am Vortag
        // WICHTIG: Auch diese werden IMMER gelöscht, wenn wir den zweiten Block löschen
        const interruptionEntries = relatedEntries.filter(e => e.entryType === 'SLEEP_INTERRUPTION')
        console.log('[Admin DELETE] SLEEP_INTERRUPTION-Einträge am Vortag gefunden:', {
          count: interruptionEntries.length,
          entries: interruptionEntries.map(e => ({
            id: e.id,
            startTime: e.startTime.toISOString()
          }))
        })
        
        for (const interruptionEntry of interruptionEntries) {
          console.log('[Admin DELETE] Lösche SLEEP_INTERRUPTION-Eintrag am Vortag:', interruptionEntry.id)
          await prisma.timeEntry.delete({
            where: { id: interruptionEntry.id },
          })
        }
        
        // Aktualisiere Monatssaldo für Vortag
        await updateMonthlyBalance(entry.employeeId, previousDay)
      }
      
      // Lösche auch SLEEP-Einträge und SLEEP_INTERRUPTION-Einträge am aktuellen Tag (00:00-06:00), die zu DIESEM Nachtdienst gehören
      // Ein SLEEP-Eintrag gehört zu diesem Nachtdienst, wenn er um 00:00 beginnt
      // WICHTIG: Diese werden IMMER gelöscht, wenn der zweite Block (06:01) gelöscht wird
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
          entryType: { in: ['SLEEP', 'SLEEP_INTERRUPTION'] },
        },
      })
      
      console.log('[Admin DELETE] SLEEP-Einträge am aktuellen Tag gefunden:', {
        entryDate: entryDate.toISOString(),
        count: currentDayEntries.length,
        entries: currentDayEntries.map(e => ({
          id: e.id,
          entryType: e.entryType,
          startTime: e.startTime.toISOString(),
          endTime: e.endTime?.toISOString()
        }))
      })
      
      // Lösche SLEEP-Einträge, die um 00:00 beginnen (gehören zu diesem Nachtdienst)
      // Diese werden IMMER gelöscht, wenn der zweite Block (06:01) gelöscht wird
      for (const sleepEntry of currentDayEntries) {
        const startTime = new Date(sleepEntry.startTime)
        // Nur löschen, wenn um 00:00 beginnt (gehört zu diesem Nachtdienst)
        if (startTime.getHours() === 0 && startTime.getMinutes() === 0) {
          console.log('[Admin DELETE] Lösche SLEEP-Eintrag am aktuellen Tag (00:00):', sleepEntry.id)
          await prisma.timeEntry.delete({
            where: { id: sleepEntry.id },
          })
        }
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


