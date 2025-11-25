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
      const nextDateStr = format(addDays(date, 1), 'yyyy-MM-dd')
      
      // Lade Einträge für aktuellen Tag und Folgetag (für Nachtdienst)
      // Verwende Admin-API mit employeeId als Query-Parameter
      const [currentResponse, nextResponse] = await Promise.all([
        fetch(`/api/admin/time-entries?employeeId=${selectedEmployeeId}&date=${dateStr}`),
        fetch(`/api/admin/time-entries?employeeId=${selectedEmployeeId}&date=${nextDateStr}`)
      ])
      
      const currentData = currentResponse.ok ? await currentResponse.json() : []
      const nextData = nextResponse.ok ? await nextResponse.json() : []
      
      // Konvertiere nur vollständige Einträge (mit endTime) in WorkBlocks
      const currentBlocks: WorkBlock[] = currentData
        .filter((entry: TimeEntry) => entry.endTime !== null && entry.entryType !== 'SLEEP')
        .map((entry: TimeEntry) => ({
          id: entry.id,
          startTime: format(parseISO(entry.startTime), 'HH:mm'),
          endTime: entry.endTime ? format(parseISO(entry.endTime), 'HH:mm') : null,
          entryType: entry.entryType || 'WORK',
        }))
      
      // Für Nachtdienst: Lade auch Einträge vom Folgetag (06:01-07:xx)
      const nextBlocks: WorkBlock[] = nextData
        .filter((entry: TimeEntry) => {
          if (entry.endTime === null || entry.entryType === 'SLEEP') return false
          const startTime = format(parseISO(entry.startTime), 'HH:mm')
          return startTime === '06:01' // Nur Blöcke die um 06:01 starten
        })
        .map((entry: TimeEntry) => ({
          id: entry.id,
          startTime: format(parseISO(entry.startTime), 'HH:mm'),
          endTime: entry.endTime ? format(parseISO(entry.endTime), 'HH:mm') : null,
          entryType: entry.entryType || 'WORK',
        }))
      
      const allBlocks = [...currentBlocks, ...nextBlocks]
      
      console.log('Admin: Geladene Blöcke', { 
        currentBlocks: currentBlocks.length, 
        nextBlocks: nextBlocks.length, 
        allBlocks: allBlocks.length,
        allBlocks 
      })
      
      // Prüfe ob es ein Nachtdienst ist (19:00-23:00 und 06:01-07:xx vorhanden)
      // Nur wenn beide typischen Nachtdienst-Blöcke vorhanden sind
      const hasBlock1 = allBlocks.some(b => b.startTime === '19:00' && b.endTime === '23:00')
      const hasBlock2 = allBlocks.some(b => b.startTime === '06:01')
      const hasNightShift = hasBlock1 && hasBlock2
      
      // Setze isNightShift basierend auf geladenen Einträgen
      // Nur wenn beide Nachtdienst-Blöcke vorhanden sind
      setIsNightShift(hasNightShift)
      
      // Setze workBlocks - WICHTIG: Für Admins immer ALLE Blöcke anzeigen, damit sie gelöscht werden können
      // Admins müssen alle Blöcke sehen und löschen können
      setWorkBlocks(allBlocks)
      
      // Lade Unterbrechungen während des Schlafens
      // WICHTIG: Unterbrechungen werden auf den Folgetag gebucht, daher aus nextData laden
      if (hasNightShift) {
        const sleepInterruptionEntry = nextData.find((e: TimeEntry) => 
          e.entryType === 'SLEEP_INTERRUPTION'
        )
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
        setSleepInterruptions({ hours: 0, minutes: 0 })
      }
    } catch (error) {
      console.error('Fehler beim Laden der Einträge:', error)
    }
  }

  const getEntriesForDate = (date: Date) => {
    return entries.filter(entry => {
      const entryDate = new Date(entry.date)
      return isSameDay(entryDate, date)
    })
  }

  const getSleepHoursForDate = (date: Date) => {
    const dayEntries = getEntriesForDate(date).filter(e => e.endTime !== null && e.entryType === 'SLEEP')
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
    // WICHTIG: Unterbrechungen werden auf den Folgetag gebucht (Schlafenszeit 00:00-06:00)
    // Für die Schlafenszeit 00:00-06:00 (Folgetag) müssen die Unterbrechungen vom gleichen Tag abgezogen werden
    // Für die Schlafenszeit 23:01-23:59 (aktueller Tag) gibt es keine Unterbrechungen
    const hasNightSleep = dayEntries.some(e => {
      if (!e.endTime) return false
      const startTime = format(parseISO(e.startTime), 'HH:mm')
      return startTime === '00:00'
    })
    
    if (hasNightSleep) {
      // Für die Schlafenszeit 00:00-06:00: Unterbrechungen vom gleichen Tag abziehen
      const interruptionEntry = getEntriesForDate(date).find(e => e.entryType === 'SLEEP_INTERRUPTION')
      const interruptionMinutes = interruptionEntry?.sleepInterruptionMinutes || 0
      const interruptionHours = interruptionMinutes / 60
      return Math.max(0, sleepHours - interruptionHours)
    }
    
    return sleepHours
  }

  const getSleepInterruptionHoursForDate = (date: Date) => {
    // WICHTIG: Unterbrechungen werden auf den Folgetag gebucht (Schlafenszeit 00:00-06:00)
    // Für die Anzeige am aktuellen Tag müssen wir die Unterbrechungen vom Folgetag holen
    const nextDay = addDays(date, 1)
    const interruptionEntry = getEntriesForDate(nextDay).find(e => e.entryType === 'SLEEP_INTERRUPTION')
    return (interruptionEntry?.sleepInterruptionMinutes || 0) / 60
  }

  const getTotalHoursForDate = (date: Date) => {
    const dayEntries = getEntriesForDate(date).filter(e => e.endTime !== null && e.entryType !== 'SLEEP' && e.entryType !== 'SLEEP_INTERRUPTION')
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
    // WICHTIG: Unterbrechungen werden IMMER und NUR auf den Folgetag gebucht
    // Sie müssen NUR zur Arbeitszeit am Folgetag addiert werden (wo sie gebucht sind)
    // Am aktuellen Tag werden sie NICHT addiert, weil sie dort nicht gebucht sind
    const interruptionEntry = getEntriesForDate(date).find(e => e.entryType === 'SLEEP_INTERRUPTION')
    const interruptionMinutes = interruptionEntry?.sleepInterruptionMinutes || 0
    const interruptionHours = interruptionMinutes / 60
    
    // Nur addieren, wenn Unterbrechungen auf diesem Tag gebucht sind (Folgetag)
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
    const nextDateStr = format(addDays(selectedDate, 1), 'yyyy-MM-dd')
    
    // Verwende die gefilterten Blöcke für die Anzeige, aber alle Blöcke für das Speichern
    // Wenn Nachtdienst nicht aktiviert ist, müssen wir trotzdem alle Blöcke speichern können
    const blocksToSave = isNightShift 
      ? workBlocks 
      : workBlocks.filter(block => {
          // Beim Speichern: Wenn Nachtdienst nicht aktiviert, speichere nur normale Blöcke
          const isNightShiftBlock = (block.startTime === '19:00' && block.endTime === '23:00') || 
                                   (block.startTime === '06:01')
          return !isNightShiftBlock
        })
    
    console.log('handleSave called', { isNightShift, workBlocks, blocksToSave, sleepInterruptions })

    // Bei Nachtdienst: Speichere Standard-Zeiten wenn keine Abweichungen
    if (isNightShift) {
      // Prüfe ob Abweichungen vorhanden sind
      const hasDeviations = blocksToSave.some(block => {
        // Erster Block: Startzeit kann abweichen (aber Endzeit ist immer 23:00)
        if (block.startTime && block.startTime !== '19:00') return true
        // Zweiter Block: Endzeit kann abweichen (aber Startzeit ist immer 06:01)
        if (block.startTime === '06:01' && block.endTime && block.endTime !== '07:00') return true
        return false
      })

      // Prüfe auch auf Unterbrechungen
      const hasInterruptions = sleepInterruptions.hours > 0 || sleepInterruptions.minutes > 0

      // Wenn keine Abweichungen und keine Unterbrechungen, speichere Standard-Zeiten
      if (!hasDeviations && !hasInterruptions && blocksToSave.length === 2) {
        // Lösche alle bestehenden Einträge für diesen Tag und Folgetag
        const existingEntries = entries.filter(e => {
          const entryDate = new Date(e.date)
          return isSameDay(entryDate, selectedDate) || isSameDay(entryDate, addDays(selectedDate, 1))
        })

        for (const entry of existingEntries) {
          await fetch(`/api/admin/time-entries/${entry.id}`, {
            method: 'DELETE',
          })
        }

        // Speichere Standard-Zeiten für Tag
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

        // Speichere Standard-Zeiten für Folgetag
        await fetch('/api/admin/time-entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId: selectedEmployeeId,
            date: nextDateStr,
            startTime: new Date(`${nextDateStr}T00:00:00`).toISOString(),
            endTime: new Date(`${nextDateStr}T06:00:00`).toISOString(),
            breakMinutes: 0,
            entryType: 'SLEEP',
          }),
        })

        await fetch('/api/admin/time-entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId: selectedEmployeeId,
            date: nextDateStr,
            startTime: new Date(`${nextDateStr}T06:01:00`).toISOString(),
            endTime: new Date(`${nextDateStr}T07:00:00`).toISOString(),
            breakMinutes: 0,
            entryType: 'WORK',
          }),
        })

        await loadEntriesForMonth()
        await loadEntriesForDate(selectedDate)
        setError('')
        console.log('Standard-Nachtdienst-Zeiten gespeichert')
        return
      }
      // Wenn Abweichungen vorhanden sind, verarbeite sie normal weiter
    }
    
    if (blocksToSave.length === 0) {
      setError('Bitte fügen Sie mindestens einen Arbeitsblock hinzu')
      return
    }

    try {
      // Lösche alle bestehenden Einträge für diesen Tag (und Folgetag bei Nachtdienst)
      const existingEntries = entries.filter(e => {
        const entryDate = new Date(e.date)
        return isSameDay(entryDate, selectedDate) || (isNightShift && isSameDay(entryDate, addDays(selectedDate, 1)))
      })

      // Behalte nur die IDs, die in blocksToSave vorhanden sind
      const blockIds = blocksToSave.filter(b => !b.id.startsWith('new-')).map(b => b.id)
      // Bei Nachtdienst: Lösche auch alle SLEEP-Einträge vom Folgetag
      const entriesToDelete = existingEntries.filter(e => {
        if (isNightShift) {
          const entryDate = new Date(e.date)
          if (isSameDay(entryDate, addDays(selectedDate, 1)) && e.entryType === 'SLEEP') {
            return true // Lösche SLEEP-Einträge vom Folgetag
          }
        }
        return !blockIds.includes(e.id)
      })

      for (const entry of entriesToDelete) {
        await fetch(`/api/admin/time-entries/${entry.id}`, {
          method: 'DELETE',
        })
      }

      // Prüfe Gesamtarbeitszeit und Pausen zwischen Blöcken
      // Bei Nachtdienst gelten diese Validierungen nicht, da die Arbeitszeit über zwei Tage verteilt ist
      if (!isNightShift) {
        const totalHours = calculateTotalWorkHours(blocksToSave)
        if (totalHours > 6) {
          // Sortiere Blöcke nach Startzeit
          const sortedBlocks = [...blocksToSave]
            .filter(b => b.startTime && b.endTime)
            .sort((a, b) => a.startTime.localeCompare(b.startTime))

          // Prüfe Pausen zwischen aufeinanderfolgenden Blöcken
          for (let i = 0; i < sortedBlocks.length - 1; i++) {
            const currentBlock = sortedBlocks[i]
            const nextBlock = sortedBlocks[i + 1]
            
            if (currentBlock.endTime && nextBlock.startTime) {
              const breakMins = calculateBreakMinutes(currentBlock.endTime, nextBlock.startTime)
              if (breakMins < 45) {
                const blockIndex1 = sortedBlocks.findIndex(b => b.id === currentBlock.id) + 1
                const blockIndex2 = sortedBlocks.findIndex(b => b.id === nextBlock.id) + 1
                setError(`Die Pause zwischen Block ${blockIndex1} und Block ${blockIndex2} beträgt nur ${breakMins} Minuten. Bei mehr als 6 Stunden Gesamtarbeitszeit ist eine verordnete Essenspause von mindestens 45 Minuten erforderlich.`)
                return
              }
            }
          }
        }
      }

      // Erstelle/aktualisiere Einträge
      for (let i = 0; i < workBlocks.length; i++) {
        const block = workBlocks[i]
        if (!block.startTime) {
          setError('Bitte füllen Sie alle Startzeiten aus')
          return
        }

        // Bei Nachtdienst: Erster Block endet immer um 23:00, zweiter Block startet immer um 06:01
        const effectiveStartTime = isNightShift && i === 1 ? '06:01' : block.startTime
        const effectiveEndTime = isNightShift && i === 0 ? '23:00' : (isNightShift && i === 1 && !block.endTime ? '07:00' : block.endTime)
        
        // Für zweiten Block bei Nachtdienst: Datum ist der Folgetag
        const blockDate = isNightShift && i === 1 ? nextDateStr : dateStr
        
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
        const diffHours = diffMs / (1000 * 60 * 60)

        if (diffHours > 6) {
          setError(`Block ${blocksToSave.indexOf(block) + 1}: Zwischen Start und Ende dürfen maximal 6 Stunden liegen. Bitte teilen Sie die Arbeitszeit auf mehrere Blöcke auf.`)
          return
        }

        // Prüfe ob es ein bestehender Eintrag ist
        if (!block.id.startsWith('new-')) {
          // Bestehender Eintrag - aktualisiere
          await fetch(`/api/admin/time-entries/${block.id}`, {
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
          await fetch('/api/admin/time-entries', {
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

      // Bei Nachtdienst: Erstelle SLEEP-Einträge für aktuellen Tag (23:01-23:59) und Folgetag (00:00-06:00)
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

        // Prüfe ob SLEEP-Einträge für Folgetag bereits existieren
        const nextDaySleepEntries = entries.filter(e => {
          const entryDate = new Date(e.date)
          return isSameDay(entryDate, addDays(selectedDate, 1)) && e.entryType === 'SLEEP'
        })

        if (nextDaySleepEntries.length === 0) {
          // Erstelle SLEEP-Eintrag für Folgetag (00:00-06:00)
          await fetch('/api/admin/time-entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employeeId: selectedEmployeeId,
              date: nextDateStr,
              startTime: new Date(`${nextDateStr}T00:00:00`).toISOString(),
              endTime: new Date(`${nextDateStr}T06:00:00`).toISOString(),
              breakMinutes: 0,
              entryType: 'SLEEP',
            }),
          })
        }

        // Speichere/aktualisiere Unterbrechungen während des Schlafens
        // WICHTIG: Unterbrechungen werden immer auf den Folgetag gebucht (Schlafenszeit 00:00-06:00)
        const totalInterruptionMinutes = sleepInterruptions.hours * 60 + sleepInterruptions.minutes
        if (totalInterruptionMinutes > 0) {
          // Prüfe ob bereits ein SLEEP_INTERRUPTION-Eintrag für den Folgetag existiert
          const existingInterruption = entries.find(e => {
            const entryDate = new Date(e.date)
            return isSameDay(entryDate, addDays(selectedDate, 1)) && e.entryType === 'SLEEP_INTERRUPTION'
          })

          if (existingInterruption) {
            // Aktualisiere bestehenden Eintrag
            await fetch(`/api/admin/time-entries/${existingInterruption.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sleepInterruptionMinutes: totalInterruptionMinutes,
              }),
            })
          } else {
            // Erstelle neuen Eintrag für den Folgetag
            await fetch('/api/admin/time-entries', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                employeeId: selectedEmployeeId,
                date: nextDateStr,
                startTime: new Date(`${nextDateStr}T00:00:00`).toISOString(),
                endTime: new Date(`${nextDateStr}T00:00:00`).toISOString(),
                breakMinutes: 0,
                entryType: 'SLEEP_INTERRUPTION',
                sleepInterruptionMinutes: totalInterruptionMinutes,
              }),
            })
          }
        } else {
          // Lösche SLEEP_INTERRUPTION-Eintrag vom Folgetag falls vorhanden
          const existingInterruption = entries.find(e => {
            const entryDate = new Date(e.date)
            return isSameDay(entryDate, addDays(selectedDate, 1)) && e.entryType === 'SLEEP_INTERRUPTION'
          })
          if (existingInterruption) {
            await fetch(`/api/admin/time-entries/${existingInterruption.id}`, {
              method: 'DELETE',
            })
          }
        }
      }

      await loadEntriesForMonth()
      await loadEntriesForDate(selectedDate)
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
                            const hasSleepEntries = dayEntries.some(e => e.entryType === 'SLEEP')
                            // WICHTIG: Unterbrechungen werden auf den Folgetag gebucht (Schlafenszeit 00:00-06:00)
                            // Für die Anzeige: Am aktuellen Tag zeigen wir die Unterbrechungen vom Folgetag (wo sie gebucht sind)
                            // Am Folgetag zeigen wir die Unterbrechungen, die dort gebucht sind
                            const nextDay = addDays(day, 1)
                            const interruptionEntryNext = getEntriesForDate(nextDay).find(e => e.entryType === 'SLEEP_INTERRUPTION')
                            const interruptionEntryCurrent = dayEntries.find(e => e.entryType === 'SLEEP_INTERRUPTION')
                            // Verwende Unterbrechungen vom Folgetag (falls vorhanden) oder vom aktuellen Tag
                            const interruptionEntry = interruptionEntryNext || interruptionEntryCurrent
                            const interruptionHours = (interruptionEntry?.sleepInterruptionMinutes || 0) / 60
                            const sleepHours = getSleepHoursForDate(day)
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
                          currentDataCount: currentData.length,
                          nextDataCount: nextData.length,
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
                        
                        // Lade Unterbrechungen (nextData ist jetzt immer definiert)
                        const sleepInterruptionEntry = nextData.find((e: TimeEntry) => 
                          e.entryType === 'SLEEP_INTERRUPTION'
                        )
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
                {/* Zeige alle Blöcke für Admins */}
                {workBlocks
                  .map((block, index) => {
                  // Bei Nachtdienst: Erster Block endet immer um 23:00, zweiter Block startet immer um 06:01
                  const effectiveStartTime = isNightShift && index === 1 ? '06:01' : block.startTime
                  const effectiveEndTime = isNightShift && index === 0 ? '23:00' : block.endTime
                  const blockHours = calculateBlockHours(effectiveStartTime, effectiveEndTime, index)
                  // Bei Nachtdienst gelten die 6-Stunden-Regel und Pausen-Regel nicht
                  const exceedsMaxHours = !isNightShift && blockHours > 6
                  
                  // Prüfe Pause zum nächsten Block
                  const nextBlock = workBlocks[index + 1]
                  let breakMinutes = 0
                  let breakTooShort = false
                  // Bei Nachtdienst gelten die Pausen-Regeln nicht
                  if (!isNightShift && block.endTime && nextBlock?.startTime) {
                    breakMinutes = calculateBreakMinutes(block.endTime, nextBlock.startTime)
                    const totalHours = calculateTotalWorkHours(workBlocks)
                    if (totalHours > 6 && breakMinutes < 45) {
                      breakTooShort = true
                    }
                  }

                  return (
                    <div key={block.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">
                          {isNightShift ? (
                            index === 0 ? 'Abweichende Startzeit' : 'Abweichende Endzeit'
                          ) : (
                            `Block ${index + 1}`
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
                              value={isNightShift && index === 1 ? '06:01' : block.startTime}
                              onChange={(e) => {
                                // Bei Nachtdienst: Zweiter Block kann nicht geändert werden (immer 06:01)
                                if (isNightShift && index === 1) {
                                  return
                                }
                                updateWorkBlock(block.id, 'startTime', e.target.value)
                              }}
                              disabled={isNightShift && index === 1}
                              readOnly={isNightShift && index === 1}
                            />
                            {isNightShift && index === 1 && (
                              <p className="text-xs text-gray-500 mt-1">Bei Nachtdienst startet der zweite Block immer um 06:01 Uhr</p>
                            )}
                          </div>
                          <div>
                            <Label>Ende</Label>
                            <Input
                              type="time"
                              value={isNightShift && index === 0 ? '23:00' : (block.endTime || '')}
                              onChange={(e) => {
                                // Bei Nachtdienst: Erster Block kann nicht geändert werden (immer 23:00)
                                if (isNightShift && index === 0) {
                                  return
                                }
                                updateWorkBlock(block.id, 'endTime', e.target.value)
                              }}
                              disabled={isNightShift && index === 0}
                              readOnly={isNightShift && index === 0}
                            />
                            {isNightShift && index === 0 && (
                              <p className="text-xs text-gray-500 mt-1">Bei Nachtdienst endet der erste Block immer um 23:00 Uhr</p>
                            )}
                            {isNightShift && index === 1 && (
                              <p className="text-xs text-gray-500 mt-1">Abweichende Endzeit für den Folgetag (Standard: 07:00)</p>
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

                      {isNightShift && index === 1 && (
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
                                Die Pause zwischen Block {index + 1} und Block {index + 2} beträgt nur {breakMinutes} Minuten. 
                                Bei mehr als 6 Stunden Gesamtarbeitszeit ist eine verordnete Essenspause von mindestens 45 Minuten erforderlich.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}

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
                  // Berechne die angezeigten Blöcke (gefiltert)
                  const displayedBlocks = workBlocks.filter(block => {
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
                      return hours > 6
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
                  const hasSleepEntries = dayEntries.some(e => e.entryType === 'SLEEP')
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
                  const showTimeOverview = isNightShift || hasSleepEntries || hasNightShiftPattern
                  
                  if (!showTimeOverview) return null
                  
                  const sleepHours = getSleepHoursForDate(selectedDate)
                  const interruptionHours = getSleepInterruptionHoursForDate(selectedDate)
                  
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
