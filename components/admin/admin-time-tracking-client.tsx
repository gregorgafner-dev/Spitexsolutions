'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDaysInMonth, isSameMonth, isSameDay, addMonths, subMonths, addDays, getDay } from 'date-fns'
import { de } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { AlertCircle, Clock, Plus, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { LogoSmall } from '@/components/logo-small'

interface TimeEntry {
  id: string
  date: string
  startTime: string
  endTime: string | null
  breakMinutes: number
  surchargeHours: number
  entryType: string // WORK, SICK, TRAINING, SLEEP, SLEEP_INTERRUPTION
  sleepInterruptionMinutes?: number
  createdAt: string
}

interface WorkBlock {
  id: string
  startTime: string
  endTime: string | null
  entryType: string // WORK, SICK, TRAINING
}

interface Employee {
  id: string
  user: {
    firstName: string
    lastName: string
  }
}

interface AdminTimeTrackingClientProps {
  employees: Employee[]
}

export default function AdminTimeTrackingClient({ employees }: AdminTimeTrackingClientProps) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('')
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today
  })
  const [workBlocks, setWorkBlocks] = useState<WorkBlock[]>([])
  const [error, setError] = useState('')
  const [isNightShift, setIsNightShift] = useState(false)
  const [sleepInterruptions, setSleepInterruptions] = useState({ hours: 0, minutes: 0 })

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const daysInMonth = getDaysInMonth(currentMonth)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  
  // Berechne Leerzellen am Anfang (damit der erste Tag unter dem richtigen Wochentag steht)
  // getDay() gibt 0 für Sonntag, 1 für Montag, etc. zurück
  // Wir wollen Montag = 0, also verschieben wir: (getDay() + 6) % 7
  const firstDayOfWeek = (getDay(monthStart) + 6) % 7 // 0 = Montag, 6 = Sonntag
  const emptyCells = Array(firstDayOfWeek).fill(null)

  useEffect(() => {
    if (selectedEmployeeId) {
      loadEntriesForMonth()
    }
  }, [currentMonth, selectedEmployeeId])

  useEffect(() => {
    if (selectedDate && selectedEmployeeId) {
      console.log('selectedDate changed:', selectedDate)
      const dateCopy = new Date(selectedDate)
      dateCopy.setHours(0, 0, 0, 0)
      loadEntriesForDate(dateCopy)
    }
  }, [selectedDate, selectedEmployeeId])

  const loadEntriesForMonth = async () => {
    if (!selectedEmployeeId) return
    try {
      const start = format(monthStart, 'yyyy-MM-dd')
      const end = format(monthEnd, 'yyyy-MM-dd')
      // Verwende Admin-API mit employeeId als Query-Parameter
      const response = await fetch(`/api/admin/time-entries?employeeId=${selectedEmployeeId}&startDate=${start}&endDate=${end}`)
      if (response.ok) {
        const data = await response.json()
        // Debug: Prüfe ob Schlafunterbrechungen geladen wurden
        const sleepInterruptions = data.filter((e: TimeEntry) => e.entryType === 'SLEEP_INTERRUPTION')
        if (sleepInterruptions.length > 0) {
          console.log('Admin: loadEntriesForMonth - Gefundene Schlafunterbrechungen', {
            count: sleepInterruptions.length,
            interruptions: sleepInterruptions.map((e: TimeEntry) => ({
              id: e.id,
              date: e.date,
              sleepInterruptionMinutes: e.sleepInterruptionMinutes
            }))
          })
        }
        setEntries(data)
      }
    } catch (error) {
      console.error('Fehler beim Laden der Einträge:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadEntriesForDate = async (date: Date) => {
    if (!selectedEmployeeId) return
    try {
      const dateStr = format(date, 'yyyy-MM-dd')
      const nextDate = addDays(date, 1)
      const nextDateStr = format(nextDate, 'yyyy-MM-dd')
      
      // WICHTIG: Alle Nachtdienst-Einträge werden am Startdatum gebucht
      // Lade nur Einträge vom aktuellen Tag
      const response = await fetch(`/api/admin/time-entries?employeeId=${selectedEmployeeId}&date=${dateStr}`)
      
      const data = response.ok ? await response.json() : []
      
      
      // Konvertiere vollständige Einträge (mit endTime) in WorkBlocks - inkl. SLEEP-Einträge für Löschmöglichkeit
      const blocks: WorkBlock[] = data
        .filter((entry: TimeEntry) => entry.endTime !== null)
        .map((entry: TimeEntry) => ({
          id: entry.id,
          startTime: format(parseISO(entry.startTime), 'HH:mm'),
          endTime: entry.endTime ? format(parseISO(entry.endTime), 'HH:mm') : null,
          entryType: entry.entryType || 'WORK',
        }))

      // Erkenne Nachtdienst-Startblock am aktuellen Tag (starkes Signal: Endzeit 23:00)
      // (Nur für optimierte Nachlade-Strategien; die Zuordnung alter Split-Einträge erfolgt unabhängig davon)
      const hasNightShiftStartBlock = data.some((e: TimeEntry) => {
        if (e.entryType !== 'WORK' || !e.endTime) return false
        const et = parseISO(e.endTime)
        return et.getHours() === 23 && et.getMinutes() === 0
      })

      // Fallback für alte, gesplittete Nachtdienst-Daten:
      // 06:01 / 00:00-06:00 / Unterbrechung waren auf dem Folgetag gebucht.
      // Diese hängen wir für Anzeige/Löschbarkeit an den Starttag an (nur wenn entry.date == startTime-Kalendertag).
      let nextDayEntries: TimeEntry[] = []
      // Zuverlässig: Folgetag immer kurz nachladen, damit alte Split-Einträge (00:00-06:00, 06:01, Unterbrechung)
      // unabhängig vom Monats-State verfügbar sind.
      try {
        const nextResponse = await fetch(`/api/admin/time-entries?employeeId=${selectedEmployeeId}&date=${nextDateStr}`)
        nextDayEntries = nextResponse.ok ? await nextResponse.json() : []
      } catch {
        nextDayEntries = []
      }

      // Fallback (z.B. wenn API-Call fehlschlägt): nutze den bereits geladenen Monats-State
      if (nextDayEntries.length === 0) {
        nextDayEntries = entries.filter(e => {
          const entryDate = new Date(e.date)
          return isSameDay(entryDate, nextDate)
        })
      }

      const oldSplitCarryOverBlocks: WorkBlock[] = nextDayEntries
        .filter((e: TimeEntry) => {
          const entryDate = parseISO(e.date)
          const startIso = parseISO(e.startTime)
          if (!isSameDay(entryDate, startIso)) return false
          if (e.entryType === 'WORK' && e.endTime) {
            const st = parseISO(e.startTime)
            return st.getHours() === 6 && st.getMinutes() === 1
          }
          if (e.entryType === 'SLEEP' && e.endTime) {
            const st = parseISO(e.startTime)
            const et = parseISO(e.endTime)
            // Schlaf 00:00-06:00 (Ende kann in Ausnahmefällen abweichen, daher <= 07:00 tolerant)
            return st.getHours() === 0 && st.getMinutes() === 0 && et.getHours() <= 7
          }
          if (e.entryType === 'SLEEP_INTERRUPTION') return true
          return false
        })
        .map((e: TimeEntry) => ({
          id: e.id,
          startTime: format(parseISO(e.startTime), 'HH:mm'),
          endTime: e.endTime ? format(parseISO(e.endTime), 'HH:mm') : null,
          entryType: e.entryType || 'WORK',
        }))
      
      
      console.log('Admin: Geladene Blöcke', { 
        blocksCount: blocks.length,
        blocks 
      })
      
      const allBlocksForDetection = [...blocks, ...oldSplitCarryOverBlocks]

      // Prüfe ob es ein Nachtdienst ist (19:00-23:00 und 06:01-07:xx vorhanden)
      // Nur wenn beide typischen Nachtdienst-Blöcke vorhanden sind (SLEEP-Einträge ignorieren)
      // Erkenne auch abweichende Zeiten: Block mit Startzeit 19:xx (oder früher, aber nicht 06:01) und Block mit Startzeit 06:01
      const workBlocksOnly = allBlocksForDetection.filter(b => b.entryType !== 'SLEEP' && b.entryType !== 'SLEEP_INTERRUPTION')
      const hasBlock1 = workBlocksOnly.some(b => {
        const startTime = b.startTime
        // Block, der nicht mit 06:01 beginnt und eine Startzeit von 19:xx oder früher hat
        return !startTime.startsWith('06:01') && (startTime.startsWith('19:') || startTime.localeCompare('19:00') < 0)
      })
      const hasBlock2 = workBlocksOnly.some(b => b.startTime.startsWith('06:01'))
      const hasNightShift = hasBlock1 && hasBlock2
      
      // Setze isNightShift basierend auf geladenen Einträgen
      // Nur wenn beide Nachtdienst-Blöcke vorhanden sind
      setIsNightShift(hasNightShift)
      
      // Setze workBlocks - WICHTIG: Für Admins immer ALLE Blöcke anzeigen, damit sie gelöscht werden können
      // Bei Nachtdienst: Sortiere die Work-Blöcke so, dass der erste Block (19:00-23:00) vor dem zweiten (06:01-07:xx) kommt
      let sortedBlocks = [...blocks, ...oldSplitCarryOverBlocks]
      if (hasNightShift && workBlocksOnly.length >= 2) {
        sortedBlocks = sortedBlocks.sort((a, b) => {
          // SLEEP-Einträge bleiben am Ende
          if (a.entryType === 'SLEEP' || a.entryType === 'SLEEP_INTERRUPTION') return 1
          if (b.entryType === 'SLEEP' || b.entryType === 'SLEEP_INTERRUPTION') return -1
          
          // Erster Block: Startzeit beginnt mit 19: (oder früher, aber nicht 06:01)
          // Zweiter Block: Startzeit beginnt mit 06:01
          const aIsSecondBlock = a.startTime.startsWith('06:01')
          const bIsSecondBlock = b.startTime.startsWith('06:01')
          
          if (aIsSecondBlock && !bIsSecondBlock) return 1
          if (!aIsSecondBlock && bIsSecondBlock) return -1
          
          // Beide sind erste Blöcke oder beide sind zweite Blöcke - nach Startzeit sortieren
          return a.startTime.localeCompare(b.startTime)
        })
      }
      
      
      setWorkBlocks(sortedBlocks)
      
      // Lade Unterbrechungen während des Schlafens
      // WICHTIG: Unterbrechungen werden am Startdatum gebucht
      if (hasNightShift) {
        // Versuche zuerst aus den aktuell geladenen Daten (data) zu laden
        let sleepInterruptionEntry = data.find((e: TimeEntry) => 
          e.entryType === 'SLEEP_INTERRUPTION'
        )
        
        // Falls nicht gefunden, prüfe auch im entries State (falls loadEntriesForMonth bereits geladen hat)
        if (!sleepInterruptionEntry) {
          const entriesForDate = entries.filter(entry => {
            const entryDate = new Date(entry.date)
            return isSameDay(entryDate, date) && entry.entryType === 'SLEEP_INTERRUPTION'
          })
          sleepInterruptionEntry = entriesForDate[0] || null
        }

        // Fallback: alte Split-Daten -> Unterbrechung kann auf dem Folgetag gebucht sein
        if (!sleepInterruptionEntry) {
          const nextDayInterruption = nextDayEntries.find((e: TimeEntry) => {
            if (e.entryType !== 'SLEEP_INTERRUPTION') return false
            const entryDate = parseISO(e.date)
            const startIso = parseISO(e.startTime)
            return isSameDay(entryDate, startIso)
          })
          sleepInterruptionEntry = nextDayInterruption || null
        }
        
        console.log('Admin: Lade Schlafunterbrechung', {
          hasNightShift,
          dataLength: data.length,
          entriesLength: entries.length,
          sleepInterruptionEntry: sleepInterruptionEntry ? {
            id: sleepInterruptionEntry.id,
            sleepInterruptionMinutes: sleepInterruptionEntry.sleepInterruptionMinutes
          } : null,
          allSLEEP_INTERRUPTION: data.filter((e: TimeEntry) => e.entryType === 'SLEEP_INTERRUPTION').map((e: TimeEntry) => ({
            id: e.id,
            sleepInterruptionMinutes: e.sleepInterruptionMinutes
          }))
        })
        
        if (sleepInterruptionEntry && sleepInterruptionEntry.sleepInterruptionMinutes && sleepInterruptionEntry.sleepInterruptionMinutes > 0) {
          const totalMinutes = sleepInterruptionEntry.sleepInterruptionMinutes
          const interruptionHours = Math.floor(totalMinutes / 60)
          const interruptionMinutes = totalMinutes % 60
          
          console.log('Admin: Setze Schlafunterbrechung State', {
            totalMinutes,
            interruptionHours,
            interruptionMinutes
          })
          
          setSleepInterruptions({
            hours: interruptionHours,
            minutes: interruptionMinutes
          })
        } else {
          console.log('Admin: Keine Schlafunterbrechung gefunden, setze auf 0')
          setSleepInterruptions({ hours: 0, minutes: 0 })
        }
      } else {
        setSleepInterruptions({ hours: 0, minutes: 0 })
      }
    } catch (error) {
      console.error('Fehler beim Laden der Einträge:', error)
    }
  }

  const getEntriesForDate = (date: Date) => {
    const filtered = entries.filter(entry => {
      const entryDate = new Date(entry.date)
      return isSameDay(entryDate, date)
    })
    // Debug: Log für Schlafunterbrechung
    const sleepInterruption = filtered.find(e => e.entryType === 'SLEEP_INTERRUPTION')
    if (sleepInterruption) {
      console.log('Admin: getEntriesForDate - Gefundene Schlafunterbrechung', {
        date: date.toISOString().split('T')[0],
        sleepInterruptionMinutes: sleepInterruption.sleepInterruptionMinutes,
        allEntriesCount: filtered.length,
        entryTypes: filtered.map(e => e.entryType)
      })
    }
    return filtered
  }

  // Altes Nachtdienst-Modell (historische Daten): Einträge wurden auf dem "echten" Kalendertag gebucht,
  // d.h. entry.date == startTime-Kalendertag. Im neuen Modell ist entry.date das Startdatum, startTime kann am Folgetag liegen.
  const isOldSplitEntry = (e: TimeEntry): boolean => {
    const entryDate = parseISO(e.date)
    const startIso = parseISO(e.startTime)
    return isSameDay(entryDate, startIso)
  }

  const getOldSplitCarryOverEntriesForStartDate = (date: Date) => {
    const nextDay = addDays(date, 1)

    const nextDayEntries = getEntriesForDate(nextDay).filter(isOldSplitEntry)

    const work0601 = nextDayEntries.filter(e => {
      if (e.entryType !== 'WORK' || !e.endTime) return false
      const st = parseISO(e.startTime)
      return st.getHours() === 6 && st.getMinutes() === 1
    })

    const sleep00 = nextDayEntries.filter(e => {
      if (e.entryType !== 'SLEEP' || !e.endTime) return false
      const st = parseISO(e.startTime)
      const et = parseISO(e.endTime)
      return st.getHours() === 0 && st.getMinutes() === 0 && et.getHours() === 6 && et.getMinutes() === 0
    })

    const interruption = nextDayEntries.find(e => e.entryType === 'SLEEP_INTERRUPTION') ?? null

    return { work0601, sleep00, interruption }
  }

  const getNightShiftSleepEntriesForStartDate = (date: Date): TimeEntry[] => {
    const dayEntries = getEntriesForDate(date)
    const carry = getOldSplitCarryOverEntriesForStartDate(date)

    const sleepEntries = dayEntries.filter(e => e.entryType === 'SLEEP' && e.endTime !== null)
    const fromDay = sleepEntries.filter(e => {
      const st = parseISO(e.startTime)
      // 23:01 gehört immer zum Startdatum
      if (st.getHours() === 23 && st.getMinutes() === 1) return true
      // 00:00-06:00 gehört zum Startdatum nur im neuen Modell (date != startTime day)
      if (st.getHours() === 0 && st.getMinutes() === 0) return !isOldSplitEntry(e)
      return false
    })

    return [...fromDay, ...carry.sleep00]
  }

  const getNightShiftInterruptionEntryForStartDate = (date: Date): TimeEntry | null => {
    const dayEntries = getEntriesForDate(date)
    // Neues Modell: Unterbrechungen sind am Startdatum gebucht (date != startTime day)
    const current = dayEntries.find(e => e.entryType === 'SLEEP_INTERRUPTION' && !isOldSplitEntry(e))
    if (current) return current
    // Fallback: alte Daten -> Unterbrechung am Folgetag
    return getOldSplitCarryOverEntriesForStartDate(date).interruption
  }

  const getNightShiftWorkEntriesForStartDate = (date: Date): TimeEntry[] => {
    const dayEntries = getEntriesForDate(date)
    const carry = getOldSplitCarryOverEntriesForStartDate(date)

    const workEntries = dayEntries.filter(e => e.entryType !== 'SLEEP' && e.entryType !== 'SLEEP_INTERRUPTION' && e.endTime !== null)
    const filtered = workEntries.filter(e => {
      // Alte Daten: 06:01 am gleichen Tag gehört zum Vortag-Nachtdienst -> nicht dem Startdatum
      if (e.entryType !== 'WORK') return true
      const st = parseISO(e.startTime)
      if (st.getHours() === 6 && st.getMinutes() === 1 && isOldSplitEntry(e)) {
        return false
      }
      return true
    })

    return [...filtered, ...carry.work0601]
  }

  const getSleepHoursForDate = (date: Date) => {
    const dayEntries = getNightShiftSleepEntriesForStartDate(date)
    const sleepHours = dayEntries.reduce((total, entry) => {
      if (entry.endTime) {
        const start = parseISO(entry.startTime)
        const end = parseISO(entry.endTime)
        const diffMs = end.getTime() - start.getTime()
        const diffMinutes = diffMs / (1000 * 60)
        return total + diffMinutes / 60
      }
      return total
    }, 0)
    
    // Subtrahiere Unterbrechungen während des Schlafens
    // WICHTIG: Unterbrechungen werden am Startdatum gebucht (Schlafenszeit 00:00-06:00)
    const hasNightSleep = dayEntries.some(e => {
      if (!e.endTime) return false
      const startTime = format(parseISO(e.startTime), 'HH:mm')
      return startTime === '00:00'
    })
    
    if (hasNightSleep) {
      // Für die Schlafenszeit 00:00-06:00: Unterbrechungen vom gleichen Tag abziehen
      const interruptionEntry = getNightShiftInterruptionEntryForStartDate(date)
      const interruptionMinutes = interruptionEntry?.sleepInterruptionMinutes || 0
      const interruptionHours = interruptionMinutes / 60
      const adjustedSleepHours = Math.max(0, sleepHours - interruptionHours)
      
      
      return adjustedSleepHours
    }
    
    return sleepHours
  }

  const getSleepInterruptionHoursForDate = (date: Date) => {
    // WICHTIG: Unterbrechungen werden am Startdatum gebucht (Schlafenszeit 00:00-06:00)
    const interruptionEntry = getNightShiftInterruptionEntryForStartDate(date)
    return (interruptionEntry?.sleepInterruptionMinutes || 0) / 60
  }

  const getTotalHoursForDate = (date: Date) => {
    const dayEntries = getNightShiftWorkEntriesForStartDate(date)
    const workHours = dayEntries.reduce((total, entry) => {
      if (entry.endTime) {
        const start = parseISO(entry.startTime)
        const end = parseISO(entry.endTime)
        const diffMs = end.getTime() - start.getTime()
        const diffMinutes = diffMs / (1000 * 60)
        return total + (diffMinutes - entry.breakMinutes) / 60
      }
      return total
    }, 0)
    
    // Addiere Unterbrechungen während des Schlafens zur Arbeitszeit
    // WICHTIG: Unterbrechungen werden am Startdatum gebucht
    const interruptionEntry = getNightShiftInterruptionEntryForStartDate(date)
    const interruptionMinutes = interruptionEntry?.sleepInterruptionMinutes || 0
    const interruptionHours = interruptionMinutes / 60
    
    
    return workHours + interruptionHours
  }

  const getSurchargeHoursForDate = (date: Date) => {
    const dayEntries = getEntriesForDate(date).filter(e => e.endTime !== null)
    return dayEntries.reduce((total, entry) => {
      return total + (entry.surchargeHours || 0)
    }, 0)
  }

  const addWorkBlock = () => {
    const newBlock: WorkBlock = {
      id: `new-${Date.now()}`,
      startTime: '',
      endTime: null,
      entryType: 'WORK', // Standard: Normale Arbeitszeiterfassung
    }
    setWorkBlocks([...workBlocks, newBlock])
  }

  const removeWorkBlock = (id: string) => {
    setWorkBlocks(workBlocks.filter(block => block.id !== id))
  }

  const deleteTimeEntry = async (entryId: string) => {
    // Finde den Block, der gelöscht werden soll
    const blockToDelete = workBlocks.find(b => b.id === entryId)
    const isNightShiftBlock = blockToDelete && (
      (blockToDelete.startTime === '19:00' && blockToDelete.endTime === '23:00') ||
      (blockToDelete.startTime === '06:01')
    )
    
    const confirmMessage = isNightShiftBlock && isNightShift
      ? 'Möchten Sie diesen Nachtdienst wirklich löschen? Beide Blöcke (19:00-23:00 und 06:01-07:xx) werden gelöscht.'
      : 'Möchten Sie diesen Eintrag wirklich löschen?'
    
    if (!confirm(confirmMessage)) {
      return
    }

    try {
      const response = await fetch(`/api/admin/time-entries/${entryId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        setError(errorData.error || 'Fehler beim Löschen des Eintrags')
        return
      }

      // Lade Einträge neu - wichtig: zuerst loadEntriesForDate, dann loadEntriesForMonth
      // damit isNightShift korrekt aktualisiert wird
      await loadEntriesForDate(selectedDate)
      await loadEntriesForMonth()
      setError('')
    } catch (error) {
      console.error('Fehler beim Löschen:', error)
      setError('Ein Fehler ist aufgetreten')
    }
  }

  const calculateBlockHours = (startTime: string, endTime: string | null, blockIndex: number = 0): number => {
    if (!startTime || !endTime) return 0
    
    // Bei Nachtdienst: Erster Block endet immer um 23:00
    if (isNightShift && blockIndex === 0) {
      const start = new Date(`2000-01-01T${startTime}:00`)
      const end = new Date(`2000-01-01T23:00:00`)
      const diffMs = end.getTime() - start.getTime()
      return diffMs / (1000 * 60 * 60)
    }
    
    // Bei Nachtdienst: Zweiter Block startet immer um 06:01
    if (isNightShift && blockIndex === 1) {
      const start = new Date(`2000-01-01T06:01:00`)
      const end = new Date(`2000-01-01T${endTime}:00`)
      const diffMs = end.getTime() - start.getTime()
      return diffMs / (1000 * 60 * 60)
    }
    
    const start = new Date(`2000-01-01T${startTime}:00`)
    const end = new Date(`2000-01-01T${endTime}:00`)
    // Wenn Endzeit vor Startzeit, dann ist es am nächsten Tag
    if (end <= start) {
      const nextDay = new Date(end)
      nextDay.setDate(nextDay.getDate() + 1)
      const diffMs = nextDay.getTime() - start.getTime()
      return diffMs / (1000 * 60 * 60)
    }
    const diffMs = end.getTime() - start.getTime()
    return diffMs / (1000 * 60 * 60)
  }

  const calculateBreakMinutes = (endTime: string, nextStartTime: string): number => {
    if (!endTime || !nextStartTime) return 0
    const end = new Date(`2000-01-01T${endTime}:00`)
    const nextStart = new Date(`2000-01-01T${nextStartTime}:00`)
    // Wenn nächster Start vor Ende, dann ist es am nächsten Tag
    if (nextStart <= end) {
      const nextDay = new Date(nextStart)
      nextDay.setDate(nextDay.getDate() + 1)
      const diffMs = nextDay.getTime() - end.getTime()
      return diffMs / (1000 * 60)
    }
    const diffMs = nextStart.getTime() - end.getTime()
    return diffMs / (1000 * 60)
  }

  const calculateTotalWorkHours = (blocks: WorkBlock[]): number => {
    return blocks
      .filter(b => b.startTime && b.endTime)
      .reduce((total, block) => {
        return total + calculateBlockHours(block.startTime, block.endTime)
      }, 0)
  }

  const updateWorkBlock = (id: string, field: keyof WorkBlock, value: string) => {
    setWorkBlocks(workBlocks.map(block => 
      block.id === id ? { ...block, [field]: value } : block
    ))
  }

  const handleSave = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault()
    }
    setError('')
    
    const dateStr = format(selectedDate, 'yyyy-MM-dd')
    
    // Hilfsfunktion: Prüft ob ein Block ein Nachtdienst-Block ist
    const isNightShiftBlock = (block: WorkBlock): boolean => {
      // Erster Nachtdienst-Block: Startzeit 19:xx (oder früher, aber nicht 06:01) UND Endzeit 23:00
      const isFirstNightBlock = !block.startTime.startsWith('06:01') && 
                                (block.startTime.startsWith('19:') || block.startTime.localeCompare('19:00') < 0) &&
                                block.endTime === '23:00'
      // Zweiter Nachtdienst-Block: Startzeit 06:01
      const isSecondNightBlock = block.startTime.startsWith('06:01')
      return isFirstNightBlock || isSecondNightBlock
    }

    // Verwende die gefilterten Blöcke für die Anzeige, aber alle Blöcke für das Speichern
    // SLEEP-Einträge werden nie gespeichert (werden automatisch erstellt)
    // Wenn Nachtdienst aktiviert ist, können sowohl Nachtdienst-Blöcke als auch normale Blöcke gespeichert werden
    let blocksToSave = workBlocks.filter(block => {
      // Keine SLEEP-Einträge speichern (werden automatisch erstellt)
      if (block.entryType === 'SLEEP' || block.entryType === 'SLEEP_INTERRUPTION') return false
      // Wenn Nachtdienst nicht aktiviert, speichere nur normale Blöcke (keine Nachtdienst-Blöcke)
      if (!isNightShift && isNightShiftBlock(block)) return false
      return true
    })
    
    // Bei Nachtdienst: Stelle sicher, dass blocksToSave korrekt sortiert ist (erster Block vor zweitem Block)
    if (isNightShift && blocksToSave.length >= 2) {
      blocksToSave = [...blocksToSave].sort((a, b) => {
        const aIsSecondBlock = a.startTime.startsWith('06:01')
        const bIsSecondBlock = b.startTime.startsWith('06:01')
        if (aIsSecondBlock && !bIsSecondBlock) return 1
        if (!aIsSecondBlock && bIsSecondBlock) return -1
        return a.startTime.localeCompare(b.startTime)
      })
    }
    
    console.log('handleSave called', { isNightShift, workBlocks, blocksToSave, sleepInterruptions })

    // Bei Nachtdienst: Speichere Standard-Zeiten wenn keine Abweichungen
    if (isNightShift) {
      // Prüfe ob Abweichungen vorhanden sind (nur für Nachtdienst-Blöcke)
      const nightShiftBlocks = blocksToSave.filter(block => isNightShiftBlock(block))
      const hasDeviations = nightShiftBlocks.some(block => {
        // Erster Block: Startzeit kann abweichen (aber Endzeit ist immer 23:00)
        if (block.startTime && block.startTime !== '19:00' && block.endTime === '23:00') return true
        // Zweiter Block: Endzeit kann abweichen (aber Startzeit ist immer 06:01)
        if (block.startTime === '06:01' && block.endTime && block.endTime !== '07:00') return true
        return false
      })

      // Prüfe auch auf Unterbrechungen
      const hasInterruptions = sleepInterruptions.hours > 0 || sleepInterruptions.minutes > 0

      // Wenn keine Abweichungen und keine Unterbrechungen, speichere Standard-Zeiten für Nachtdienst
      // Normale Blöcke werden separat gespeichert
      if (!hasDeviations && !hasInterruptions && nightShiftBlocks.length === 2) {
        // WICHTIG: Alle Nachtdienst-Einträge werden am Startdatum gebucht
        // Lösche nur bestehende Nachtdienst-Einträge für diesen Tag (inkl. alte Folgetag-Einträge für Migration)
        // Normale Einträge bleiben erhalten
        const existingEntries = entries.filter(e => {
          const entryDate = new Date(e.date)
          const isOnSelectedOrNextDay = isSameDay(entryDate, selectedDate) || isSameDay(entryDate, addDays(selectedDate, 1))
          if (!isOnSelectedOrNextDay) return false
          
          // Prüfe ob es ein Nachtdienst-Eintrag ist
          if (e.entryType === 'SLEEP' || e.entryType === 'SLEEP_INTERRUPTION') return true
          if (e.endTime) {
            const startTime = format(parseISO(e.startTime), 'HH:mm')
            const endTime = format(parseISO(e.endTime), 'HH:mm')
            const isNightBlock = (startTime.startsWith('19:') && endTime === '23:00') || startTime === '06:01'
            return isNightBlock
          }
          return false
        })

        for (const entry of existingEntries) {
          await fetch(`/api/admin/time-entries/${entry.id}`, {
            method: 'DELETE',
          })
        }

        // Speichere alle Standard-Zeiten am Startdatum
        // Block 1: 19:00-23:00
        await fetch('/api/admin/time-entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId: selectedEmployeeId,
            date: dateStr,
            startTime: new Date(`${dateStr}T19:00:00`).toISOString(),
            endTime: new Date(`${dateStr}T23:00:00`).toISOString(),
            breakMinutes: 0,
            entryType: 'WORK',
          }),
        })

        // SLEEP: 23:01-23:59
        await fetch('/api/admin/time-entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId: selectedEmployeeId,
            date: dateStr,
            startTime: new Date(`${dateStr}T23:01:00`).toISOString(),
            endTime: new Date(`${dateStr}T23:59:00`).toISOString(),
            breakMinutes: 0,
            entryType: 'SLEEP',
          }),
        })

        // SLEEP: 00:00-06:00 (am Startdatum)
        await fetch('/api/admin/time-entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId: selectedEmployeeId,
            date: dateStr,
            startTime: new Date(`${dateStr}T00:00:00`).toISOString(),
            endTime: new Date(`${dateStr}T06:00:00`).toISOString(),
            breakMinutes: 0,
            entryType: 'SLEEP',
          }),
        })

        // Block 2: 06:01-07:00 (am Startdatum)
        await fetch('/api/admin/time-entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId: selectedEmployeeId,
            date: dateStr,
            startTime: new Date(`${dateStr}T06:01:00`).toISOString(),
            endTime: new Date(`${dateStr}T07:00:00`).toISOString(),
            breakMinutes: 0,
            entryType: 'WORK',
          }),
        })

        // Speichere jetzt noch normale Blöcke (die nicht Nachtdienst-Blöcke sind)
        const normalBlocksToSave = blocksToSave.filter(block => !isNightShiftBlock(block))
        if (normalBlocksToSave.length > 0) {
          // Normale Blöcke werden im normalen Speicher-Flow weiter unten verarbeitet
          // Wir müssen hier nicht return machen, sondern weiter zum normalen Speicher-Flow
          console.log('Standard-Nachtdienst-Zeiten gespeichert, speichere noch normale Blöcke:', normalBlocksToSave.length)
          // Setze blocksToSave auf nur normale Blöcke für den weiteren Verarbeitungs-Flow
          blocksToSave = normalBlocksToSave
        } else {
          // Keine normalen Blöcke - fertig
          await loadEntriesForMonth()
          await loadEntriesForDate(selectedDate)
          setError('')
          console.log('Standard-Nachtdienst-Zeiten gespeichert (keine normalen Blöcke)')
          return
        }
      } else {
        // Abweichungen vorhanden - verarbeite alle Blöcke normal weiter
      }
    }
    
    if (blocksToSave.length === 0) {
      setError('Bitte fügen Sie mindestens einen Arbeitsblock hinzu')
      return
    }

    try {
      // WICHTIG: Alle Nachtdienst-Einträge werden am Startdatum gebucht
      // Lösche bestehende Einträge, die nicht in blocksToSave vorhanden sind
      // Unterscheide zwischen Nachtdienst-Einträgen und normalen Einträgen
      const existingEntries = entries.filter(e => {
        const entryDate = new Date(e.date)
        return isSameDay(entryDate, selectedDate) || isSameDay(entryDate, addDays(selectedDate, 1))
      })

      // Behalte nur die IDs, die in blocksToSave vorhanden sind
      const blockIds = blocksToSave.filter(b => !b.id.startsWith('new-')).map(b => b.id)
      
      // Lösche nur Einträge, die nicht in blocksToSave sind
      // Für Nachtdienst-Einträge: Prüfe auch auf SLEEP und SLEEP_INTERRUPTION
      const entriesToDelete = existingEntries.filter(e => {
        if (blockIds.includes(e.id)) return false // Behalte, wenn in blocksToSave
        
        // Für SLEEP_INTERRUPTION-Einträge: Lösche wenn keine Nachtdienst-Blöcke vorhanden sind
        // (unabhängig davon, ob isNightShift aktiv ist oder nicht)
        if (e.entryType === 'SLEEP_INTERRUPTION') {
          const hasNightBlocks = blocksToSave.some(b => isNightShiftBlock(b))
          // Lösche SLEEP_INTERRUPTION wenn kein Nachtdienst mehr vorhanden ist
          return !hasNightBlocks
        }
        
        // Für SLEEP-Einträge: Lösche wenn Nachtdienst aktiv, aber keine Nachtdienst-Blöcke vorhanden
        if (e.entryType === 'SLEEP') {
          if (isNightShift) {
            const hasNightBlocks = blocksToSave.some(b => isNightShiftBlock(b))
            return !hasNightBlocks // Lösche SLEEP-Einträge wenn kein Nachtdienst mehr
          }
          // Wenn isNightShift false ist, lösche SLEEP-Einträge auch (da sie nicht mehr benötigt werden)
          return true
        }
        
        // Für normale Einträge: Lösche wenn nicht in blocksToSave
        return true
      })

      for (const entry of entriesToDelete) {
        await fetch(`/api/admin/time-entries/${entry.id}`, {
          method: 'DELETE',
        })
      }

      // Prüfe Gesamtarbeitszeit und Pausen zwischen Blöcken
      // Nur für normale Blöcke (nicht für Nachtdienst-Blöcke)
      const normalBlocks = blocksToSave.filter(block => !isNightShiftBlock(block))
      if (normalBlocks.length > 0) {
        const totalHours = calculateTotalWorkHours(normalBlocks)
        if (totalHours > 6) {
          // Sortiere Blöcke nach Startzeit
          const sortedBlocks = [...normalBlocks]
            .filter(b => b.startTime && b.endTime)
            .sort((a, b) => a.startTime.localeCompare(b.startTime))

          // Prüfe Pausen zwischen aufeinanderfolgenden normalen Blöcken
          for (let i = 0; i < sortedBlocks.length - 1; i++) {
            const currentBlock = sortedBlocks[i]
            const nextBlock = sortedBlocks[i + 1]
            
            if (currentBlock.endTime && nextBlock.startTime) {
              const breakMins = calculateBreakMinutes(currentBlock.endTime, nextBlock.startTime)
              if (breakMins < 45) {
                const blockIndex1 = blocksToSave.findIndex(b => b.id === currentBlock.id) + 1
                const blockIndex2 = blocksToSave.findIndex(b => b.id === nextBlock.id) + 1
                setError(`Die Pause zwischen Block ${blockIndex1} und Block ${blockIndex2} beträgt nur ${breakMins} Minuten. Bei mehr als 6 Stunden Gesamtarbeitszeit ist eine verordnete Essenspause von mindestens 45 Minuten erforderlich.`)
                return
              }
            }
          }
        }
      }

      // Erstelle/aktualisiere Einträge
      // WICHTIG: Iteriere nur über blocksToSave (nicht über alle workBlocks)
      
      for (let i = 0; i < blocksToSave.length; i++) {
        const block = blocksToSave[i]
        
        
        if (!block.startTime) {
          setError('Bitte füllen Sie alle Startzeiten aus')
          return
        }

        // Bei Nachtdienst: Identifiziere Block-Typ basierend auf Startzeit, nicht Index
        // Nur echte Nachtdienst-Blöcke (nicht normale Blöcke)
        const isFirstBlock = isNightShift && !block.startTime.startsWith('06:01') && block.endTime === '23:00'
        const isSecondBlock = isNightShift && block.startTime.startsWith('06:01')
        
        // Bei Nachtdienst: Erster Block endet immer um 23:00, zweiter Block startet immer um 06:01
        const effectiveStartTime = isSecondBlock ? '06:01' : block.startTime
        const effectiveEndTime = isFirstBlock ? '23:00' : block.endTime
        
        
        // WICHTIG: Alle Nachtdienst-Einträge werden am Startdatum gebucht
        const blockDate = dateStr
        
        if (!effectiveEndTime) {
          setError('Bitte füllen Sie alle Endzeiten aus')
          return
        }

        const startDateTime = new Date(`${blockDate}T${effectiveStartTime}:00`)
        const endDateTime = new Date(`${blockDate}T${effectiveEndTime}:00`)

        // Wenn Endzeit vor Startzeit, dann ist es am nächsten Tag
        if (endDateTime <= startDateTime) {
          endDateTime.setDate(endDateTime.getDate() + 1)
        }

        // Prüfe 6-Stunden-Regel pro Block
        const diffMs = endDateTime.getTime() - startDateTime.getTime()
        const diffMinutes = diffMs / (1000 * 60)
        // 6 Stunden = 360 Minuten, prüfe ob mehr als 360 Minuten
        if (diffMinutes > 360) {
          setError(`Block ${blocksToSave.indexOf(block) + 1}: Zwischen Start und Ende dürfen maximal 6 Stunden liegen. Bitte teilen Sie die Arbeitszeit auf mehrere Blöcke auf.`)
          return
        }

        
        // Prüfe ob es ein bestehender Eintrag ist
        if (!block.id.startsWith('new-')) {
          // Bestehender Eintrag - aktualisiere
          const response = await fetch(`/api/admin/time-entries/${block.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              startTime: startDateTime.toISOString(),
              endTime: endDateTime.toISOString(),
              breakMinutes: 0,
              entryType: block.entryType || 'WORK',
            }),
          })
        } else {
          // Neuer Eintrag
          const response = await fetch('/api/admin/time-entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employeeId: selectedEmployeeId,
              date: blockDate,
              startTime: startDateTime.toISOString(),
              endTime: endDateTime.toISOString(),
              breakMinutes: 0,
              entryType: block.entryType || 'WORK',
            }),
          })
        }
      }

      // Bei Nachtdienst: Erstelle SLEEP-Einträge am Startdatum (23:01-23:59 und 00:00-06:00)
      if (isNightShift) {
        // Prüfe ob SLEEP-Einträge für aktuellen Tag bereits existieren
        const currentDaySleepEntries = entries.filter(e => {
          const entryDate = new Date(e.date)
          return isSameDay(entryDate, selectedDate) && e.entryType === 'SLEEP'
        })

        if (currentDaySleepEntries.length === 0) {
          // Erstelle SLEEP-Eintrag für aktuellen Tag (23:01-23:59:59 = 59 Minuten)
          await fetch('/api/admin/time-entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employeeId: selectedEmployeeId,
              date: dateStr,
              startTime: new Date(`${dateStr}T23:01:00`).toISOString(),
              endTime: new Date(`${dateStr}T23:59:59`).toISOString(),
              breakMinutes: 0,
              entryType: 'SLEEP',
            }),
          })
        }

        // WICHTIG: SLEEP-Einträge werden am Startdatum gebucht (00:00-06:00)
        // Prüfe ob SLEEP-Einträge für 00:00-06:00 bereits existieren
        const nightSleepEntries = entries.filter(e => {
          const entryDate = new Date(e.date)
          if (!isSameDay(entryDate, selectedDate) || e.entryType !== 'SLEEP') return false
          const startTime = format(parseISO(e.startTime), 'HH:mm')
          return startTime === '00:00'
        })

        if (nightSleepEntries.length === 0) {
          // Erstelle SLEEP-Eintrag für Startdatum (00:00-06:00)
          await fetch('/api/admin/time-entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employeeId: selectedEmployeeId,
              date: dateStr,
              startTime: new Date(`${dateStr}T00:00:00`).toISOString(),
              endTime: new Date(`${dateStr}T06:00:00`).toISOString(),
              breakMinutes: 0,
              entryType: 'SLEEP',
            }),
          })
        }

        // Speichere/aktualisiere Unterbrechungen während des Schlafens
        // WICHTIG: Unterbrechungen werden am Startdatum gebucht (Schlafenszeit 00:00-06:00)
        const totalInterruptionMinutes = sleepInterruptions.hours * 60 + sleepInterruptions.minutes
        
        console.log('Admin: Speichere Schlafunterbrechung', {
          sleepInterruptions,
          totalInterruptionMinutes,
          dateStr
        })
        
        // Lade aktuelle Einträge vom Tag, um nach bestehender Schlafunterbrechung zu suchen
        const currentDayEntriesResponse = await fetch(`/api/admin/time-entries?employeeId=${selectedEmployeeId}&date=${dateStr}`)
        const currentDayEntries = currentDayEntriesResponse.ok ? await currentDayEntriesResponse.json() : []
        const existingInterruption = currentDayEntries.find((e: TimeEntry) => 
          e.entryType === 'SLEEP_INTERRUPTION'
        )
        
        console.log('Admin: Suche nach bestehender Schlafunterbrechung', {
          currentDayEntriesLength: currentDayEntries.length,
          existingInterruption: existingInterruption ? {
            id: existingInterruption.id,
            sleepInterruptionMinutes: existingInterruption.sleepInterruptionMinutes
          } : null
        })
        
        if (totalInterruptionMinutes > 0) {
          if (existingInterruption) {
            // Aktualisiere bestehenden Eintrag
            console.log('Admin: Aktualisiere bestehende Schlafunterbrechung', {
              id: existingInterruption.id,
              totalInterruptionMinutes
            })
            const response = await fetch(`/api/admin/time-entries/${existingInterruption.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sleepInterruptionMinutes: totalInterruptionMinutes,
              }),
            })
            console.log('Admin: PATCH Response', { status: response.status, ok: response.ok })
          } else {
            // Erstelle neuen Eintrag für das Startdatum
            console.log('Admin: Erstelle neue Schlafunterbrechung', {
              totalInterruptionMinutes,
              dateStr
            })
            const response = await fetch('/api/admin/time-entries', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                employeeId: selectedEmployeeId,
                date: dateStr,
                startTime: new Date(`${dateStr}T00:00:00`).toISOString(),
                endTime: new Date(`${dateStr}T00:00:00`).toISOString(),
                breakMinutes: 0,
                entryType: 'SLEEP_INTERRUPTION',
                sleepInterruptionMinutes: totalInterruptionMinutes,
              }),
            })
            console.log('Admin: POST Response', { status: response.status, ok: response.ok })
            const createdEntry = await response.json()
            console.log('Admin: Erstellter Eintrag', createdEntry)
          }
        } else {
          // Lösche SLEEP_INTERRUPTION-Eintrag vom Startdatum falls vorhanden
          if (existingInterruption) {
            await fetch(`/api/admin/time-entries/${existingInterruption.id}`, {
              method: 'DELETE',
            })
          }
        }
      }

      // WICHTIG: Erst loadEntriesForMonth, dann loadEntriesForDate, damit entries State aktuell ist
      await loadEntriesForMonth()
      // Warte etwas länger, damit die Datenbank-Updates verarbeitet werden
      await new Promise(resolve => setTimeout(resolve, 300))
      await loadEntriesForDate(selectedDate)
      
      // Stelle sicher, dass Schlafunterbrechung korrekt geladen wird - lade nochmal explizit
      if (isNightShift) {
        const refreshResponse = await fetch(`/api/admin/time-entries?employeeId=${selectedEmployeeId}&date=${dateStr}`)
        const refreshData = refreshResponse.ok ? await refreshResponse.json() : []
        const refreshSleepInterruption = refreshData.find((e: TimeEntry) => e.entryType === 'SLEEP_INTERRUPTION')
        if (refreshSleepInterruption && refreshSleepInterruption.sleepInterruptionMinutes !== undefined && refreshSleepInterruption.sleepInterruptionMinutes !== null) {
          const totalMinutes = refreshSleepInterruption.sleepInterruptionMinutes || 0
          setSleepInterruptions({
            hours: Math.floor(totalMinutes / 60),
            minutes: totalMinutes % 60
          })
        } else {
          // Keine Schlafunterbrechung gefunden - setze auf 0
          setSleepInterruptions({ hours: 0, minutes: 0 })
        }
      }
      
      setError('')
    } catch (error) {
      setError('Ein Fehler ist aufgetreten')
      console.error(error)
    }
  }

  const addBlockWithCurrentTime = () => {
    const now = new Date()
    const timeStr = format(now, 'HH:mm')
    const newBlock: WorkBlock = {
      id: `new-${Date.now()}`,
      startTime: timeStr,
      endTime: null,
      entryType: 'WORK',
    }
    setWorkBlocks([...workBlocks, newBlock])
  }

  const previousMonth = () => setCurrentMonth(subMonths(currentMonth, 1))
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1))

  return (
    <div className="space-y-6">
      {/* Mitarbeiterauswahl */}
      <Card>
        <CardHeader>
          <CardTitle>Mitarbeiter auswählen</CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <Label htmlFor="employee-select">Mitarbeiter</Label>
            <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
              <SelectTrigger id="employee-select" className="w-full max-w-md">
                <SelectValue placeholder="Mitarbeiter auswählen" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.user.firstName} {employee.user.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {selectedEmployeeId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Kalender links */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Kalender</CardTitle>
                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="sm" onClick={previousMonth}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="font-medium min-w-[150px] text-center">
                    {format(currentMonth, 'MMMM yyyy', { locale: de })}
                  </span>
                  <Button variant="outline" size="sm" onClick={nextMonth}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(day => (
                  <div key={day} className="text-center text-sm font-medium text-gray-600 p-2">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {emptyCells.map((_, idx) => (
                  <div key={`empty-${idx}`} className="aspect-square" />
                ))}
                {days.map((day, idx) => {
                  const dayEntries = getEntriesForDate(day)
                  const totalHours = getTotalHoursForDate(day)
                  const surchargeHours = getSurchargeHoursForDate(day)
                  
                  // Normalisiere Daten für Vergleich
                  const dayNormalized = new Date(day)
                  dayNormalized.setHours(0, 0, 0, 0)
                  const selectedDateNormalized = new Date(selectedDate)
                  selectedDateNormalized.setHours(0, 0, 0, 0)
                  const todayNormalized = new Date()
                  todayNormalized.setHours(0, 0, 0, 0)
                  
                  const isSelected = isSameDay(dayNormalized, selectedDateNormalized)
                  const isToday = isSameDay(dayNormalized, todayNormalized)
                  const isCurrentMonth = isSameMonth(day, currentMonth)
                  // Admins können immer bearbeiten
                  const isEditable = true

                  const handleDayClick = (e: React.MouseEvent<HTMLButtonElement>) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const dayDate = new Date(day)
                    dayDate.setHours(0, 0, 0, 0)
                    console.log('Day clicked:', dayDate.toISOString(), 'Current selectedDate:', selectedDate.toISOString())
                    setSelectedDate(dayDate)
                  }

                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={handleDayClick}
                      className={`
                        aspect-square p-2 rounded-lg border-2 transition-all
                        ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}
                        ${isToday ? 'ring-2 ring-blue-300' : ''}
                        ${!isCurrentMonth ? 'opacity-30' : ''}
                        ${!isEditable ? 'opacity-50 bg-gray-100' : 'hover:border-blue-300'}
                        cursor-pointer
                      `}
                      title={format(day, 'EEEE, d. MMMM yyyy', { locale: de })}
                    >
                      <div className="text-sm font-medium mb-1">
                        {format(day, 'd')}
                      </div>
                      {dayEntries.length > 0 && (
                        <div className="text-xs">
                          <div className="text-gray-600">
                            {totalHours.toFixed(1)}h
                            {surchargeHours > 0 && (
                              <span className="text-blue-600 ml-0.5 font-medium">
                                (+{surchargeHours.toFixed(1)}h)
                              </span>
                            )}
                          </div>
                          {/* Zeige Schlafenszeit und Unterbrechungen nur wenn Nachtdienst-Einträge vorhanden */}
                          {(() => {
                            const sleepHours = getSleepHoursForDate(day)
                            const interruptionHours = getSleepInterruptionHoursForDate(day)
                            const hasSleepEntries = sleepHours > 0
                            if (hasSleepEntries || interruptionHours > 0) {
                              // Konvertiere Stunden in Stunden:Minuten Format für bessere Lesbarkeit
                              const sleepMinutes = Math.round(sleepHours * 60)
                              const sleepHoursDisplay = Math.floor(sleepMinutes / 60)
                              const sleepMinsDisplay = sleepMinutes % 60
                              const sleepDisplay = sleepHoursDisplay > 0 
                                ? `${sleepHoursDisplay}:${sleepMinsDisplay.toString().padStart(2, '0')}`
                                : `0:${sleepMinsDisplay.toString().padStart(2, '0')}`
                              
                              const interruptionMinutes = Math.round(interruptionHours * 60)
                              const interruptionHoursDisplay = Math.floor(interruptionMinutes / 60)
                              const interruptionMinsDisplay = interruptionMinutes % 60
                              const interruptionDisplay = interruptionHoursDisplay > 0
                                ? `${interruptionHoursDisplay}:${interruptionMinsDisplay.toString().padStart(2, '0')}`
                                : `0:${interruptionMinsDisplay.toString().padStart(2, '0')}`
                              
                              return (
                                <>
                                  {sleepHours > 0 && (
                                    <div className="text-purple-600 text-[10px] mt-0.5">
                                      Schlaf: {sleepDisplay}
                                    </div>
                                  )}
                                  {interruptionHours > 0 && (
                                    <div className="text-orange-600 text-[10px]">
                                      Unterbr.: {interruptionDisplay}
                                    </div>
                                  )}
                                </>
                              )
                            }
                            return null
                          })()}
                          {dayEntries.some(e => e.entryType === 'SICK') && (
                            <div className="text-red-600 font-medium mt-0.5">K</div>
                          )}
                          {dayEntries.some(e => e.entryType === 'VACATION') && (
                            <div className="text-blue-600 font-medium mt-0.5">F</div>
                          )}
                          {dayEntries.some(e => e.entryType === 'TRAINING') && (
                            <div className="text-green-600 font-medium mt-0.5">W</div>
                          )}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Zeiterfassung rechts */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Arbeitszeiterfassung</CardTitle>
                  <CardDescription>
                    {format(selectedDate, "EEEE, d. MMMM yyyy", { locale: de })}
                  </CardDescription>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="nightShift"
                    checked={isNightShift}
                    onCheckedChange={async (checked) => {
                      const newNightShiftState = checked === true
                      
                      if (newNightShiftState) {
                        // WICHTIG: Lade zuerst bereits gespeicherte Nachtdienst-Einträge vom Server
                        const dateStr = format(selectedDate, 'yyyy-MM-dd')
                        const nextDateStr = format(addDays(selectedDate, 1), 'yyyy-MM-dd')
                        
                        console.log('Admin: Lade Nachtdienst-Einträge für:', { dateStr, nextDateStr })
                        
                        const [currentResponse, nextResponse] = await Promise.all([
                          fetch(`/api/admin/time-entries?employeeId=${selectedEmployeeId}&date=${dateStr}`),
                          fetch(`/api/admin/time-entries?employeeId=${selectedEmployeeId}&date=${nextDateStr}`)
                        ])
                        
                        if (!currentResponse.ok) {
                          const errorText = await currentResponse.text()
                          console.error('Fehler beim Laden der Einträge für aktuellen Tag:', currentResponse.status, errorText)
                        }
                        if (!nextResponse.ok) {
                          const errorText = await nextResponse.text()
                          console.error('Fehler beim Laden der Einträge für Folgetag:', nextResponse.status, errorText)
                        }
                        
                        const currentData = currentResponse.ok ? await currentResponse.json() : []
                        const nextData = nextResponse.ok ? await nextResponse.json() : []
                        
                        console.log('Admin: Checkbox aktiviert - geladene Daten:', {
                          dateStr,
                          nextDateStr,
                          currentResponseOk: currentResponse.ok,
                          nextResponseOk: nextResponse.ok,
                          currentDataCount: currentData.length,
                          nextDataCount: nextData.length,
                          currentData: currentData.map((e: TimeEntry) => ({ id: e.id, date: e.date, startTime: e.startTime, endTime: e.endTime, entryType: e.entryType })),
                          nextData: nextData.map((e: TimeEntry) => ({ id: e.id, date: e.date, startTime: e.startTime, endTime: e.endTime, entryType: e.entryType }))
                        })
                        
                        // Konvertiere gespeicherte Einträge in WorkBlocks
                        const currentBlocks: WorkBlock[] = currentData
                          .filter((entry: TimeEntry) => entry.endTime !== null && entry.entryType !== 'SLEEP')
                          .map((entry: TimeEntry) => ({
                            id: entry.id,
                            startTime: format(parseISO(entry.startTime), 'HH:mm'),
                            endTime: entry.endTime ? format(parseISO(entry.endTime), 'HH:mm') : null,
                            entryType: entry.entryType || 'WORK',
                          }))
                        
                        const nextBlocks: WorkBlock[] = nextData
                          .filter((entry: TimeEntry) => {
                            if (entry.endTime === null || entry.entryType === 'SLEEP') return false
                            const startTime = format(parseISO(entry.startTime), 'HH:mm')
                            return startTime === '06:01'
                          })
                          .map((entry: TimeEntry) => ({
                            id: entry.id,
                            startTime: format(parseISO(entry.startTime), 'HH:mm'),
                            endTime: entry.endTime ? format(parseISO(entry.endTime), 'HH:mm') : null,
                            entryType: entry.entryType || 'WORK',
                          }))
                        
                        const allBlocks = [...currentBlocks, ...nextBlocks]
                        
                        // Prüfe ob bereits gespeicherte Nachtdienst-Blöcke vorhanden sind
                        // Verwende flexiblere Prüfung (startet mit 19:00 und endet mit 23:00, oder startet mit 06:01)
                        const hasBlock1 = allBlocks.some(b => {
                          const startMatch = b.startTime === '19:00' || (b.startTime && b.startTime.startsWith('19:'))
                          const endMatch = b.endTime === '23:00' || (b.endTime && b.endTime.startsWith('23:'))
                          return startMatch && endMatch
                        })
                        const hasBlock2 = allBlocks.some(b => {
                          return b.startTime === '06:01' || (b.startTime && b.startTime.startsWith('06:01'))
                        })
                        
                        console.log('Admin: Prüfe gespeicherte Nachtdienst-Blöcke:', {
                          allBlocksCount: allBlocks.length,
                          allBlocks: allBlocks.map(b => ({ id: b.id, startTime: b.startTime, endTime: b.endTime })),
                          hasBlock1,
                          hasBlock2
                        })
                        
                        if (hasBlock1 && hasBlock2) {
                          // Bereits gespeicherte Blöcke vorhanden - verwende diese
                          console.log('Admin: Verwende bereits gespeicherte Nachtdienst-Blöcke:', allBlocks)
                          setIsNightShift(true)
                          setWorkBlocks(allBlocks)
                        } else {
                          // Keine gespeicherten Blöcke - erstelle neue
                          console.log('Admin: Erstelle neue Nachtdienst-Blöcke (hasBlock1:', hasBlock1, 'hasBlock2:', hasBlock2, ')')
                          const nightShiftBlocks: WorkBlock[] = [
                            {
                              id: `new-night-1-${Date.now()}`,
                              startTime: '19:00',
                              endTime: '23:00',
                              entryType: 'WORK',
                            },
                            {
                              id: `new-night-2-${Date.now()}`,
                              startTime: '06:01',
                              endTime: '07:00',
                              entryType: 'WORK',
                            },
                          ]
                          setIsNightShift(true)
                          setWorkBlocks(nightShiftBlocks)
                        }
                        
                        // Lade Unterbrechungen (am Startdatum)
                        // Verwende currentData, da alle Einträge am Startdatum gebucht werden
                        const allData = [...currentData, ...nextData]
                        const sleepInterruptionEntry =
                          // Neues Modell: Unterbrechung am Startdatum (date != startTime day)
                          allData.find((e: TimeEntry) => {
                            const entryDate = parseISO(e.date)
                            const startIso = parseISO(e.startTime)
                            return isSameDay(entryDate, selectedDate) && e.entryType === 'SLEEP_INTERRUPTION' && !isSameDay(entryDate, startIso)
                          }) ||
                          // Fallback: altes Modell -> Unterbrechung am Folgetag (date == startTime day)
                          allData.find((e: TimeEntry) => {
                            const entryDate = parseISO(e.date)
                            const startIso = parseISO(e.startTime)
                            return e.entryType === 'SLEEP_INTERRUPTION' && isSameDay(entryDate, startIso)
                          })
                        if (sleepInterruptionEntry && sleepInterruptionEntry.sleepInterruptionMinutes) {
                          const totalMinutes = sleepInterruptionEntry.sleepInterruptionMinutes
                          setSleepInterruptions({
                            hours: Math.floor(totalMinutes / 60),
                            minutes: totalMinutes % 60
                          })
                        } else {
                          setSleepInterruptions({ hours: 0, minutes: 0 })
                        }
                      } else {
                        // Zurück zur normalen Ansicht - filtere Nachtdienst-Blöcke heraus
                        setIsNightShift(false)
                        const normalBlocks = workBlocks.filter(block => {
                          const isNightShiftBlock = (block.startTime === '19:00' && block.endTime === '23:00') || 
                                                   (block.startTime === '06:01')
                          return !isNightShiftBlock
                        })
                        setWorkBlocks(normalBlocks)
                        setSleepInterruptions({ hours: 0, minutes: 0 })
                      }
                    }}
                  />
                  <Label htmlFor="nightShift" className="cursor-pointer">
                    Nachtdienst
                  </Label>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!selectedEmployeeId && (
                <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-start">
                    <AlertCircle className="h-5 w-5 text-blue-600 mr-2 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">
                        Bitte wählen Sie einen Mitarbeiter aus
                      </p>
                      <p className="text-xs text-blue-700 mt-1">
                        Wählen Sie einen Mitarbeiter aus, um dessen Zeiterfassung zu bearbeiten.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {isNightShift && (
                <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="space-y-2 text-sm">
                    <div className="font-medium text-blue-900 mb-2">Nachtdienst-Zeiten (Standard):</div>
                    <div className="text-blue-800">
                      <div>19:00 - 23:00 Uhr - Arbeitszeit (4h)</div>
                      <div className="text-blue-600 italic">23:01 - 23:59 und 00:00 - 06:00 - Schlafen (6h 59min)</div>
                      <div>06:01 - 07:00 - Arbeitszeit (59min)</div>
                    </div>
                    <div className="text-blue-700 text-xs mt-2 italic">
                      Die Standard-Zeiten werden automatisch gespeichert. Nur Abweichungen können erfasst werden.
                    </div>
                  </div>
                </div>
              )}
              <div className="space-y-4">
                {/* WICHTIG: Admins müssen ALLE Blöcke sehen können, damit sie sie löschen können */}
                {/* Zeige alle Blöcke für Admins, inkl. SLEEP_INTERRUPTION wenn vorhanden */}
                {(() => {
                  const filteredBlocks = workBlocks.filter(block => {
                    // Zeige SLEEP-Einträge nie
                    if (block.entryType === 'SLEEP') return false
                    // Zeige SLEEP_INTERRUPTION nur wenn keine Nachtdienst-Blöcke vorhanden sind (als Rest-Eintrag)
                    if (block.entryType === 'SLEEP_INTERRUPTION') {
                      const workBlocksOnly = workBlocks.filter(b => b.entryType !== 'SLEEP' && b.entryType !== 'SLEEP_INTERRUPTION')
                      const hasNightShiftBlocks = workBlocksOnly.some(b => {
                        const startTime = b.startTime
                        return (startTime.startsWith('19:') || startTime.localeCompare('19:00') < 0) && b.endTime === '23:00'
                      }) || workBlocksOnly.some(b => b.startTime.startsWith('06:01'))
                      return !hasNightShiftBlocks // Nur anzeigen wenn keine Nachtdienst-Blöcke vorhanden
                    }
                    return true
                  })
                  
                  // Berechne korrekte Indizes für normale Blöcke (ohne SLEEP_INTERRUPTION)
                  const normalBlocksOnly = filteredBlocks.filter(b => b.entryType !== 'SLEEP_INTERRUPTION')
                  
                  return filteredBlocks.map((block, index) => {
                    // Für normale Blöcke: Verwende korrekten Index basierend auf normalen Blöcken
                    const normalBlockIndex = normalBlocksOnly.findIndex(b => b.id === block.id)
                    const displayIndex = block.entryType === 'SLEEP_INTERRUPTION' ? -1 : normalBlockIndex
                  // Für SLEEP_INTERRUPTION-Einträge: Zeige als separaten löschbaren Block
                  if (block.entryType === 'SLEEP_INTERRUPTION') {
                    const interruptionEntry = getEntriesForDate(selectedDate).find(e => e.id === block.id)
                    const interruptionHours = interruptionEntry?.sleepInterruptionMinutes 
                      ? Math.floor(interruptionEntry.sleepInterruptionMinutes / 60) 
                      : 0
                    const interruptionMinutes = interruptionEntry?.sleepInterruptionMinutes 
                      ? interruptionEntry.sleepInterruptionMinutes % 60 
                      : 0
                    
                    return (
                      <div key={block.id} className="border border-orange-200 rounded-lg p-4 bg-orange-50">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-orange-700">
                            Schlafunterbrechung (Rest-Eintrag)
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteTimeEntry(block.id)}
                            title="Schlafunterbrechung löschen"
                            className="text-red-600 hover:text-red-700"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="text-sm text-gray-600">
                          Dauer: {interruptionHours}h {interruptionMinutes}min
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Dieser Eintrag ist ein Überbleibsel eines gelöschten Nachtdienstes. Sie können ihn löschen.
                        </div>
                      </div>
                    )
                  }
                  // Bei Nachtdienst: Identifiziere den Block-Typ basierend auf Startzeit
                  // Nur echte Nachtdienst-Blöcke (nicht normale Blöcke)
                  const isFirstBlock = isNightShift && !block.startTime.startsWith('06:01') && block.endTime === '23:00'
                  const isSecondBlock = isNightShift && block.startTime.startsWith('06:01')
                  
                  // Für die Berechnung: Verwende die tatsächlichen Zeiten
                  const effectiveStartTime = block.startTime
                  const effectiveEndTime = block.endTime
                  const blockHours = calculateBlockHours(effectiveStartTime, effectiveEndTime, displayIndex >= 0 ? displayIndex : 0)
                  // Bei Nachtdienst-Blöcken gelten die 6-Stunden-Regel und Pausen-Regel nicht
                  // Für normale Blöcke: 6 Stunden = 360 Minuten, berechne Minuten direkt für präzisere Validierung
                  const blockMinutes = blockHours * 60
                  const exceedsMaxHours = !isFirstBlock && !isSecondBlock && blockMinutes > 360
                  
                  // Prüfe Pause zum nächsten Block (nur Work-Blöcke)
                  const workBlocksOnly = workBlocks.filter(b => b.entryType !== 'SLEEP' && b.entryType !== 'SLEEP_INTERRUPTION')
                  const nextBlock = displayIndex >= 0 ? workBlocksOnly[displayIndex + 1] : undefined
                  let breakMinutes = 0
                  let breakTooShort = false
                  // Bei Nachtdienst gelten die Pausen-Regeln nicht
                  if (!isNightShift && block.endTime && nextBlock?.startTime) {
                    breakMinutes = calculateBreakMinutes(block.endTime, nextBlock.startTime)
                    const totalHours = calculateTotalWorkHours(workBlocksOnly)
                    if (totalHours > 6 && breakMinutes < 45) {
                      breakTooShort = true
                    }
                  }

                  return (
                    <div key={block.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">
                          {isNightShift ? (
                            isFirstBlock ? 'Abweichende Startzeit' : 'Abweichende Endzeit'
                          ) : (
                            `Block ${displayIndex + 1}`
                          )}
                        </span>
                        {(() => {
                          // Für neue Blöcke (noch nicht gespeichert)
                          if (block.id.startsWith('new-')) {
                            if (!isNightShift) {
                              return (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeWorkBlock(block.id)}
                                  title="Block entfernen"
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )
                            }
                            // Bei Nachtdienst: Nur löschen wenn es keine Standard-Zeiten sind
                            if (isNightShift && !(
                              (block.startTime === '19:00' && block.endTime === '23:00') ||
                              (block.startTime === '06:01' && block.endTime === '07:00')
                            )) {
                              return (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeWorkBlock(block.id)}
                                  title="Block entfernen"
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )
                            }
                            return null
                          }
                          
                          // Für bereits gespeicherte Blöcke: IMMER Lösch-Button anzeigen für Admins
                          // Admins können alle Einträge im laufenden Jahr löschen
                          const deleteTitle = isNightShift 
                            ? "Eintrag löschen (beide Nachtdienst-Blöcke werden gelöscht, falls im laufenden Jahr)"
                            : "Eintrag löschen"
                          
                          // Debug: Log block info
                          console.log('Admin: Zeige Lösch-Button für Block', { 
                            id: block.id, 
                            startTime: block.startTime, 
                            endTime: block.endTime,
                            isNew: block.id.startsWith('new-')
                          })
                          
                          return (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteTimeEntry(block.id)}
                              title={deleteTitle}
                              className="text-red-600 hover:text-red-700"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )
                        })()}
                      </div>

                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>Start</Label>
                            <Input
                              type="time"
                              value={isSecondBlock ? '06:01' : block.startTime}
                              onChange={(e) => {
                                // Bei Nachtdienst: Zweiter Block kann nicht geändert werden (immer 06:01)
                                if (isSecondBlock) {
                                  return
                                }
                                updateWorkBlock(block.id, 'startTime', e.target.value)
                              }}
                              disabled={isSecondBlock}
                              readOnly={isSecondBlock}
                            />
                            {isSecondBlock && (
                              <p className="text-xs text-gray-500 mt-1">Bei Nachtdienst startet der zweite Block immer um 06:01 Uhr</p>
                            )}
                          </div>
                          <div>
                            <Label>Ende</Label>
                            <Input
                              type="time"
                              value={isFirstBlock ? '23:00' : (block.endTime || '')}
                              onChange={(e) => {
                                // Bei Nachtdienst: Erster Block endet immer um 23:00, kann nicht geändert werden
                                if (isFirstBlock) {
                                  return
                                }
                                updateWorkBlock(block.id, 'endTime', e.target.value)
                              }}
                              disabled={isFirstBlock}
                              readOnly={isFirstBlock}
                            />
                            {isFirstBlock && (
                              <p className="text-xs text-gray-500 mt-1">Bei Nachtdienst endet der erste Block immer um 23:00 Uhr</p>
                            )}
                            {isSecondBlock && (
                              <p className="text-xs text-gray-500 mt-1">Abweichende Endzeit (Standard: 07:00)</p>
                            )}
                          </div>
                        </div>
                        <div>
                          <Label>Art</Label>
                          <Select
                            value={block.entryType}
                            onValueChange={(value) => {
                              // Verhindere Auswahl von VACATION und TRAINING
                              if (value === 'VACATION' || value === 'TRAINING') {
                                return
                              }
                              updateWorkBlock(block.id, 'entryType', value)
                            }}
                            disabled={block.entryType === 'VACATION' || block.entryType === 'TRAINING'}
                          >
                            <SelectTrigger className={block.entryType === 'VACATION' || block.entryType === 'TRAINING' ? 'opacity-50 bg-gray-100' : ''}>
                              <SelectValue placeholder="Art wählen" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="WORK">Normale Arbeitszeiterfassung</SelectItem>
                              <SelectItem value="SICK">Krankheit</SelectItem>
                              <SelectItem 
                                value="VACATION" 
                                disabled 
                                className="opacity-50 cursor-not-allowed bg-gray-100"
                              >
                                Ferien (wird über Dienstplan erfasst)
                              </SelectItem>
                              <SelectItem 
                                value="TRAINING" 
                                disabled 
                                className="opacity-50 cursor-not-allowed bg-gray-100"
                              >
                                Weiterbildung (wird über Dienstplan erfasst)
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          {(block.entryType === 'VACATION' || block.entryType === 'TRAINING') && (
                            <p className="text-xs text-gray-500 mt-1">
                              {block.entryType === 'VACATION' ? 'Ferien' : 'Weiterbildung'} wird über den Dienstplan erfasst und kann hier nicht geändert werden.
                            </p>
                          )}
                        </div>
                      </div>

                      {isNightShift && isSecondBlock && (
                        <div className="border-t pt-3">
                          <Label>Unterbrechungen während des Schlafens</Label>
                          <div className="grid grid-cols-2 gap-3 mt-2">
                            <div>
                              <Label htmlFor={`sleep-hours-${block.id}`} className="text-xs">Stunden</Label>
                              <Input
                                id={`sleep-hours-${block.id}`}
                                type="number"
                                min="0"
                                max="23"
                                value={sleepInterruptions.hours}
                                onChange={(e) => setSleepInterruptions({
                                  ...sleepInterruptions,
                                  hours: parseInt(e.target.value) || 0
                                })}
                              />
                            </div>
                            <div>
                              <Label htmlFor={`sleep-minutes-${block.id}`} className="text-xs">Minuten</Label>
                              <Input
                                id={`sleep-minutes-${block.id}`}
                                type="number"
                                min="0"
                                max="59"
                                value={sleepInterruptions.minutes}
                                onChange={(e) => setSleepInterruptions({
                                  ...sleepInterruptions,
                                  minutes: parseInt(e.target.value) || 0
                                })}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {block.startTime && block.endTime && exceedsMaxHours && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                          <div className="flex items-start">
                            <AlertCircle className="h-5 w-5 text-red-600 mr-2 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-red-900">
                                Arbeitszeit überschreitet 6 Stunden
                              </p>
                              <p className="text-xs text-red-700 mt-1">
                                Bitte teilen Sie die Arbeitszeit auf mehrere Blöcke auf. Zwischen Start und Ende dürfen maximal 6 Stunden liegen.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {breakTooShort && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                          <div className="flex items-start">
                            <AlertCircle className="h-5 w-5 text-red-600 mr-2 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-red-900">
                                Pause zu kurz
                              </p>
                              <p className="text-xs text-red-700 mt-1">
                                Die Pause zwischen Block {displayIndex + 1} und Block {displayIndex + 2} beträgt nur {breakMinutes} Minuten. 
                                Bei mehr als 6 Stunden Gesamtarbeitszeit ist eine verordnete Essenspause von mindestens 45 Minuten erforderlich.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
                })()}

                {!isNightShift && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={addWorkBlock}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Block hinzufügen
                  </Button>
                )}

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={addBlockWithCurrentTime}
                >
                  <Clock className="mr-2 h-4 w-4" />
                  Block mit aktueller Zeit hinzufügen
                </Button>

                {(() => {
                  // Berechne die angezeigten Blöcke (gefiltert) - ohne SLEEP-Einträge (werden separat angezeigt)
                  const displayedBlocks = workBlocks.filter(block => {
                    // SLEEP-Einträge werden separat angezeigt
                    if (block.entryType === 'SLEEP' || block.entryType === 'SLEEP_INTERRUPTION') return false
                    if (isNightShift) return true
                    const isNightShiftBlock = (block.startTime === '19:00' && block.endTime === '23:00') || 
                                             (block.startTime === '06:01')
                    return !isNightShiftBlock
                  })
                  
                  // Admins können immer speichern (keine Datumsvalidierung)
                  // Für normale Arbeitszeiterfassung: Validierungen prüfen
                  // Bei Nachtdienst: Validierungen sind anders
                  let hasIncompleteBlocks = false
                  let hasBlocksOver6Hours = false
                  let hasBreakTooShort = false
                  
                  if (isNightShift) {
                    // Bei Nachtdienst: Prüfe nur ob beide Standard-Blöcke vorhanden sind
                    // Erster Block: Startzeit muss vorhanden sein (kann abweichen), Endzeit ist immer 23:00
                    // Zweiter Block: Startzeit ist immer 06:01, Endzeit muss vorhanden sein (kann abweichen)
                    // Bei Nachtdienst müssen genau 2 Blöcke vorhanden sein
                    if (displayedBlocks.length !== 2) {
                      hasIncompleteBlocks = true
                    } else {
                      const block1 = displayedBlocks[0]
                      const block2 = displayedBlocks[1]
                      
                      // Erster Block: Startzeit muss vorhanden sein, Endzeit ist immer 23:00 (wird automatisch gesetzt)
                      // Zweiter Block: Startzeit ist immer 06:01 (wird automatisch gesetzt), Endzeit muss vorhanden sein
                      hasIncompleteBlocks = !block1 || !block1.startTime || !block2 || !block2.endTime
                    }
                    
                    // Bei Nachtdienst gelten die 6-Stunden-Regel und Pausen-Regel nicht
                    hasBlocksOver6Hours = false
                    hasBreakTooShort = false
                  } else {
                    // Normale Arbeitszeiterfassung: Standard-Validierungen
                    hasIncompleteBlocks = displayedBlocks.some(b => !b.startTime || !b.endTime)
                    hasBlocksOver6Hours = displayedBlocks.some(b => {
                      if (!b.startTime || !b.endTime) return false
                      const hours = calculateBlockHours(b.startTime, b.endTime)
                      // 6 Stunden = 360 Minuten, berechne Minuten direkt für präzisere Validierung
                      const minutes = hours * 60
                      return minutes > 360
                    })
                    
                    const totalHours = calculateTotalWorkHours(displayedBlocks)
                    if (totalHours > 6 && displayedBlocks.length > 1) {
                      const sortedBlocks = [...displayedBlocks]
                        .filter(b => b.startTime && b.endTime)
                        .sort((a, b) => a.startTime.localeCompare(b.startTime))
                      
                      for (let i = 0; i < sortedBlocks.length - 1; i++) {
                        const breakMins = calculateBreakMinutes(sortedBlocks[i].endTime!, sortedBlocks[i + 1].startTime!)
                        if (breakMins < 45) {
                          hasBreakTooShort = true
                          break
                        }
                      }
                    }
                  }
                  
                  const isDisabled = !selectedEmployeeId || hasIncompleteBlocks || hasBlocksOver6Hours || hasBreakTooShort
                  
                  console.log('Admin: Speichern-Button Validierung:', {
                    isNightShift,
                    selectedEmployeeId: !!selectedEmployeeId,
                    displayedBlocksCount: displayedBlocks.length,
                    displayedBlocks: displayedBlocks.map(b => ({ startTime: b.startTime, endTime: b.endTime })),
                    hasIncompleteBlocks,
                    hasBlocksOver6Hours,
                    hasBreakTooShort,
                    isDisabled
                  })
                  
                  return displayedBlocks.length > 0 && (
                    <Button
                      className="w-full"
                      onClick={handleSave}
                      disabled={isDisabled}
                      title={isDisabled ? 
                        (!selectedEmployeeId ? 'Bitte wählen Sie einen Mitarbeiter aus' :
                         hasIncompleteBlocks ? 'Bitte füllen Sie alle Start- und Endzeiten aus' :
                         hasBlocksOver6Hours ? 'Ein Block überschreitet 6 Stunden' :
                         hasBreakTooShort ? 'Pause zwischen Blöcken zu kurz (min. 45 Min.)' : '') 
                        : ''}
                    >
                      Speichern
                    </Button>
                  )
                })()}

                {/* Zeige SLEEP-Einträge separat, damit sie gelöscht werden können */}
                {(() => {
                  const sleepEntries = getNightShiftSleepEntriesForStartDate(selectedDate)
                  const sleepBlocks: WorkBlock[] = sleepEntries.map(e => ({
                    id: e.id,
                    startTime: format(parseISO(e.startTime), 'HH:mm'),
                    endTime: e.endTime ? format(parseISO(e.endTime), 'HH:mm') : null,
                    entryType: 'SLEEP',
                  }))
                  if (sleepBlocks.length === 0) return null
                  
                  return (
                    <div className="mt-4 space-y-2">
                      <div className="text-sm font-medium text-gray-700">Schlafenszeit-Einträge (können gelöscht werden):</div>
                      {sleepBlocks.map((block) => (
                        <div key={block.id} className="border border-purple-200 rounded-lg p-3 bg-purple-50 flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <span className="text-sm text-purple-700">
                              Schlaf: {block.startTime} - {block.endTime}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteTimeEntry(block.id)}
                            title="Schlafenszeit-Eintrag löschen"
                            className="text-red-600 hover:text-red-700"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )
                })()}

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
                    <AlertCircle className="h-5 w-5 text-red-600 mr-2 mt-0.5" />
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}
                
                {/* Anzeige: Arbeitszeit und Schlafenszeit separat */}
                {(() => {
                  // Prüfe ob Nachtdienst-Einträge vorhanden sind (auch wenn Checkbox nicht aktiviert ist)
                  const dayEntries = getEntriesForDate(selectedDate)
                  const sleepHours = getSleepHoursForDate(selectedDate)
                  const interruptionHours = getSleepInterruptionHoursForDate(selectedDate)
                  const hasSleepEntries = sleepHours > 0
                  const hasNightShiftWork = dayEntries.some(e => 
                    e.entryType !== 'SLEEP' && 
                    e.entryType !== 'SLEEP_INTERRUPTION' &&
                    e.endTime !== null
                  )
                  const hasNightShiftPattern = dayEntries.some(e => {
                    if (e.endTime === null || e.entryType === 'SLEEP') return false
                    const startTime = format(parseISO(e.startTime), 'HH:mm')
                    const endTime = format(parseISO(e.endTime), 'HH:mm')
                    return (startTime === '19:00' && endTime === '23:00') || startTime === '06:01'
                  })
                  const showTimeOverview = isNightShift || hasSleepEntries || interruptionHours > 0 || hasNightShiftPattern
                  
                  if (!showTimeOverview) return null
                  
                  return (
                    <Card className="mt-4">
                      <CardHeader>
                        <CardTitle className="text-sm">Zeitübersicht</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Arbeitszeit:</span>
                          <span className="font-medium">
                            {getTotalHoursForDate(selectedDate).toFixed(2)}h
                          </span>
                        </div>
                        {hasSleepEntries && (
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Schlafenszeit:</span>
                            <span className="font-medium text-purple-600">
                              {(() => {
                                const sleepMinutes = Math.round(sleepHours * 60)
                                const hours = Math.floor(sleepMinutes / 60)
                                const minutes = sleepMinutes % 60
                                return hours > 0 
                                  ? `${hours}:${minutes.toString().padStart(2, '0')}`
                                  : `0:${minutes.toString().padStart(2, '0')}`
                              })()}
                            </span>
                          </div>
                        )}
                        {interruptionHours > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Unterbrechungen:</span>
                            <span className="font-medium text-orange-600">
                              {getSleepInterruptionHoursForDate(selectedDate).toFixed(2)}h
                            </span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })()}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
