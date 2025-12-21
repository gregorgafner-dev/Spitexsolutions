import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import { calculateWorkHours, violatesMaxWorkBlock, isValidBreak, isHolidayOrSunday, calculateSurchargeHours } from '@/lib/calculations'
import { isDateEditableForEmployee } from '@/lib/date-validation'
import { checkOverlappingBlocks, checkNegativeWorkTime, checkMissingEndTime } from '@/lib/time-entry-validation'

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

    // Aktualisiere Monatssaldo (verwende entry.date falls endTimeDate null ist)
    await updateMonthlyBalance(entry.employeeId, endTimeDate || entry.date)

    return NextResponse.json(updatedEntry)
  } catch (error) {
    console.error('Error updating time entry:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function updateMonthlyBalance(employeeId: string, date: Date) {
  const year = date.getFullYear()
  const month = date.getMonth() + 1

  // Hole Employee mit Pensum
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  })

  if (!employee) return

  // Hole WorkTimeConfig für das Jahr
  let workTimeConfig = await prisma.workTimeConfig.findUnique({
    where: { year },
  })

  if (!workTimeConfig) {
    // Erstelle Standard-Config für Kanton Zug
    workTimeConfig = await prisma.workTimeConfig.create({
      data: {
        year,
        weeklyHours: 42.5,
      },
    })
  }

  // Berechne tatsächliche Stunden für den Monat
  const startOfMonth = new Date(year, month - 1, 1)
  const endOfMonth = new Date(year, month, 0, 23, 59, 59)

  const timeEntries = await prisma.timeEntry.findMany({
    where: {
      employeeId,
      date: {
        gte: startOfMonth,
        lte: endOfMonth,
      },
      endTime: { not: null },
    },
  })

  const actualHours = timeEntries.reduce((sum, entry) => {
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

  // Berechne Soll-Stunden
  const { calculateMonthlyTargetHours } = await import('@/lib/calculations')
  const targetHours = calculateMonthlyTargetHours(
    workTimeConfig.weeklyHours,
    employee.pensum,
    year,
    month
  )

  // Hole Vormonatssaldo
  let previousBalance = 0
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year

  const prevBalance = await prisma.monthlyBalance.findUnique({
    where: {
      employeeId_year_month: {
        employeeId,
        year: prevYear,
        month: prevMonth,
      },
    },
  })

  if (prevBalance) {
    previousBalance = prevBalance.balance
  }

  // Berechne neuen Saldo (inkl. Zeitzuschlag)
  const balance = (actualHours + surchargeHours) - targetHours + previousBalance

  // Aktualisiere oder erstelle Monatssaldo
  await prisma.monthlyBalance.upsert({
    where: {
      employeeId_year_month: {
        employeeId,
        year,
        month,
      },
    },
    update: {
      actualHours,
      surchargeHours,
      targetHours,
      balance,
      previousBalance,
    },
    create: {
      employeeId,
      year,
      month,
      actualHours,
      surchargeHours,
      targetHours,
      balance,
      previousBalance,
    },
  })
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

    // Prüfe ob das Datum noch bearbeitbar ist (nur für Mitarbeiter, nicht für Admins)
    const entryDate = new Date(entry.date)
    if (!isDateEditableForEmployee(entryDate, false)) {
      return NextResponse.json(
        { error: 'Dieses Datum kann nicht mehr bearbeitet werden. Rückwirkende Zeiterfassung ist nur für die letzten 2 Tage möglich.' },
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

    // Bei Nachtdienst: Prüfe auch den zugehörigen Block
    // WICHTIG: Die Editierbarkeitsprüfung gilt nur für den Tag, an dem der Nachtdienst begann (entryDate)
    // Der Folgetag muss nicht editierbar sein, da der zweite Block (06:01) zum Nachtdienst gehört, der am entryDate begann
    if (isNightShiftFirstBlock) {
      // Erster Block (19:00-23:00): Der Folgetag muss nicht editierbar sein
      // Der zweite Block (06:01) gehört zum Nachtdienst, der am entryDate begann
      const nextDay = new Date(entryDate)
      nextDay.setDate(nextDay.getDate() + 1)
      
      // Finde und lösche den zugehörigen zweiten Block (06:01) am Folgetag sowie alle SLEEP-Einträge
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
      
      // Finde und lösche SLEEP_INTERRUPTION-Einträge am Folgetag
      const interruptionEntries = relatedEntries.filter(e => e.entryType === 'SLEEP_INTERRUPTION')
      for (const interruptionEntry of interruptionEntries) {
        await prisma.timeEntry.delete({
          where: { id: interruptionEntry.id },
        })
      }
      
      // Aktualisiere Monatssaldo für Folgetag
      await updateMonthlyBalance(entry.employeeId, nextDay)
      
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
          entryType: { in: ['SLEEP', 'SLEEP_INTERRUPTION'] },
        },
      })
      
      for (const sleepEntry of currentDayEntries) {
        await prisma.timeEntry.delete({
          where: { id: sleepEntry.id },
        })
      }
    } else if (isNightShiftSecondBlock) {
      // Zweiter Block (06:01): Der Vortag (wo der Nachtdienst begann) muss editierbar sein
      // Der zweite Block gehört zum Nachtdienst, der am Vortag begann
      const previousDay = new Date(entryDate)
      previousDay.setDate(previousDay.getDate() - 1)
      if (!isDateEditableForEmployee(previousDay, false)) {
        return NextResponse.json(
          { error: 'Der zugehörige Nachtdienst-Eintrag am Vortag kann nicht mehr bearbeitet werden. Rückwirkende Zeiterfassung ist nur für die letzten 2 Tage möglich.' },
          { status: 403 }
        )
      }
      
      // Finde und lösche den zugehörigen ersten Block (19:00-23:00) am Vortag sowie alle SLEEP-Einträge
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
      
      // Finde und lösche SLEEP_INTERRUPTION-Einträge am Vortag
      const interruptionEntries = relatedEntries.filter(e => e.entryType === 'SLEEP_INTERRUPTION')
      for (const interruptionEntry of interruptionEntries) {
        await prisma.timeEntry.delete({
          where: { id: interruptionEntry.id },
        })
      }
      
      // Aktualisiere Monatssaldo für Vortag
      await updateMonthlyBalance(entry.employeeId, previousDay)
      
      // Lösche auch SLEEP-Einträge und SLEEP_INTERRUPTION-Einträge am aktuellen Tag (00:00-06:00)
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
      await updateMonthlyBalance(entry.employeeId, entryDate)
      
      // Bei Nachtdienst: Aktualisiere auch den Monatssaldo für den anderen Tag
      if (isNightShiftSecondBlock) {
        // Zweiter Block gelöscht: Aktualisiere auch Vortag
        const previousDay = new Date(entryDate)
        previousDay.setDate(previousDay.getDate() - 1)
        await updateMonthlyBalance(entry.employeeId, previousDay)
      } else if (isNightShiftFirstBlock) {
        // Erster Block gelöscht: Aktualisiere auch Folgetag
        const nextDay = new Date(entryDate)
        nextDay.setDate(nextDay.getDate() + 1)
        await updateMonthlyBalance(entry.employeeId, nextDay)
      }
    } else {
      // Auch wenn kein endTime, aktualisiere Monatssaldo für das Datum
      await updateMonthlyBalance(entry.employeeId, entryDate)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting time entry:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

