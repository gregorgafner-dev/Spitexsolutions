import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import { calculateWorkHours } from '@/lib/calculations'
import { format, parseISO, startOfDay, endOfDay, isSameDay } from 'date-fns'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Hole alle Mitarbeiter
    const employees = await prisma.employee.findMany({
      include: {
        user: true,
      },
    })

    const issues: Array<{
      id: string
      employeeId: string
      employeeName: string
      date: string
      type: 'TOO_MANY_BLOCKS' | 'TOO_MANY_HOURS' | 'TOO_MUCH_SLEEP_INTERRUPTION' | 'OVERLAPPING_BLOCKS' | 'MISSING_END_TIME' | 'NEGATIVE_WORK_TIME'
      message: string
      details: any
    }> = []

    // Prüfe für jeden Mitarbeiter die Zeiteinträge
    for (const employee of employees) {
      // Hole alle Zeiteinträge für das laufende Jahr
      const currentYear = new Date().getFullYear()
      const startOfYear = new Date(currentYear, 0, 1)
      const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59)

      const timeEntries = await prisma.timeEntry.findMany({
        where: {
          employeeId: employee.id,
          date: {
            gte: startOfYear,
            lte: endOfYear,
          },
        },
        orderBy: {
          date: 'asc',
        },
      })

      // Gruppiere Einträge nach Datum
      const entriesByDate = new Map<string, typeof timeEntries>()
      
      for (const entry of timeEntries) {
        const dateKey = format(entry.date, 'yyyy-MM-dd')
        if (!entriesByDate.has(dateKey)) {
          entriesByDate.set(dateKey, [])
        }
        entriesByDate.get(dateKey)!.push(entry)
      }

      // Prüfe jedes Datum
      for (const [dateKey, dayEntries] of entriesByDate.entries()) {
        const date = parseISO(dateKey)
        
        // Filtere nur WORK-Einträge
        const workEntries = dayEntries.filter(e => e.entryType === 'WORK')
        
        // Prüfung: Fehlende Endzeiten
        for (const entry of workEntries) {
          if (!entry.endTime) {
            issues.push({
              id: `${employee.id}-${dateKey}-${entry.id}-missing-end-time`,
              employeeId: employee.id,
              employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
              date: dateKey,
              type: 'MISSING_END_TIME',
              message: `Block ohne Endzeit erfasst`,
              details: {
                entryId: entry.id,
              },
            })
          }
        }
        
        // Prüfung: Negative Arbeitszeiten
        for (const entry of workEntries) {
          if (entry.endTime && entry.endTime <= entry.startTime) {
            issues.push({
              id: `${employee.id}-${dateKey}-${entry.id}-negative-work-time`,
              employeeId: employee.id,
              employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
              date: dateKey,
              type: 'NEGATIVE_WORK_TIME',
              message: `Endzeit liegt vor oder gleich Startzeit`,
              details: {
                entryId: entry.id,
              },
            })
          }
        }
        
        // Prüfung: Überlappende Blöcke
        const entriesWithEndTime = workEntries.filter(e => e.endTime !== null)
        for (let i = 0; i < entriesWithEndTime.length; i++) {
          for (let j = i + 1; j < entriesWithEndTime.length; j++) {
            const entry1 = entriesWithEndTime[i]
            const entry2 = entriesWithEndTime[j]
            
            // Prüfe ob die Blöcke überlappen
            if (entry1.endTime && entry2.endTime) {
              if (entry1.startTime < entry2.endTime && entry2.startTime < entry1.endTime) {
                issues.push({
                  id: `${employee.id}-${dateKey}-${entry1.id}-${entry2.id}-overlapping`,
                  employeeId: employee.id,
                  employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
                  date: dateKey,
                  type: 'OVERLAPPING_BLOCKS',
                  message: `Zwei Blöcke überschneiden sich zeitlich`,
                  details: {
                    entry1Id: entry1.id,
                    entry2Id: entry2.id,
                  },
                })
                // Nur einmal melden pro Paar
                break
              }
            }
          }
        }
        
        // Filtere nur WORK-Einträge mit Endzeit für weitere Prüfungen
        const workEntriesWithEndTime = workEntries.filter(e => e.endTime !== null)

        // Prüfung 1: Mehr als 4 Blöcke pro Tag
        if (workEntriesWithEndTime.length > 4) {
          issues.push({
            id: `${employee.id}-${dateKey}-too-many-blocks`,
            employeeId: employee.id,
            employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
            date: dateKey,
            type: 'TOO_MANY_BLOCKS',
            message: `Mehr als 4 Blöcke erfasst (${workEntriesWithEndTime.length} Blöcke)`,
            details: {
              blockCount: workEntries.length,
            },
          })
        }

        // Prüfung 2: Mehr als 10 Stunden Arbeitszeit pro Tag
        // Berechne Gesamtarbeitszeit für den Tag
        let totalWorkHours = 0
        
        // Normale Arbeitszeit
        for (const entry of workEntriesWithEndTime) {
          if (entry.endTime) {
            totalWorkHours += calculateWorkHours(entry.startTime, entry.endTime, entry.breakMinutes)
          }
        }

        // Bei Nachtdienst: Addiere auch Stunden vom Folgetag (06:01-Block)
        // Prüfe ob es ein Nachtdienst ist (19:00-23:00 Block vorhanden)
        const hasNightShiftStart = workEntriesWithEndTime.some(e => {
          if (!e.endTime) return false
          const startTime = format(parseISO(e.startTime.toISOString()), 'HH:mm')
          const endTime = format(parseISO(e.endTime.toISOString()), 'HH:mm')
          return startTime === '19:00' && endTime === '23:00'
        })

        if (hasNightShiftStart) {
          // Lade Einträge vom Folgetag
          const nextDay = new Date(date)
          nextDay.setDate(nextDay.getDate() + 1)
          const nextDayEntries = timeEntries.filter(e => isSameDay(e.date, nextDay))
          
          // Addiere Stunden vom Folgetag (06:01-Block)
          for (const entry of nextDayEntries) {
            if (entry.endTime && entry.entryType === 'WORK') {
              const startTime = format(parseISO(entry.startTime.toISOString()), 'HH:mm')
              if (startTime === '06:01' || startTime.startsWith('06:01')) {
                totalWorkHours += calculateWorkHours(entry.startTime, entry.endTime, entry.breakMinutes)
              }
            }
          }

          // Prüfung 3: Bei Nachtdienst: Mehr als 3h Schlafunterbrechung
          const sleepInterruptionEntry = nextDayEntries.find(e => e.entryType === 'SLEEP_INTERRUPTION')
          if (sleepInterruptionEntry && sleepInterruptionEntry.sleepInterruptionMinutes) {
            const interruptionHours = sleepInterruptionEntry.sleepInterruptionMinutes / 60
            if (interruptionHours > 3) {
              issues.push({
                id: `${employee.id}-${dateKey}-too-much-sleep-interruption`,
                employeeId: employee.id,
                employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
                date: dateKey,
                type: 'TOO_MUCH_SLEEP_INTERRUPTION',
                message: `Mehr als 3h Schlafunterbrechung bei Nachtdienst (${interruptionHours.toFixed(2)}h)`,
                details: {
                  interruptionHours,
                },
              })
            }
          }
        }

        // Prüfung 2: Mehr als 10 Stunden Arbeitszeit
        if (totalWorkHours > 10) {
          issues.push({
            id: `${employee.id}-${dateKey}-too-many-hours`,
            employeeId: employee.id,
            employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
            date: dateKey,
            type: 'TOO_MANY_HOURS',
            message: `Mehr als 10 Stunden Arbeitszeit (${totalWorkHours.toFixed(2)}h)`,
            details: {
              totalHours: totalWorkHours,
            },
          })
        }
      }
    }

    return NextResponse.json(issues)
  } catch (error) {
    console.error('Error fetching plausibility checks:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

