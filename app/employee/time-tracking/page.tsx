'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDaysInMonth, isSameMonth, isSameDay, addMonths, subMonths, addDays, subDays, startOfWeek, getDay } from 'date-fns'
import { de } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { AlertCircle, Clock, Plus, ChevronLeft, ChevronRight, X, MessageSquare } from 'lucide-react'
import { isDateEditableForEmployee } from '@/lib/date-validation'
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

interface ScheduleEntry {
  id: string
  date: string
  hours: number
  durationMinutes: number
  entryType: 'VACATION' | 'TRAINING' | 'SICK'
  serviceName: string
}

export default function TimeTrackingPage() {
  const router = useRouter()
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
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([])
  const [showMessageDialog, setShowMessageDialog] = useState(false)
  const [messageTopic, setMessageTopic] = useState<string>('')
  const [messageText, setMessageText] = useState('')
  const [messageLoading, setMessageLoading] = useState(false)
  const [messageError, setMessageError] = useState('')

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const daysInMonth = getDaysInMonth(currentMonth)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  
  // Berechne Leerzellen am Anfang (damit der erste Tag unter dem richtigen Wochentag steht)
  // getDay() gibt 0 für Sonntag, 1 für Montag, etc. zurück
  // Wir wollen Montag = 0, also verschieben wir: (getDay() + 6) % 7
  const firstDayOfWeek = (getDay(monthStart) + 6) % 7 // 0 = Montag, 6 = Sonntag
  const emptyCells = Array(firstDayOfWeek).fill(null)

  // WICHTIG: Lade alle Einträge beim Initialisieren der Komponente
  useEffect(() => {
    const initializeData = async () => {
      console.log('Initialisiere Daten beim Mount...')
      
      // Lade Einträge für den Monat
      const start = format(monthStart, 'yyyy-MM-dd')
      const endDate = addDays(monthEnd, 2)
      const end = format(endDate, 'yyyy-MM-dd')
      const response = await fetch(`/api/employee/time-entries?startDate=${start}&endDate=${end}`)
      
      if (response.ok) {
        const data: TimeEntry[] = await response.json()
        console.log('Initialisierung: Geladene Einträge:', data.length)
        
        // Setze entries State
        setEntries(data)
        
        // WICHTIG: Prüfe direkt auf Nachtdienste in den geladenen Daten
        const blocksByDate = new Map<string, WorkBlock[]>()
        
        // Durchsuche alle Einträge nach Nachtdienst-Mustern
        data.forEach((entry: TimeEntry) => {
          if (entry.entryType !== 'WORK' || !entry.endTime) return
          
          const entryDate = new Date(entry.date)
          const startTime = format(parseISO(entry.startTime), 'HH:mm')
          const endTime = format(parseISO(entry.endTime), 'HH:mm')
          
          // Block 1: 19:00-23:00
          if (startTime === '19:00' && endTime === '23:00') {
            const dateKey = format(entryDate, 'yyyy-MM-dd')
            const block: WorkBlock = {
              id: entry.id,
              startTime,
              endTime,
              entryType: entry.entryType,
            }
            if (!blocksByDate.has(dateKey)) {
              blocksByDate.set(dateKey, [])
            }
            blocksByDate.get(dateKey)!.push(block)
          }
          
          // Block 2: 06:01-07:xx (am Folgetag, aber gehört zum Vortag-Nachtdienst)
          if (startTime === '06:01' || startTime.startsWith('06:01')) {
            const previousDay = subDays(entryDate, 1)
            const dateKey = format(previousDay, 'yyyy-MM-dd')
            const block: WorkBlock = {
              id: entry.id,
              startTime,
              endTime,
              entryType: entry.entryType,
            }
            if (!blocksByDate.has(dateKey)) {
              blocksByDate.set(dateKey, [])
            }
            blocksByDate.get(dateKey)!.push(block)
          }
        })
        
        // Prüfe ob für selectedDate ein vollständiger Nachtdienst vorhanden ist
        const selectedDateKey = format(selectedDate, 'yyyy-MM-dd')
        const selectedDateBlocks = blocksByDate.get(selectedDateKey) || []
        
        const hasBlock1 = selectedDateBlocks.some(b => b.startTime === '19:00' || b.startTime.startsWith('19:'))
        const hasBlock2 = selectedDateBlocks.some(b => b.startTime === '06:01' || b.startTime.startsWith('06:01'))
        
        if (hasBlock1 && hasBlock2) {
          // Vollständiger Nachtdienst für selectedDate gefunden
          console.log('Nachtdienst für selectedDate gefunden beim Initialisieren:', selectedDateBlocks)
          setIsNightShift(true)
          setWorkBlocks(selectedDateBlocks.sort((a, b) => {
            if (a.startTime === '19:00' || a.startTime.startsWith('19:')) return -1
            if (b.startTime === '19:00' || b.startTime.startsWith('19:')) return 1
            return 0
          }))
        } else {
          // Prüfe ob selectedDate der Folgetag eines Nachtdienstes ist
          const previousDayKey = format(subDays(selectedDate, 1), 'yyyy-MM-dd')
          const previousDayBlocks = blocksByDate.get(previousDayKey) || []
          const hasPreviousBlock1 = previousDayBlocks.some(b => b.startTime === '19:00' || b.startTime.startsWith('19:'))
          const hasCurrentBlock2 = selectedDateBlocks.some(b => b.startTime === '06:01' || b.startTime.startsWith('06:01'))
          
          if (hasPreviousBlock1 && hasCurrentBlock2) {
            // selectedDate ist der Folgetag eines Nachtdienstes
            console.log('Nachtdienst-Folgetag erkannt beim Initialisieren:', [...previousDayBlocks, ...selectedDateBlocks])
            setIsNightShift(true)
            setWorkBlocks([...previousDayBlocks, ...selectedDateBlocks].sort((a, b) => {
              if (a.startTime === '19:00' || a.startTime.startsWith('19:')) return -1
              if (b.startTime === '19:00' || b.startTime.startsWith('19:')) return 1
              return 0
            }))
          }
        }
      }
      
      // WICHTIG: Warte, damit der State aktualisiert ist
      await new Promise(resolve => setTimeout(resolve, 300))
      
      // Lade auch den ausgewählten Tag, um sicherzustellen, dass alle Einträge geladen sind
      // WICHTIG: loadEntriesForDate wird die workBlocks nur setzen, wenn ein Nachtdienst für selectedDate gefunden wird
      // Wenn bereits workBlocks gesetzt wurden (vom Initialisieren), werden sie beibehalten
      await loadEntriesForDate(selectedDate)
      await loadScheduleEntries()
    }
    initializeData()
  }, []) // Nur beim Mount

  useEffect(() => {
    loadEntriesForMonth()
    loadScheduleEntries()
  }, [currentMonth])

  const loadScheduleEntries = async () => {
    try {
      const start = format(monthStart, 'yyyy-MM-dd')
      const end = format(monthEnd, 'yyyy-MM-dd')
      const response = await fetch(`/api/employee/vacation-schedule?startDate=${start}&endDate=${end}`)
      if (response.ok) {
        const data = await response.json()
        setScheduleEntries(data)
      }
    } catch (error) {
      console.error('Fehler beim Laden der Einträge aus dem Dienstplan:', error)
    }
  }

  useEffect(() => {
    if (selectedDate) {
      console.log('selectedDate changed:', selectedDate)
      const dateCopy = new Date(selectedDate)
      dateCopy.setHours(0, 0, 0, 0)
      // WICHTIG: Lade zuerst den Monat, um sicherzustellen, dass alle Einträge geladen sind
      // Dann lade den ausgewählten Tag mit allen zugehörigen Einträgen (Vortag/Folgetag für Nachtdienste)
      const loadData = async () => {
        await loadEntriesForMonth()
        await new Promise(resolve => setTimeout(resolve, 200))
        await loadEntriesForDate(dateCopy)
      }
      loadData()
    }
  }, [selectedDate])
  
  // WICHTIG: Wenn isNightShift sich ändert und Blöcke bereits geladen sind, verwende diese
  useEffect(() => {
    if (isNightShift && workBlocks.length > 0) {
      // Prüfe ob die Blöcke bereits gespeichert sind (nicht mit "new-" beginnen)
      const hasSavedBlocks = workBlocks.some(b => !b.id.startsWith('new-'))
      if (hasSavedBlocks) {
        console.log('Nachtdienst aktiviert, verwende bereits geladene Blöcke:', workBlocks)
      }
    }
  }, [isNightShift, workBlocks])

  const loadEntriesForMonth = async () => {
    try {
      // WICHTIG: Lade Einträge für den Monat + 2 Tage nach dem Monatsende
      // (1 Tag für Nachtdienst-Einträge am Folgetag + 1 Tag für aufeinanderfolgende Nachtdienste)
      const start = format(monthStart, 'yyyy-MM-dd')
      const endDate = addDays(monthEnd, 2) // +2 Tage für Nachtdienst-Einträge am Folgetag und aufeinanderfolgende Nachtdienste
      const end = format(endDate, 'yyyy-MM-dd')
      const response = await fetch(`/api/employee/time-entries?startDate=${start}&endDate=${end}`)
      if (response.ok) {
        const data = await response.json()
        console.log('loadEntriesForMonth: Geladene Einträge:', {
          anzahl: data.length,
          start,
          end,
          eintraege: data.map((e: TimeEntry) => ({
            id: e.id,
            date: e.date,
            startTime: e.startTime,
            endTime: e.endTime,
            entryType: e.entryType
          }))
        })
        // WICHTIG: Merge mit bestehenden Einträgen, damit Einträge vom Folgetag (auch aus anderen Monaten) erhalten bleiben
        // WICHTIG: Aktualisiere nur Einträge, die im geladenen Bereich liegen, behalte alle anderen
        setEntries(prevEntries => {
          // Erstelle eine Map der neuen Einträge nach ID für schnellen Zugriff
          const newEntriesMap = new Map(data.map((e: TimeEntry) => [e.id, e]))
          
          // Entferne alte Einträge, die im geladenen Bereich liegen (werden durch neue Einträge ersetzt)
          const filtered = prevEntries.filter(e => {
            const entryDate = new Date(e.date)
            const entryMonth = new Date(entryDate.getFullYear(), entryDate.getMonth(), 1)
            const currentMonthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
            const currentMonthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)
            const extendedEnd = addDays(currentMonthEnd, 3)
            
            // Prüfe ob der Eintrag im geladenen Bereich liegt
            const isInLoadedRange = entryDate >= currentMonthStart && entryDate <= extendedEnd
            
            // Behalte Einträge, die nicht im geladenen Bereich liegen
            if (!isInLoadedRange) {
              return true
            }
            
            // Wenn der Eintrag im geladenen Bereich liegt, prüfe ob er durch einen neuen Eintrag ersetzt wird
            // Wenn ja, entferne ihn (wird durch neuen Eintrag ersetzt)
            // Wenn nein, behalte ihn (könnte von einem anderen Nachtdienst stammen, der noch nicht geladen wurde)
            return !newEntriesMap.has(e.id)
          })
          
          // Füge neue Einträge hinzu (verwende Set, um Duplikate zu vermeiden)
          const allEntries = [...filtered, ...data]
          // Entferne Duplikate basierend auf ID
          const uniqueEntries = Array.from(
            new Map(allEntries.map((e: TimeEntry) => [e.id, e])).values()
          )
          console.log('Einträge aktualisiert, neue Gesamtanzahl:', uniqueEntries.length, {
            vorher: prevEntries.length,
            gefiltert: filtered.length,
            neuGeladen: data.length,
            nachDeduplizierung: uniqueEntries.length
          })
          return uniqueEntries
        })
      } else {
        console.error('Fehler beim Laden der Einträge:', response.status, await response.text().catch(() => ''))
      }
    } catch (error) {
      console.error('Fehler beim Laden der Einträge:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadEntriesForDate = async (date: Date) => {
    try {
      const dateStr = format(date, 'yyyy-MM-dd')
      const nextDateStr = format(addDays(date, 1), 'yyyy-MM-dd')
      
      // Lade Einträge für aktuellen Tag und Folgetag (für Nachtdienst)
      // WICHTIG: Lade sequenziell, um Session-Probleme zu vermeiden
      const currentResponse = await fetch(`/api/employee/time-entries?date=${dateStr}`)
      
      if (!currentResponse.ok) {
        const errorText = await currentResponse.text()
        console.error('Fehler beim Laden der Einträge für aktuellen Tag:', currentResponse.status, errorText)
      }
      
      const currentData = currentResponse.ok ? await currentResponse.json() : []
      
      // Warte kurz, dann lade Folgetag
      await new Promise(resolve => setTimeout(resolve, 100))
      
      let nextData: TimeEntry[] = []
      let nextResponse = await fetch(`/api/employee/time-entries?date=${nextDateStr}`)
      
      if (!nextResponse.ok) {
        const errorText = await nextResponse.text()
        console.error('Fehler beim Laden der Einträge für Folgetag:', nextResponse.status, errorText)
        // Bei 403-Fehler: Versuche es nochmal nach kurzer Pause
        if (nextResponse.status === 403) {
          console.log('403-Fehler beim Laden des Folgetags, versuche es erneut...')
          await new Promise(resolve => setTimeout(resolve, 500))
          const retryResponse = await fetch(`/api/employee/time-entries?date=${nextDateStr}`)
          if (retryResponse.ok) {
            nextData = await retryResponse.json()
            console.log('Erfolgreich nach Wiederholung geladen:', nextData.length, 'Einträge')
          } else {
            console.error('Auch nach Wiederholung fehlgeschlagen:', retryResponse.status)
            nextData = []
          }
        } else {
          nextData = []
        }
      } else {
        nextData = await nextResponse.json()
      }
      
      // Warte kurz, dann lade Vortag (für SLEEP-Einträge 00:00-06:00)
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const previousDateStr = format(subDays(date, 1), 'yyyy-MM-dd')
      let previousData: TimeEntry[] = []
      let previousResponse = await fetch(`/api/employee/time-entries?date=${previousDateStr}`)
      
      if (!previousResponse.ok) {
        const errorText = await previousResponse.text()
        console.error('Fehler beim Laden der Einträge für Vortag:', previousResponse.status, errorText)
        // Bei 403-Fehler: Versuche es nochmal nach kurzer Pause
        if (previousResponse.status === 403) {
          console.log('403-Fehler beim Laden des Vortags, versuche es erneut...')
          await new Promise(resolve => setTimeout(resolve, 500))
          const retryResponse = await fetch(`/api/employee/time-entries?date=${previousDateStr}`)
          if (retryResponse.ok) {
            previousData = await retryResponse.json()
            console.log('Erfolgreich nach Wiederholung geladen:', previousData.length, 'Einträge')
          } else {
            console.error('Auch nach Wiederholung fehlgeschlagen:', retryResponse.status)
            previousData = []
          }
        } else {
          previousData = []
        }
      } else {
        previousData = await previousResponse.json()
      }
      
      // Filtere nur SLEEP-Einträge vom Vortag, die zu diesem Tag gehören (00:00-06:00)
      const previousDaySleepEntries = previousData.filter((e: TimeEntry) => {
        if (e.entryType !== 'SLEEP' || !e.endTime) return false
        const startTime = format(parseISO(e.startTime), 'HH:mm')
        return startTime === '00:00'
      })
      
      console.log('loadEntriesForDate:', {
        date: dateStr,
        previousDate: previousDateStr,
        nextDate: nextDateStr,
        currentDataCount: currentData.length,
        nextDataCount: nextData.length,
        previousDataCount: previousData.length,
        previousDaySleepEntriesCount: previousDaySleepEntries.length,
        currentData: currentData.map((e: TimeEntry) => ({ id: e.id, date: e.date, startTime: e.startTime, endTime: e.endTime, entryType: e.entryType })),
        nextData: nextData.map((e: TimeEntry) => ({ id: e.id, date: e.date, startTime: e.startTime, endTime: e.endTime, entryType: e.entryType })),
        previousDaySleepEntries: previousDaySleepEntries.map((e: TimeEntry) => ({ id: e.id, date: e.date, startTime: e.startTime, endTime: e.endTime, entryType: e.entryType }))
      })
      
      // WICHTIG: Füge Einträge vom Folgetag und SLEEP-Einträge vom Vortag zu entries hinzu (für Anzeige der Stunden)
      // Dies ist wichtig für Nachtdienste, die über zwei Tage gehen
      // WICHTIG: Merge die Einträge, damit bereits geladene Einträge von anderen Tagen erhalten bleiben
      setEntries(prevEntries => {
        // Kombiniere alle neuen Einträge
        const allNewEntries = [...currentData, ...nextData, ...previousDaySleepEntries]
        
        // Erstelle eine Map der neuen Einträge nach ID für schnellen Zugriff
        const newEntriesMap = new Map(allNewEntries.map((e: TimeEntry) => [e.id, e]))
        
        // Entferne alte Einträge für aktuellen Tag, Folgetag und Vortag, die durch neue Einträge ersetzt werden
        const filtered = prevEntries.filter(e => {
          const entryDate = new Date(e.date)
          const isCurrentDay = isSameDay(entryDate, date)
          const isNextDay = isSameDay(entryDate, addDays(date, 1))
          const isPreviousDay = isSameDay(entryDate, subDays(date, 1))
          
          // Behalte Einträge, die nicht zu diesen Tagen gehören
          if (!isCurrentDay && !isNextDay && !isPreviousDay) {
            return true
          }
          
          // Wenn der Eintrag zu einem dieser Tage gehört, prüfe ob er durch einen neuen Eintrag ersetzt wird
          // Wenn ja, entferne ihn (wird durch neuen Eintrag ersetzt)
          // Wenn nein, behalte ihn (könnte von einem anderen Nachtdienst stammen)
          return !newEntriesMap.has(e.id)
        })
        
        // Füge neue Einträge hinzu (inkl. SLEEP-Einträge vom Vortag)
        // WICHTIG: Entferne Duplikate basierend auf ID
        const allEntries = [...filtered, ...allNewEntries]
        const uniqueEntries = Array.from(
          new Map(allEntries.map((e: TimeEntry) => [e.id, e])).values()
        )
        console.log('Einträge aktualisiert:', {
          neueGesamtanzahl: uniqueEntries.length,
          vorherAnzahl: prevEntries.length,
          currentDataCount: currentData.length,
          nextDataCount: nextData.length,
          previousDaySleepEntriesCount: previousDaySleepEntries.length,
          gefiltertAnzahl: filtered.length,
          nachDeduplizierung: uniqueEntries.length,
          currentData: currentData.map((e: TimeEntry) => ({ id: e.id, date: e.date, startTime: e.startTime, endTime: e.endTime, entryType: e.entryType })),
          nextData: nextData.map((e: TimeEntry) => ({ id: e.id, date: e.date, startTime: e.startTime, endTime: e.endTime, entryType: e.entryType })),
          previousDaySleepEntries: previousDaySleepEntries.map((e: TimeEntry) => ({ id: e.id, date: e.date, startTime: e.startTime, endTime: e.endTime, entryType: e.entryType }))
        })
        return uniqueEntries
      })
      
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
      // WICHTIG: Verwende flexiblere Prüfung für bessere Erkennung
      const nextBlocks: WorkBlock[] = nextData
        .filter((entry: TimeEntry) => {
          if (entry.endTime === null || entry.entryType === 'SLEEP') return false
          const startTime = format(parseISO(entry.startTime), 'HH:mm')
          // Prüfe ob Startzeit 06:01 ist (flexibel)
          return startTime === '06:01' || startTime.startsWith('06:01')
        })
        .map((entry: TimeEntry) => ({
          id: entry.id,
          startTime: format(parseISO(entry.startTime), 'HH:mm'),
          endTime: entry.endTime ? format(parseISO(entry.endTime), 'HH:mm') : null,
          entryType: entry.entryType || 'WORK',
        }))
      
      const allBlocks = [...currentBlocks, ...nextBlocks]
      
      console.log('loadEntriesForDate - Geladene Blöcke:', {
        currentBlocks: currentBlocks.length,
        nextBlocks: nextBlocks.length,
        allBlocksCount: allBlocks.length,
        allBlocks: allBlocks.map(b => ({ id: b.id, startTime: b.startTime, endTime: b.endTime }))
      })
      
      // Prüfe ob es ein Nachtdienst ist (19:00-23:00 und 06:01-07:xx vorhanden)
      // Nur wenn beide typischen Nachtdienst-Blöcke vorhanden sind
      // Verwende flexiblere Prüfung für bessere Erkennung
      const hasBlock1 = allBlocks.some(b => {
        const startMatch = b.startTime === '19:00' || (b.startTime && b.startTime.startsWith('19:'))
        const endMatch = b.endTime === '23:00' || (b.endTime && b.endTime.startsWith('23:'))
        return startMatch && endMatch
      })
      const hasBlock2 = allBlocks.some(b => {
        return b.startTime === '06:01' || (b.startTime && b.startTime.startsWith('06:01'))
      })
      const hasNightShift = hasBlock1 && hasBlock2
      
      console.log('Nachtdienst-Erkennung in loadEntriesForDate:', { 
        hasBlock1, 
        hasBlock2, 
        hasNightShift,
        allBlocks: allBlocks.map(b => ({ id: b.id, startTime: b.startTime, endTime: b.endTime }))
      })
      
      // Setze isNightShift basierend auf geladenen Einträgen
      // Nur wenn beide Nachtdienst-Blöcke vorhanden sind
      // WICHTIG: Nur setzen wenn Einträge vorhanden sind
      // Wenn keine Einträge vorhanden sind, behalte den aktuellen State (z.B. wenn Checkbox manuell aktiviert wurde)
      if (allBlocks.length > 0) {
        setIsNightShift(hasNightShift)
      }
      // Wenn keine Blöcke vorhanden sind, behalte den aktuellen isNightShift State
      // (z.B. wenn der Benutzer die Checkbox manuell aktiviert hat)
      
      // Setze workBlocks - WICHTIG: Immer alle Blöcke setzen, damit sie angezeigt werden können
      if (hasNightShift) {
        // Wenn Nachtdienst erkannt wurde (Einträge vorhanden), setze alle Blöcke
        console.log('Setze workBlocks für Nachtdienst in loadEntriesForDate:', allBlocks)
        setWorkBlocks(allBlocks)
      } else if (allBlocks.length === 0 && isNightShift) {
        // Wenn keine Einträge vorhanden sind, aber isNightShift aktiviert ist (z.B. durch Checkbox),
        // setze die Standard-Nachtdienst-Blöcke
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
        setWorkBlocks(nightShiftBlocks)
      } else {
        // WICHTIG: Wenn kein Nachtdienst für diesen Tag erkannt wurde, prüfe ob bereits Nachtdienst-Blöcke im State sind
        // (z.B. vom Initialisieren). Wenn ja, behalte sie, damit sie nicht verloren gehen.
        const existingNightShiftBlocks = workBlocks.filter(block => {
          const isNightShiftBlock = (block.startTime === '19:00' && block.endTime === '23:00') || 
                                   (block.startTime === '06:01' || block.startTime.startsWith('06:01'))
          return isNightShiftBlock && !block.id.startsWith('new-') // Nur gespeicherte Blöcke behalten
        })
        
        if (existingNightShiftBlocks.length > 0) {
          // Es gibt bereits gespeicherte Nachtdienst-Blöcke, behalte sie
          console.log('Behalte vorhandene Nachtdienst-Blöcke:', existingNightShiftBlocks)
          // Füge normale Blöcke hinzu (falls vorhanden)
          const normalBlocks = allBlocks.filter(block => {
            const isNightShiftBlock = (block.startTime === '19:00' && block.endTime === '23:00') || 
                                     (block.startTime === '06:01')
            return !isNightShiftBlock
          })
          setWorkBlocks([...existingNightShiftBlocks, ...normalBlocks])
        } else {
          // Wenn kein Nachtdienst erkannt wurde und keine vorhanden sind, filtere Nachtdienst-Blöcke heraus
          const normalBlocks = allBlocks.filter(block => {
            const isNightShiftBlock = (block.startTime === '19:00' && block.endTime === '23:00') || 
                                     (block.startTime === '06:01')
            return !isNightShiftBlock
          })
          setWorkBlocks(normalBlocks)
        }
      }
      
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

  const getScheduleEntryForDate = (date: Date, entryType?: 'VACATION' | 'TRAINING' | 'SICK'): ScheduleEntry | null => {
    return scheduleEntries.find(entry => {
      const entryDate = new Date(entry.date)
      const matchesDate = isSameDay(entryDate, date)
      if (entryType) {
        return matchesDate && entry.entryType === entryType
      }
      return matchesDate
    }) || null
  }

  const getVacationForDate = (date: Date): ScheduleEntry | null => {
    return getScheduleEntryForDate(date, 'VACATION')
  }

  const getTrainingForDate = (date: Date): ScheduleEntry | null => {
    return getScheduleEntryForDate(date, 'TRAINING')
  }

  const getSicknessForDate = (date: Date): ScheduleEntry | null => {
    return getScheduleEntryForDate(date, 'SICK')
  }

  const getSleepHoursForDate = (date: Date) => {
    // WICHTIG: Für Nachtdienste: SLEEP-Einträge können vom aktuellen Tag (23:01-23:59) 
    // ODER vom Folgetag (00:00-06:00) stammen, die zu diesem Tag gehören
    // ABER: Bei mehreren aufeinanderfolgenden Nachtdiensten müssen wir prüfen, welche SLEEP-Einträge
    // wirklich zu diesem Tag gehören
    
    const nextDay = addDays(date, 1)
    
    // Hole SLEEP-Einträge vom aktuellen Tag (23:01-23:59:59) - gehören immer zu diesem Tag
    const dayEntries = getEntriesForDate(date).filter(e => {
      if (!e.endTime || e.entryType !== 'SLEEP') return false
      const startTime = format(parseISO(e.startTime), 'HH:mm')
      // Nur SLEEP-Einträge, die um 23:01 beginnen (gehören zu diesem Tag)
      return startTime === '23:01' || startTime.startsWith('23:01')
    })
    
    // Prüfe ob am aktuellen Tag ein 19:00-23:00 Block existiert (Nachtdienst beginnt an diesem Tag)
    // ODER ob am Folgetag ein 06:01-Block existiert (vom aktuellen Tag-Nachtdienst)
    // Nur dann gehören die SLEEP-Einträge 00:00-06:00 vom Folgetag zu diesem Tag
    const hasNightShiftStartBlock = getEntriesForDate(date).some(e => {
      if (!e.endTime || e.entryType !== 'WORK') return false
      const startTime = format(parseISO(e.startTime), 'HH:mm')
      const endTime = format(parseISO(e.endTime), 'HH:mm')
      return (startTime === '19:00' || startTime.startsWith('19:')) && 
             (endTime === '23:00' || endTime.startsWith('23:'))
    })
    
    // Prüfe auch, ob am Folgetag ein 06:01-Block existiert (vom aktuellen Tag-Nachtdienst)
    const hasNightShiftEndBlock = getEntriesForDate(nextDay).some(e => {
      if (!e.endTime || e.entryType !== 'WORK') return false
      const startTime = format(parseISO(e.startTime), 'HH:mm')
      return startTime === '06:01' || startTime.startsWith('06:01')
    })
    
    // Hole SLEEP-Einträge vom Folgetag (00:00-06:00) NUR wenn am aktuellen Tag ein 19:00-23:00 Block existiert
    // ODER wenn am Folgetag ein 06:01-Block existiert (vom aktuellen Tag-Nachtdienst)
    // Das bedeutet, dass diese SLEEP-Einträge zum Nachtdienst gehören, der am aktuellen Tag begann
    const nextDaySleepEntries = (hasNightShiftStartBlock || hasNightShiftEndBlock) ? getEntriesForDate(nextDay).filter(e => {
      if (!e.endTime || e.entryType !== 'SLEEP') return false
      const startTime = format(parseISO(e.startTime), 'HH:mm')
      // Nur Einträge, die um 00:00 beginnen (Schlafenszeit vom Folgetag, die zu diesem Tag gehört)
      return startTime === '00:00' || startTime.startsWith('00:00')
    }) : []
    
    // WICHTIG: Die SLEEP-Einträge 00:00-06:00 vom aktuellen Tag gehören NICHT zu diesem Tag,
    // sondern zum Vortag-Nachtdienst! Sie werden bereits am Vortag gezählt.
    // Daher werden sie hier NICHT addiert.
    
    // Kombiniere nur die SLEEP-Einträge, die wirklich zu diesem Tag gehören
    const allSleepEntries = [...dayEntries, ...nextDaySleepEntries]
    
    const sleepHours = allSleepEntries.reduce((total, entry) => {
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
    // Für die Schlafenszeit 00:00-06:00 (vom Vortag, aber zu diesem Tag gehörend) müssen die Unterbrechungen vom gleichen Tag abgezogen werden
    // Für die Schlafenszeit 23:01-23:59 (aktueller Tag) gibt es keine Unterbrechungen
    const hasNightSleep = allSleepEntries.some(e => {
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
    // WICHTIG: Nur gespeicherte Einträge berücksichtigen, NICHT workBlocks (noch nicht gespeicherte Blöcke)
    // Die Zeiten sollen erst im Kalender erscheinen, nachdem sie gespeichert wurden
    const dayEntries = getEntriesForDate(date).filter(e => e.endTime !== null && e.entryType !== 'SLEEP' && e.entryType !== 'SLEEP_INTERRUPTION')
    
    // WICHTIG: Bei mehreren aufeinanderfolgenden Nachtdiensten müssen am Folgetag BEIDE Blöcke gezählt werden:
    // - 06:01-07:00 vom Vortag-Nachtdienst (wird auf den Folgetag gebucht)
    // - 19:00-23:00 vom aktuellen Tag-Nachtdienst (wird auf den aktuellen Tag gebucht)
    // Beispiel: Montag 19:00-23:00 → Dienstag 06:01-07:00 + Dienstag 19:00-23:00 → beide werden am Dienstag gezählt
    
    // Berechne Stunden für aktuellen Tag (alle Einträge, die auf diesem Tag gebucht sind)
    // Dies schließt ein:
    // - 19:00-23:00 Blöcke, die am aktuellen Tag beginnen
    // - 06:01-07:00 Blöcke, die vom Vortag-Nachtdienst stammen (aber auf den Folgetag gebucht sind)
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
    // WICHTIG: Unterbrechungen werden IMMER und NUR auf den Folgetag gebucht (Schlafenszeit 00:00-06:00)
    // Sie müssen NUR zur Arbeitszeit am Folgetag addiert werden (wo sie gebucht sind)
    // Am Erfassungstag (19:00-23:00) werden sie NICHT addiert, weil sie dort nicht gebucht sind
    const interruptionEntry = getEntriesForDate(date).find(e => e.entryType === 'SLEEP_INTERRUPTION')
    const interruptionMinutes = interruptionEntry?.sleepInterruptionMinutes || 0
    const interruptionHours = interruptionMinutes / 60
    
    // Addiere Unterbrechungen zur Arbeitszeit (nur wenn sie auf diesem Tag gebucht sind, also am Folgetag)
    return workHours + interruptionHours
  }

  const getSurchargeHoursForDate = (date: Date) => {
    const dayEntries = getEntriesForDate(date).filter(e => e.endTime !== null)
    return dayEntries.reduce((total, entry) => {
      return total + (entry.surchargeHours || 0)
    }, 0)
  }

  const addWorkBlock = () => {
    // Bestimme Standard-Startzeit basierend auf Block-Nummer
    // Block 1: 07:00, Block 2: 12:45
    const blockNumber = workBlocks.length + 1
    const defaultStartTime = blockNumber === 1 ? '07:00' : blockNumber === 2 ? '12:45' : ''
    
    const newBlock: WorkBlock = {
      id: `new-${Date.now()}`,
      startTime: defaultStartTime,
      endTime: null,
      entryType: 'WORK', // Standard: Normale Arbeitszeiterfassung
    }
    setWorkBlocks([...workBlocks, newBlock])
  }

  const removeWorkBlock = (id: string) => {
    setWorkBlocks(workBlocks.filter(block => block.id !== id))
  }

  const deleteTimeEntry = async (entryId: string) => {
    // Finde den Block, der gelöscht werden soll - sowohl in workBlocks als auch in entries
    const blockToDelete = workBlocks.find(b => b.id === entryId)
    const entryToDelete = entries.find(e => e.id === entryId)
    
    // Prüfe ob es ein Nachtdienst-Block ist
    // WICHTIG: Prüfe sowohl in workBlocks als auch in entries
    let isNightShiftBlock = false
    if (blockToDelete) {
      isNightShiftBlock = (blockToDelete.startTime === '19:00' && blockToDelete.endTime === '23:00') ||
                         (blockToDelete.startTime === '06:01' || (blockToDelete.startTime && blockToDelete.startTime.startsWith('06:01')))
    }
    if (!isNightShiftBlock && entryToDelete) {
      const startTimeStr = format(parseISO(entryToDelete.startTime), 'HH:mm')
      const endTimeStr = entryToDelete.endTime ? format(parseISO(entryToDelete.endTime), 'HH:mm') : ''
      isNightShiftBlock = (startTimeStr === '19:00' && endTimeStr === '23:00') ||
                         (startTimeStr === '06:01' || startTimeStr.startsWith('06:01'))
    }
    
    // Prüfe auch, ob isNightShift aktiv ist
    const isNightShiftMode = isNightShift || isNightShiftBlock
    
    const confirmMessage = isNightShiftMode
      ? 'Möchten Sie diesen Nachtdienst wirklich löschen? Beide Blöcke (19:00-23:00 und 06:01-07:xx) werden gelöscht.'
      : 'Möchten Sie diesen Eintrag wirklich löschen?'
    
    if (!confirm(confirmMessage)) {
      return
    }

    try {
      console.log('Lösche Eintrag:', { entryId, isNightShiftBlock, isNightShiftMode })
      
      // WICHTIG: Optimistisches Update - entferne Einträge sofort aus dem State
      // damit sie sofort aus der UI verschwinden
      const nextDay = addDays(selectedDate, 1)
      const previousDay = subDays(selectedDate, 1)
      
      // Entferne den gelöschten Block sofort aus workBlocks
      setWorkBlocks(prevBlocks => prevBlocks.filter(b => b.id !== entryId))
      
      // Entferne den gelöschten Eintrag sofort aus entries
      setEntries(prevEntries => {
        // Bei Nachtdienst: Entferne auch zugehörige Einträge (beide Blöcke, SLEEP-Einträge)
        if (isNightShiftMode) {
          // Finde alle zugehörigen Einträge
          const relatedEntryIds = new Set<string>([entryId])
          
          // Finde den anderen Block des Nachtdienstes
          if (blockToDelete) {
            const isFirstBlock = blockToDelete.startTime === '19:00' || blockToDelete.startTime.startsWith('19:')
            const isSecondBlock = blockToDelete.startTime === '06:01' || blockToDelete.startTime.startsWith('06:01')
            
            if (isFirstBlock) {
              // Erster Block gelöscht - finde zweiten Block (06:01 am Folgetag)
              const secondBlock = prevEntries.find(e => {
                const entryDate = new Date(e.date)
                if (!isSameDay(entryDate, nextDay) || e.entryType !== 'WORK' || !e.endTime) return false
                const startTime = format(parseISO(e.startTime), 'HH:mm')
                return startTime === '06:01' || startTime.startsWith('06:01')
              })
              if (secondBlock) relatedEntryIds.add(secondBlock.id)
            } else if (isSecondBlock) {
              // Zweiter Block gelöscht - finde ersten Block (19:00 am VORTAG, nicht aktuellen Tag!)
              // WICHTIG: Der zweite Block (06:01) gehört zum Nachtdienst, der am VORTAG begann
              const firstBlock = prevEntries.find(e => {
                const entryDate = new Date(e.date)
                // Der erste Block ist am VORTAG, nicht am aktuellen Tag!
                if (!isSameDay(entryDate, previousDay) || e.entryType !== 'WORK' || !e.endTime) return false
                const startTime = format(parseISO(e.startTime), 'HH:mm')
                const endTime = format(parseISO(e.endTime), 'HH:mm')
                return (startTime === '19:00' || startTime.startsWith('19:')) && 
                       (endTime === '23:00' || endTime.startsWith('23:'))
              })
              if (firstBlock) relatedEntryIds.add(firstBlock.id)
              
              // Finde SLEEP-Einträge am VORTAG (23:01-23:59) und am aktuellen Tag (00:00-06:00)
              prevEntries.forEach(e => {
                const entryDate = new Date(e.date)
                const isPreviousDay = isSameDay(entryDate, previousDay)
                const isCurrentDay = isSameDay(entryDate, selectedDate)
                
                if (e.entryType === 'SLEEP') {
                  const startTime = format(parseISO(e.startTime), 'HH:mm')
                  // SLEEP-Einträge am VORTAG: Nur wenn um 23:01 beginnt (gehört zu diesem Nachtdienst)
                  if (isPreviousDay && (startTime === '23:01' || startTime.startsWith('23:01'))) {
                    relatedEntryIds.add(e.id)
                  }
                  // SLEEP-Einträge am aktuellen Tag: Nur wenn um 00:00 beginnt (gehört zu diesem Nachtdienst)
                  if (isCurrentDay && (startTime === '00:00' || startTime.startsWith('00:00'))) {
                    relatedEntryIds.add(e.id)
                  }
                }
                
                // SLEEP_INTERRUPTION-Einträge am aktuellen Tag (gehören zu diesem Nachtdienst)
                if (e.entryType === 'SLEEP_INTERRUPTION' && isCurrentDay) {
                  relatedEntryIds.add(e.id)
                }
              })
            }
            
            // Finde SLEEP-Einträge, die zu DIESEM Nachtdienst gehören
            // WICHTIG: Bei aufeinanderfolgenden Nachtdiensten müssen wir präzise sein
            // Ein SLEEP-Eintrag gehört zu diesem Nachtdienst, wenn:
            // - Am aktuellen Tag: 23:01-23:59 (gehört zu diesem Nachtdienst)
            // - Am Folgetag: 00:00-06:00 (gehört zu diesem Nachtdienst, wenn zweiter Block existiert)
            prevEntries.forEach(e => {
              const entryDate = new Date(e.date)
              const isCurrentDay = isSameDay(entryDate, selectedDate)
              const isNextDay = isSameDay(entryDate, nextDay)
              
              if (e.entryType === 'SLEEP') {
                const startTime = format(parseISO(e.startTime), 'HH:mm')
                // SLEEP-Einträge am aktuellen Tag: Nur wenn um 23:01 beginnt (gehört zu diesem Nachtdienst)
                if (isCurrentDay && (startTime === '23:01' || startTime.startsWith('23:01'))) {
                  relatedEntryIds.add(e.id)
                }
                // SLEEP-Einträge am Folgetag: Nur wenn um 00:00 beginnt UND zweiter Block existiert
                // (gehört zu diesem Nachtdienst, nicht zu einem anderen)
                if (isNextDay && (startTime === '00:00' || startTime.startsWith('00:00'))) {
                  // Prüfe ob zweiter Block existiert (gehört zu diesem Nachtdienst)
                  const hasSecondBlock = prevEntries.some(entry => {
                    const entryDate2 = new Date(entry.date)
                    if (!isSameDay(entryDate2, nextDay) || entry.entryType !== 'WORK' || !entry.endTime) return false
                    const st = format(parseISO(entry.startTime), 'HH:mm')
                    return st === '06:01' || st.startsWith('06:01')
                  })
                  if (hasSecondBlock) {
                    relatedEntryIds.add(e.id)
                  }
                }
              }
              
              // SLEEP_INTERRUPTION-Einträge: Nur wenn am Folgetag UND zweiter Block existiert
              if (e.entryType === 'SLEEP_INTERRUPTION' && isNextDay) {
                const hasSecondBlock = prevEntries.some(entry => {
                  const entryDate2 = new Date(entry.date)
                  if (!isSameDay(entryDate2, nextDay) || entry.entryType !== 'WORK' || !entry.endTime) return false
                  const st = format(parseISO(entry.startTime), 'HH:mm')
                  return st === '06:01' || st.startsWith('06:01')
                })
                if (hasSecondBlock) {
                  relatedEntryIds.add(e.id)
                }
              }
            })
          } else if (entryToDelete) {
            // Wenn blockToDelete nicht gefunden wurde, aber entryToDelete existiert
            const startTimeStr = format(parseISO(entryToDelete.startTime), 'HH:mm')
            const endTimeStr = entryToDelete.endTime ? format(parseISO(entryToDelete.endTime), 'HH:mm') : ''
            const isFirstBlock = (startTimeStr === '19:00' || startTimeStr.startsWith('19:')) && 
                                (endTimeStr === '23:00' || endTimeStr.startsWith('23:'))
            const isSecondBlock = startTimeStr === '06:01' || startTimeStr.startsWith('06:01')
            
            if (isFirstBlock) {
              // Finde zweiten Block
              const secondBlock = prevEntries.find(e => {
                const entryDate = new Date(e.date)
                if (!isSameDay(entryDate, nextDay) || e.entryType !== 'WORK' || !e.endTime) return false
                const st = format(parseISO(e.startTime), 'HH:mm')
                return st === '06:01' || st.startsWith('06:01')
              })
              if (secondBlock) relatedEntryIds.add(secondBlock.id)
            } else if (isSecondBlock) {
              // Finde ersten Block am VORTAG (nicht aktuellen Tag!)
              // WICHTIG: Der zweite Block (06:01) gehört zum Nachtdienst, der am VORTAG begann
              const firstBlock = prevEntries.find(e => {
                const entryDate = new Date(e.date)
                // Der erste Block ist am VORTAG, nicht am aktuellen Tag!
                if (!isSameDay(entryDate, previousDay) || e.entryType !== 'WORK' || !e.endTime) return false
                const st = format(parseISO(e.startTime), 'HH:mm')
                const et = format(parseISO(e.endTime), 'HH:mm')
                return (st === '19:00' || st.startsWith('19:')) && (et === '23:00' || et.startsWith('23:'))
              })
              if (firstBlock) relatedEntryIds.add(firstBlock.id)
              
              // Finde SLEEP-Einträge am VORTAG (23:01-23:59) und am aktuellen Tag (00:00-06:00)
              prevEntries.forEach(e => {
                const entryDate = new Date(e.date)
                const isPreviousDay = isSameDay(entryDate, previousDay)
                const isCurrentDay = isSameDay(entryDate, selectedDate)
                
                if (e.entryType === 'SLEEP') {
                  const startTime = format(parseISO(e.startTime), 'HH:mm')
                  // SLEEP-Einträge am VORTAG: Nur wenn um 23:01 beginnt (gehört zu diesem Nachtdienst)
                  if (isPreviousDay && (startTime === '23:01' || startTime.startsWith('23:01'))) {
                    relatedEntryIds.add(e.id)
                  }
                  // SLEEP-Einträge am aktuellen Tag: Nur wenn um 00:00 beginnt (gehört zu diesem Nachtdienst)
                  if (isCurrentDay && (startTime === '00:00' || startTime.startsWith('00:00'))) {
                    relatedEntryIds.add(e.id)
                  }
                }
                
                // SLEEP_INTERRUPTION-Einträge am aktuellen Tag (gehören zu diesem Nachtdienst)
                if (e.entryType === 'SLEEP_INTERRUPTION' && isCurrentDay) {
                  relatedEntryIds.add(e.id)
                }
              })
            }
            
            // Finde SLEEP-Einträge, die zu DIESEM Nachtdienst gehören
            // WICHTIG: Bei aufeinanderfolgenden Nachtdiensten müssen wir präzise sein
            // Ein SLEEP-Eintrag gehört zu diesem Nachtdienst, wenn:
            // - Am aktuellen Tag: 23:01-23:59 (gehört zu diesem Nachtdienst)
            // - Am Folgetag: 00:00-06:00 (gehört zu diesem Nachtdienst, wenn zweiter Block existiert)
            prevEntries.forEach(e => {
              const entryDate = new Date(e.date)
              const isCurrentDay = isSameDay(entryDate, selectedDate)
              const isNextDay = isSameDay(entryDate, nextDay)
              
              if (e.entryType === 'SLEEP') {
                const startTime = format(parseISO(e.startTime), 'HH:mm')
                // SLEEP-Einträge am aktuellen Tag: Nur wenn um 23:01 beginnt (gehört zu diesem Nachtdienst)
                if (isCurrentDay && (startTime === '23:01' || startTime.startsWith('23:01'))) {
                  relatedEntryIds.add(e.id)
                }
                // SLEEP-Einträge am Folgetag: Nur wenn um 00:00 beginnt UND zweiter Block existiert
                // (gehört zu diesem Nachtdienst, nicht zu einem anderen)
                if (isNextDay && (startTime === '00:00' || startTime.startsWith('00:00'))) {
                  // Prüfe ob zweiter Block existiert (gehört zu diesem Nachtdienst)
                  const hasSecondBlock = prevEntries.some(entry => {
                    const entryDate2 = new Date(entry.date)
                    if (!isSameDay(entryDate2, nextDay) || entry.entryType !== 'WORK' || !entry.endTime) return false
                    const st = format(parseISO(entry.startTime), 'HH:mm')
                    return st === '06:01' || st.startsWith('06:01')
                  })
                  if (hasSecondBlock) {
                    relatedEntryIds.add(e.id)
                  }
                }
              }
              
              // SLEEP_INTERRUPTION-Einträge: Nur wenn am Folgetag UND zweiter Block existiert
              if (e.entryType === 'SLEEP_INTERRUPTION' && isNextDay) {
                const hasSecondBlock = prevEntries.some(entry => {
                  const entryDate2 = new Date(entry.date)
                  if (!isSameDay(entryDate2, nextDay) || entry.entryType !== 'WORK' || !entry.endTime) return false
                  const st = format(parseISO(entry.startTime), 'HH:mm')
                  return st === '06:01' || st.startsWith('06:01')
                })
                if (hasSecondBlock) {
                  relatedEntryIds.add(e.id)
                }
              }
            })
          }
          
          // Entferne alle zugehörigen Einträge
          return prevEntries.filter(e => !relatedEntryIds.has(e.id))
        } else {
          // Normale Einträge: Entferne nur den gelöschten Eintrag
          return prevEntries.filter(e => e.id !== entryId)
        }
      })
      
      // Setze isNightShift zurück, wenn Nachtdienst gelöscht wurde
      if (isNightShiftMode) {
        setIsNightShift(false)
        setSleepInterruptions({ hours: 0, minutes: 0 })
      }
      
      // Jetzt lösche auf dem Server
      const response = await fetch(`/api/employee/time-entries/${entryId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unbekannter Fehler' }))
        console.error('Fehler beim Löschen:', errorData, response.status)
        setError(errorData.error || 'Fehler beim Löschen des Eintrags')
        // Bei Fehler: Lade Daten neu, um State zu korrigieren
        await loadEntriesForMonth()
        await loadEntriesForDate(selectedDate)
        return
      }

      console.log('Eintrag erfolgreich gelöscht, lade Daten neu zur Bestätigung...')
      
      // Lade Daten neu zur Bestätigung (optimistisches Update wurde bereits gemacht)
      if (isNightShiftMode) {
        await Promise.all([
          loadEntriesForDate(previousDay),
          loadEntriesForDate(selectedDate),
          loadEntriesForDate(nextDay)
        ])
      } else {
        await loadEntriesForDate(selectedDate)
      }
      
      await loadEntriesForMonth()
      
      setError('')
    } catch (error) {
      console.error('Fehler beim Löschen:', error)
      setError('Ein Fehler ist aufgetreten')
      // Bei Fehler: Lade Daten neu, um State zu korrigieren
      await loadEntriesForMonth()
      await loadEntriesForDate(selectedDate)
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
      // WICHTIG: Prüfe auch, ob beide Blöcke vorhanden sind (kann sein, dass nur einer vorhanden ist)
      // ABER: Auch wenn nur ein Block vorhanden ist, können wir den Standard-Nachtdienst speichern,
      // da fehlende Blöcke später automatisch hinzugefügt werden
      const hasBothBlocks = blocksToSave.length >= 2 || 
        (blocksToSave.some(b => b.startTime === '19:00' || (b.startTime && b.startTime.startsWith('19:'))) &&
         blocksToSave.some(b => b.startTime === '06:01' || (b.startTime && b.startTime.startsWith('06:01'))))
      
      // WICHTIG: Speichere Standard-Nachtdienst auch wenn nur ein Block vorhanden ist,
      // da fehlende Blöcke automatisch hinzugefügt werden (siehe Zeile 1524-1558)
      // Dies verhindert, dass Nachtdienste nicht gespeichert werden, wenn nur ein Block erfasst wurde
      if (!hasDeviations && !hasInterruptions) {
        try {
          // Lösche alle bestehenden Einträge für diesen Tag und Folgetag
          const existingEntries = entries.filter(e => {
            const entryDate = new Date(e.date)
            return isSameDay(entryDate, selectedDate) || isSameDay(entryDate, addDays(selectedDate, 1))
          })

          for (const entry of existingEntries) {
            const deleteResponse = await fetch(`/api/employee/time-entries/${entry.id}`, {
              method: 'DELETE',
            })
            if (!deleteResponse.ok) {
              console.error('Fehler beim Löschen des Eintrags:', entry.id, deleteResponse.status)
            }
          }

          // Warte kurz, damit Löschungen abgeschlossen sind
          await new Promise(resolve => setTimeout(resolve, 200))

          // Speichere Standard-Zeiten für Tag - Block 1 (19:00-23:00)
          console.log('Erstelle ersten WORK-Block:', { date: dateStr, startTime: '19:00', endTime: '23:00' })
          const workBlock1Response = await fetch('/api/employee/time-entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              date: dateStr,
              startTime: new Date(`${dateStr}T19:00:00`).toISOString(),
              endTime: new Date(`${dateStr}T23:00:00`).toISOString(),
              breakMinutes: 0,
              entryType: 'WORK',
            }),
          })
          
          if (!workBlock1Response.ok) {
            const errorText = await workBlock1Response.text().catch(() => 'Unbekannter Fehler')
            let errorData
            try {
              errorData = JSON.parse(errorText)
            } catch {
              errorData = { error: errorText }
            }
            console.error('Fehler beim Erstellen des ersten WORK-Blocks:', {
              status: workBlock1Response.status,
              statusText: workBlock1Response.statusText,
              error: errorData,
              date: dateStr
            })
            setError(`Fehler beim Speichern (Status ${workBlock1Response.status}): ${errorData.error || 'Unbekannter Fehler'}`)
            return
          }
          const workBlock1 = await workBlock1Response.json()
          console.log('Erster WORK-Block erfolgreich erstellt:', { id: workBlock1.id, date: workBlock1.date, startTime: workBlock1.startTime, endTime: workBlock1.endTime })

          // Speichere SLEEP-Eintrag für aktuellen Tag (23:01-23:59:59)
          console.log('Erstelle ersten SLEEP-Block:', { date: dateStr, startTime: '23:01', endTime: '23:59:59' })
          const sleepBlock1Response = await fetch('/api/employee/time-entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              date: dateStr,
              startTime: new Date(`${dateStr}T23:01:00`).toISOString(),
              endTime: new Date(`${dateStr}T23:59:59`).toISOString(),
              breakMinutes: 0,
              entryType: 'SLEEP',
            }),
          })
          
          if (!sleepBlock1Response.ok) {
            const errorText = await sleepBlock1Response.text().catch(() => 'Unbekannter Fehler')
            let errorData
            try {
              errorData = JSON.parse(errorText)
            } catch {
              errorData = { error: errorText }
            }
            console.error('Fehler beim Erstellen des ersten SLEEP-Blocks:', {
              status: sleepBlock1Response.status,
              statusText: sleepBlock1Response.statusText,
              error: errorData,
              date: dateStr
            })
            setError(`Fehler beim Speichern (Status ${sleepBlock1Response.status}): ${errorData.error || 'Unbekannter Fehler'}`)
            return
          }
          const sleepBlock1 = await sleepBlock1Response.json()
          console.log('Erster SLEEP-Block erfolgreich erstellt:', { id: sleepBlock1.id, date: sleepBlock1.date, startTime: sleepBlock1.startTime, endTime: sleepBlock1.endTime })

          // Warte kurz
          await new Promise(resolve => setTimeout(resolve, 200))

          // Speichere SLEEP-Eintrag für Folgetag (00:00-06:00)
          console.log('Erstelle zweiten SLEEP-Block:', { date: nextDateStr, startTime: '00:00', endTime: '06:00' })
          const sleepBlock2Response = await fetch('/api/employee/time-entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              date: nextDateStr,
              startTime: new Date(`${nextDateStr}T00:00:00`).toISOString(),
              endTime: new Date(`${nextDateStr}T06:00:00`).toISOString(),
              breakMinutes: 0,
              entryType: 'SLEEP',
            }),
          })
          
          if (!sleepBlock2Response.ok) {
            const errorText = await sleepBlock2Response.text().catch(() => 'Unbekannter Fehler')
            let errorData
            try {
              errorData = JSON.parse(errorText)
            } catch {
              errorData = { error: errorText }
            }
            console.error('Fehler beim Erstellen des zweiten SLEEP-Blocks:', {
              status: sleepBlock2Response.status,
              statusText: sleepBlock2Response.statusText,
              error: errorData,
              date: nextDateStr
            })
            setError(`Fehler beim Speichern (Status ${sleepBlock2Response.status}): ${errorData.error || 'Unbekannter Fehler'}`)
            return
          }
          const sleepBlock2 = await sleepBlock2Response.json()
          console.log('Zweiter SLEEP-Block erfolgreich erstellt:', { id: sleepBlock2.id, date: sleepBlock2.date, startTime: sleepBlock2.startTime, endTime: sleepBlock2.endTime })

          // Warte kurz
          await new Promise(resolve => setTimeout(resolve, 200))

          // Speichere Standard-Zeiten für Folgetag - Block 2 (06:01-07:00)
          console.log('Erstelle zweiten WORK-Block:', { date: nextDateStr, startTime: '06:01', endTime: '07:00' })
          const workBlock2Response = await fetch('/api/employee/time-entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              date: nextDateStr,
              startTime: new Date(`${nextDateStr}T06:01:00`).toISOString(),
              endTime: new Date(`${nextDateStr}T07:00:00`).toISOString(),
              breakMinutes: 0,
              entryType: 'WORK',
            }),
          })
          
          if (!workBlock2Response.ok) {
            const errorText = await workBlock2Response.text().catch(() => 'Unbekannter Fehler')
            let errorData
            try {
              errorData = JSON.parse(errorText)
            } catch {
              errorData = { error: errorText }
            }
            console.error('Fehler beim Erstellen des zweiten WORK-Blocks:', {
              status: workBlock2Response.status,
              statusText: workBlock2Response.statusText,
              error: errorData,
              date: nextDateStr
            })
            setError(`Fehler beim Speichern (Status ${workBlock2Response.status}): ${errorData.error || 'Unbekannter Fehler'}`)
            return
          }
          const workBlock2 = await workBlock2Response.json()
          console.log('Zweiter WORK-Block erfolgreich erstellt:', { id: workBlock2.id, date: workBlock2.date, startTime: workBlock2.startTime, endTime: workBlock2.endTime })

          // Füge alle erstellten Einträge sofort zum State hinzu
          setEntries(prevEntries => {
            const newEntries = [workBlock1, sleepBlock1, sleepBlock2, workBlock2]
            const existingIds = new Set(prevEntries.map(e => e.id))
            const uniqueNewEntries = newEntries.filter(e => !existingIds.has(e.id))
            return [...prevEntries, ...uniqueNewEntries]
          })

          // WICHTIG: Warte, damit alle Einträge in der DB sind
          await new Promise(resolve => setTimeout(resolve, 500))

          // Lade Einträge neu
          await loadEntriesForMonth()
          await new Promise(resolve => setTimeout(resolve, 300))
          await loadEntriesForDate(selectedDate)
          setError('')
          console.log('Standard-Nachtdienst-Zeiten erfolgreich gespeichert')
          return
        } catch (error) {
          console.error('Fehler beim Speichern der Standard-Nachtdienst-Zeiten:', error)
          setError('Ein Fehler ist beim Speichern aufgetreten. Bitte versuchen Sie es erneut.')
          return
        }
      }
      // Wenn Abweichungen vorhanden sind, verarbeite sie normal weiter
    }
    
    if (blocksToSave.length === 0) {
      setError('Bitte fügen Sie mindestens einen Arbeitsblock hinzu')
      return
    }

    try {
      // WICHTIG: Bei Nachtdienst: Prüfe ZUERST, ob am aktuellen Tag oder Folgetag bereits ein Nachtdienst existiert
      // (vom Vortag), bevor wir Einträge löschen. Dies verhindert, dass Einträge
      // von aufeinanderfolgenden Nachtdiensten gelöscht werden.
      // Diese Variable wird später auch für die SLEEP-Einträge-Erstellung verwendet
      let hasExistingNightShiftOnNextDay: boolean | undefined = undefined
      let hasExistingNightShiftOnCurrentDay: boolean | undefined = undefined
      if (isNightShift) {
        const nextDay = addDays(selectedDate, 1)
        const nextDateStr = format(nextDay, 'yyyy-MM-dd')
        const currentDateStr = format(selectedDate, 'yyyy-MM-dd')
        
        // WICHTIG: Prüfe ZUERST den aktuellen Tag - wenn hier ein 06:01 Block existiert,
        // gehört er zu einem vorherigen Nachtdienst und darf NICHT gelöscht werden!
        try {
          const currentDayResponse = await fetch(`/api/employee/time-entries?date=${currentDateStr}`)
          if (currentDayResponse.ok) {
            const currentDayEntries = await currentDayResponse.json()
            hasExistingNightShiftOnCurrentDay = currentDayEntries.some((e: TimeEntry) => {
              if (!e.endTime || e.entryType !== 'WORK') return false
              const startTime = format(parseISO(e.startTime), 'HH:mm')
              return startTime === '06:01' || startTime.startsWith('06:01')
            })
            console.log('Prüfe Nachtdienst am aktuellen Tag (vor Löschen):', {
              currentDate: currentDateStr,
              hasExistingNightShiftOnCurrentDay,
              currentDayEntriesCount: currentDayEntries.length
            })
          }
        } catch (error) {
          console.error('Fehler beim Prüfen des aktuellen Tags:', error)
          // Fallback: Prüfe im State
          const currentDayEntries = entries.filter(e => {
            const entryDate = new Date(e.date)
            return isSameDay(entryDate, selectedDate)
          })
          hasExistingNightShiftOnCurrentDay = currentDayEntries.some(e => {
            if (!e.endTime || e.entryType !== 'WORK') return false
            const startTime = format(parseISO(e.startTime), 'HH:mm')
            return startTime === '06:01' || startTime.startsWith('06:01')
          })
        }
        
        // Lade Einträge vom Folgetag direkt vom Server
        try {
          const nextDayResponse = await fetch(`/api/employee/time-entries?date=${nextDateStr}`)
          if (nextDayResponse.ok) {
            const nextDayEntries = await nextDayResponse.json()
            hasExistingNightShiftOnNextDay = nextDayEntries.some((e: TimeEntry) => {
              if (!e.endTime || e.entryType !== 'WORK') return false
              const startTime = format(parseISO(e.startTime), 'HH:mm')
              return startTime === '06:01' || startTime.startsWith('06:01')
            })
            console.log('Prüfe Nachtdienst am Folgetag (vor Löschen):', {
              nextDate: nextDateStr,
              hasExistingNightShiftOnNextDay,
              nextDayEntriesCount: nextDayEntries.length
            })
          }
        } catch (error) {
          console.error('Fehler beim Prüfen des Folgetags:', error)
          // Fallback: Prüfe im State
          const nextDayEntries = entries.filter(e => {
            const entryDate = new Date(e.date)
            return isSameDay(entryDate, nextDay)
          })
          hasExistingNightShiftOnNextDay = nextDayEntries.some(e => {
            if (!e.endTime || e.entryType !== 'WORK') return false
            const startTime = format(parseISO(e.startTime), 'HH:mm')
            return startTime === '06:01' || startTime.startsWith('06:01')
          })
        }
      }
      
      // Lösche alle bestehenden Einträge für diesen Tag (und Folgetag bei Nachtdienst)
      const existingEntries = entries.filter(e => {
        const entryDate = new Date(e.date)
        return isSameDay(entryDate, selectedDate) || (isNightShift && isSameDay(entryDate, addDays(selectedDate, 1)))
      })

      // Behalte nur die IDs, die in blocksToSave vorhanden sind
      const blockIds = blocksToSave.filter(b => !b.id.startsWith('new-')).map(b => b.id)
      
      // WICHTIG: Bei Nachtdienst: Prüfe welche Einträge wirklich zu diesem Nachtdienst gehören
      // und welche zu einem vorherigen Nachtdienst gehören (bei aufeinanderfolgenden Nachtdiensten)
      const entriesToDelete = existingEntries.filter(e => {
        if (isNightShift) {
          const entryDate = new Date(e.date)
          const isNextDay = isSameDay(entryDate, addDays(selectedDate, 1))
          const isCurrentDay = isSameDay(entryDate, selectedDate)
          
          // WICHTIG: WORK-Blöcke vom aktuellen Tag (06:01) gehören zu einem VORHERIGEN Nachtdienst,
          // wenn hasExistingNightShiftOnCurrentDay true ist. Diese dürfen NICHT gelöscht werden!
          if (isCurrentDay && e.entryType === 'WORK' && e.endTime) {
            const startTime = format(parseISO(e.startTime), 'HH:mm')
            if (startTime === '06:01' || startTime.startsWith('06:01')) {
              // Dieser Block gehört zu einem vorherigen Nachtdienst, wenn hasExistingNightShiftOnCurrentDay true ist
              // WICHTIG: Wenn ein vorheriger Nachtdienst existiert, darf dieser Block NICHT gelöscht werden,
              // auch wenn er nicht in blocksToSave ist (weil er zu einem anderen Nachtdienst gehört)
              if (hasExistingNightShiftOnCurrentDay) {
                // Vorheriger Nachtdienst existiert - NIE löschen, auch wenn nicht in blocksToSave
                console.log('Schütze 06:01 Block vom aktuellen Tag (gehört zu vorherigem Nachtdienst):', e.id)
                return false
              } else {
                // Kein vorheriger Nachtdienst - normale Logik: lösche nur wenn nicht in blocksToSave
                return !blockIds.includes(e.id)
              }
            }
          }
          
          // WICHTIG: WORK-Blöcke vom Folgetag (06:01) gehören zu einem VORHERIGEN Nachtdienst,
          // wenn hasExistingNightShiftOnNextDay true ist. Diese dürfen NICHT gelöscht werden!
          if (isNextDay && e.entryType === 'WORK' && e.endTime) {
            const startTime = format(parseISO(e.startTime), 'HH:mm')
            if (startTime === '06:01' || startTime.startsWith('06:01')) {
              // Dieser Block gehört zu einem vorherigen Nachtdienst, wenn hasExistingNightShiftOnNextDay true ist
              // WICHTIG: Wenn ein vorheriger Nachtdienst existiert, darf dieser Block NICHT gelöscht werden,
              // auch wenn er nicht in blocksToSave ist (weil er zu einem anderen Nachtdienst gehört)
              if (hasExistingNightShiftOnNextDay) {
                // Vorheriger Nachtdienst existiert - NIE löschen, auch wenn nicht in blocksToSave
                console.log('Schütze 06:01 Block vom Folgetag (gehört zu vorherigem Nachtdienst):', e.id)
                return false
              } else {
                // Kein vorheriger Nachtdienst - normale Logik: lösche nur wenn nicht in blocksToSave
                return !blockIds.includes(e.id)
              }
            }
          }
          
          // SLEEP-Einträge vom aktuellen Tag (00:00-06:00) gehören zu einem VORHERIGEN Nachtdienst,
          // wenn hasExistingNightShiftOnCurrentDay true ist. Diese dürfen NICHT gelöscht werden!
          if (isCurrentDay && e.entryType === 'SLEEP') {
            const startTime = format(parseISO(e.startTime), 'HH:mm')
            if (startTime === '00:00' || startTime.startsWith('00:00')) {
              // Diese SLEEP-Einträge gehören zu einem vorherigen Nachtdienst, wenn hasExistingNightShiftOnCurrentDay true ist
              if (hasExistingNightShiftOnCurrentDay) {
                console.log('Schütze SLEEP 00:00 Block vom aktuellen Tag (gehört zu vorherigem Nachtdienst):', e.id)
                return false
              } else {
                // Kein vorheriger Nachtdienst - normale Logik
                return !blockIds.includes(e.id)
              }
            }
          }
          
          // SLEEP-Einträge vom Folgetag (00:00-06:00) nur löschen, wenn kein Nachtdienst vom Vortag existiert
          if (isNextDay && e.entryType === 'SLEEP') {
            const startTime = format(parseISO(e.startTime), 'HH:mm')
            // Nur SLEEP-Einträge, die um 00:00 beginnen (gehören zu diesem Nachtdienst)
            if (startTime === '00:00' || startTime.startsWith('00:00')) {
              // Lösche nur wenn kein Nachtdienst vom Vortag existiert
              // WICHTIG: Wenn hasExistingNightShiftOnNextDay true ist, gehören diese SLEEP-Einträge zum vorherigen Nachtdienst
              if (hasExistingNightShiftOnNextDay) {
                console.log('Schütze SLEEP 00:00 Block vom Folgetag (gehört zu vorherigem Nachtdienst):', e.id)
                return false
              } else {
                return !blockIds.includes(e.id)
              }
            }
          }
          
          // SLEEP-Einträge vom aktuellen Tag (23:01-23:59) gehören immer zu diesem Nachtdienst
          if (isCurrentDay && e.entryType === 'SLEEP') {
            const startTime = format(parseISO(e.startTime), 'HH:mm')
            if (startTime === '23:01' || startTime.startsWith('23:01')) {
              // Lösche nur wenn nicht in blocksToSave (wird neu erstellt)
              return !blockIds.includes(e.id)
            }
          }
          
          // SLEEP_INTERRUPTION-Einträge vom aktuellen Tag nur löschen, wenn kein vorheriger Nachtdienst existiert
          if (isCurrentDay && e.entryType === 'SLEEP_INTERRUPTION') {
            // Lösche nur wenn kein Nachtdienst vom Vortag existiert
            if (hasExistingNightShiftOnCurrentDay) {
              console.log('Schütze SLEEP_INTERRUPTION vom aktuellen Tag (gehört zu vorherigem Nachtdienst):', e.id)
              return false
            } else {
              return !blockIds.includes(e.id)
            }
          }
          
          // SLEEP_INTERRUPTION-Einträge vom Folgetag nur löschen, wenn kein vorheriger Nachtdienst existiert
          if (isNextDay && e.entryType === 'SLEEP_INTERRUPTION') {
            // Lösche nur wenn kein Nachtdienst vom Vortag existiert
            if (hasExistingNightShiftOnNextDay) {
              console.log('Schütze SLEEP_INTERRUPTION vom Folgetag (gehört zu vorherigem Nachtdienst):', e.id)
              return false
            } else {
              return !blockIds.includes(e.id)
            }
          }
        }
        // Normale Logik: Lösche Einträge, die nicht in blocksToSave sind
        return !blockIds.includes(e.id)
      })

      console.log('Einträge zum Löschen:', {
        totalExisting: existingEntries.length,
        toDelete: entriesToDelete.length,
        hasExistingNightShiftOnCurrentDay,
        hasExistingNightShiftOnNextDay,
        blockIds: blockIds,
        selectedDate: format(selectedDate, 'yyyy-MM-dd'),
        isNightShift,
        entriesToDelete: entriesToDelete.map(e => ({
          id: e.id,
          date: e.date,
          entryType: e.entryType,
          startTime: e.startTime,
          endTime: e.endTime
        })),
        existingEntries: existingEntries.map(e => ({
          id: e.id,
          date: e.date,
          entryType: e.entryType,
          startTime: e.startTime,
          endTime: e.endTime,
          inBlocksToSave: blockIds.includes(e.id)
        }))
      })

      for (const entry of entriesToDelete) {
        await fetch(`/api/employee/time-entries/${entry.id}`, {
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

      // Bei Nachtdienst: Stelle sicher, dass beide Arbeitszeit-Blöcke vorhanden sind
      // Prüfe ob beide Blöcke vorhanden sind (19:00-23:00 und 06:01-07:xx)
      if (isNightShift) {
        const hasFirstBlock = blocksToSave.some(b => {
          const startTime = b.startTime || ''
          const endTime = b.endTime || ''
          // Prüfe ob es der erste Block ist (19:00-23:00 oder ähnlich)
          return (startTime === '19:00' || startTime.startsWith('19:')) && 
                 (endTime === '23:00' || endTime.startsWith('23:'))
        })
        const hasSecondBlock = blocksToSave.some(b => {
          const startTime = b.startTime || ''
          // Prüfe ob es der zweite Block ist (06:01 oder ähnlich)
          return startTime === '06:01' || startTime.startsWith('06:01')
        })
        
        console.log('Nachtdienst: Prüfe Blöcke', { hasFirstBlock, hasSecondBlock, blocksToSaveLength: blocksToSave.length, blocksToSave })
        
        // Wenn ein Block fehlt, füge den Standard-Block hinzu
        if (!hasFirstBlock) {
          console.log('Füge ersten Block hinzu (19:00-23:00)')
          blocksToSave.unshift({
            id: `new-night-1-${Date.now()}`,
            startTime: '19:00',
            endTime: '23:00',
            entryType: 'WORK',
          })
        }
        if (!hasSecondBlock) {
          console.log('Füge zweiten Block hinzu (06:01-07:00)')
          blocksToSave.push({
            id: `new-night-2-${Date.now()}`,
            startTime: '06:01',
            endTime: '07:00',
            entryType: 'WORK',
          })
        }
      }

      // Erstelle/aktualisiere Einträge
      // Bei Nachtdienst: Sortiere Blöcke so, dass der erste Block (19:00) zuerst kommt
      const sortedBlocks = isNightShift 
        ? [...blocksToSave].sort((a, b) => {
            // Erster Block (19:00) kommt zuerst
            if (a.startTime === '19:00' || (a.startTime && a.startTime.startsWith('19:'))) return -1
            if (b.startTime === '19:00' || (b.startTime && b.startTime.startsWith('19:'))) return 1
            // Zweiter Block (06:01) kommt danach
            if (a.startTime === '06:01' || (a.startTime && a.startTime.startsWith('06:01'))) return 1
            if (b.startTime === '06:01' || (b.startTime && b.startTime.startsWith('06:01'))) return -1
            return 0
          })
        : blocksToSave

      for (let i = 0; i < sortedBlocks.length; i++) {
        const block = sortedBlocks[i]
        if (!block.startTime) {
          setError('Bitte füllen Sie alle Startzeiten aus')
          return
        }

        // Bei Nachtdienst: Bestimme welcher Block es ist basierend auf Startzeit
        const isFirstBlock = isNightShift && (block.startTime === '19:00' || (block.startTime && block.startTime.startsWith('19:')))
        const isSecondBlock = isNightShift && (block.startTime === '06:01' || (block.startTime && block.startTime.startsWith('06:01')))
        
        // Bei Nachtdienst: Erster Block endet immer um 23:00, zweiter Block startet immer um 06:01
        const effectiveStartTime = isSecondBlock ? '06:01' : block.startTime
        const effectiveEndTime = isFirstBlock ? '23:00' : (isSecondBlock && !block.endTime ? '07:00' : block.endTime)
        
        // Für zweiten Block bei Nachtdienst: Datum ist der Folgetag
        const blockDate = isSecondBlock ? nextDateStr : dateStr
        
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

        // Prüfe 6-Stunden-Regel pro Block (nur bei normalen Einträgen, nicht bei Nachtdienst)
        if (!isNightShift) {
          const diffMs = endDateTime.getTime() - startDateTime.getTime()
          const diffHours = diffMs / (1000 * 60 * 60)

          if (diffHours > 6) {
            setError(`Block ${i + 1}: Zwischen Start und Ende dürfen maximal 6 Stunden liegen. Bitte teilen Sie die Arbeitszeit auf mehrere Blöcke auf.`)
            return
          }
        }

        // Prüfe ob es ein bestehender Eintrag ist
        if (!block.id.startsWith('new-')) {
          // Bestehender Eintrag - aktualisiere
          const updateResponse = await fetch(`/api/employee/time-entries/${block.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              startTime: startDateTime.toISOString(),
              endTime: endDateTime.toISOString(),
              breakMinutes: 0,
              entryType: block.entryType || 'WORK',
            }),
          })
          
          if (!updateResponse.ok) {
            const errorData = await updateResponse.json().catch(() => ({ error: 'Unbekannter Fehler' }))
            console.error('Fehler beim Aktualisieren des Eintrags:', errorData, {
              blockId: block.id,
              blockDate,
              startTime: startDateTime.toISOString(),
              endTime: endDateTime.toISOString(),
              status: updateResponse.status
            })
            setError(errorData.error || `Fehler beim Aktualisieren des Eintrags (Status: ${updateResponse.status})`)
            return
          }
          
          console.log('Eintrag erfolgreich aktualisiert:', {
            blockId: block.id,
            blockDate,
            startTime: startDateTime.toISOString(),
            endTime: endDateTime.toISOString()
          })
        } else {
          // Neuer Eintrag
          const createResponse = await fetch('/api/employee/time-entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              date: blockDate,
              startTime: startDateTime.toISOString(),
              endTime: endDateTime.toISOString(),
              breakMinutes: 0,
              entryType: block.entryType || 'WORK',
            }),
          })
          
          if (!createResponse.ok) {
            const errorData = await createResponse.json().catch(() => ({ error: 'Unbekannter Fehler' }))
            console.error('Fehler beim Erstellen des Eintrags:', errorData, {
              blockDate,
              startTime: startDateTime.toISOString(),
              endTime: endDateTime.toISOString(),
              isSecondBlock,
              isNightShift,
              status: createResponse.status
            })
            setError(errorData.error || `Fehler beim Erstellen des Eintrags (Status: ${createResponse.status})`)
            return
          }
          
          const createdEntry = await createResponse.json()
          console.log('Eintrag erfolgreich erstellt:', {
            id: createdEntry.id,
            blockDate,
            startTime: startDateTime.toISOString(),
            endTime: endDateTime.toISOString(),
            isSecondBlock,
            entryType: createdEntry.entryType
          })
          
          // WICHTIG: Füge den erstellten Eintrag sofort zum State hinzu, damit er für nachfolgende Operationen verfügbar ist
          setEntries(prevEntries => {
            const exists = prevEntries.some(e => e.id === createdEntry.id)
            if (exists) return prevEntries
            return [...prevEntries, createdEntry]
          })
        }
      }
      
      // WICHTIG: Warte kurz, damit alle WORK-Einträge vollständig gespeichert sind
      // bevor SLEEP-Einträge erstellt werden
      await new Promise(resolve => setTimeout(resolve, 500))

      // Bei Nachtdienst: Erstelle SLEEP-Einträge für aktuellen Tag (23:01-23:59:59) und Folgetag (00:00-06:00)
      // WICHTIG: Bei mehreren aufeinanderfolgenden Nachtdiensten dürfen die SLEEP-Einträge vom Folgetag NICHT gelöscht werden,
      // wenn sie bereits vom Vortag-Nachtdienst stammen!
      if (isNightShift) {
        try {
          // WICHTIG: Verwende die bereits geprüfte Variable hasExistingNightShiftOnNextDay
          // (wurde oben vor dem Löschen geprüft)
          // Falls sie noch nicht gesetzt wurde, prüfe jetzt
          const nextDay = addDays(selectedDate, 1)
          const nextDateStr = format(nextDay, 'yyyy-MM-dd')
          
          // WICHTIG: nextDayEntries muss immer definiert sein, auch wenn hasExistingNightShiftOnNextDay bereits gesetzt wurde
          let nextDayEntries: TimeEntry[] = []
          
          if (hasExistingNightShiftOnNextDay === undefined) {
            try {
              const nextDayResponse = await fetch(`/api/employee/time-entries?date=${nextDateStr}`)
              if (nextDayResponse.ok) {
                nextDayEntries = await nextDayResponse.json()
              }
            } catch (error) {
              console.error('Fehler beim Laden der Einträge vom Folgetag:', error)
              // Fallback: Verwende Einträge aus dem State
              nextDayEntries = getEntriesForDate(nextDay)
            }
            
            hasExistingNightShiftOnNextDay = nextDayEntries.some(e => {
              if (!e.endTime || e.entryType !== 'WORK') return false
              const startTime = format(parseISO(e.startTime), 'HH:mm')
              return startTime === '06:01' || startTime.startsWith('06:01')
            })
            
            console.log('Prüfe Nachtdienst am Folgetag (für SLEEP-Einträge):', {
              nextDate: nextDateStr,
              nextDayEntriesCount: nextDayEntries.length,
              hasExistingNightShiftOnNextDay,
              nextDayEntries: nextDayEntries.map(e => ({
                id: e.id,
                startTime: e.startTime,
                endTime: e.endTime,
                entryType: e.entryType
              }))
            })
          } else {
            // Wenn hasExistingNightShiftOnNextDay bereits gesetzt wurde, lade trotzdem die Einträge
            // für die Prüfung auf existingSleepOnNextDay
            try {
              const nextDayResponse = await fetch(`/api/employee/time-entries?date=${nextDateStr}`)
              if (nextDayResponse.ok) {
                nextDayEntries = await nextDayResponse.json()
              } else {
                // Fallback: Verwende Einträge aus dem State
                nextDayEntries = getEntriesForDate(nextDay)
              }
            } catch (error) {
              console.error('Fehler beim Laden der Einträge vom Folgetag:', error)
              // Fallback: Verwende Einträge aus dem State
              nextDayEntries = getEntriesForDate(nextDay)
            }
          }
          
          // Lösche nur SLEEP-Einträge vom aktuellen Tag (23:01-23:59:59), die zu diesem Nachtdienst gehören
          const currentDaySleepEntries = entries.filter(e => {
            const entryDate = new Date(e.date)
            if (!isSameDay(entryDate, selectedDate) || e.entryType !== 'SLEEP') return false
            // Nur SLEEP-Einträge, die um 23:01 beginnen (gehören zu diesem Nachtdienst)
            const startTime = format(parseISO(e.startTime), 'HH:mm')
            return startTime === '23:01' || startTime.startsWith('23:01')
          })
          
          // Lösche SLEEP-Einträge vom aktuellen Tag
          for (const entry of currentDaySleepEntries) {
            try {
              const deleteResponse = await fetch(`/api/employee/time-entries/${entry.id}`, {
                method: 'DELETE',
              })
              if (!deleteResponse.ok) {
                console.error('Fehler beim Löschen des SLEEP-Eintrags:', entry.id, deleteResponse.status)
              }
            } catch (error) {
              console.error('Fehler beim Löschen des SLEEP-Eintrags:', error)
            }
          }
          
          // Lösche SLEEP-Einträge vom Folgetag (00:00-06:00) NUR wenn kein Nachtdienst vom Vortag existiert
          // Wenn bereits ein Nachtdienst vom Vortag existiert, gehören die SLEEP-Einträge zu diesem!
          if (!hasExistingNightShiftOnNextDay) {
            const nextDaySleepEntries = entries.filter(e => {
              const entryDate = new Date(e.date)
              if (!isSameDay(entryDate, nextDay) || e.entryType !== 'SLEEP') return false
              // Nur SLEEP-Einträge, die um 00:00 beginnen (gehören zu diesem Nachtdienst)
              const startTime = format(parseISO(e.startTime), 'HH:mm')
              return startTime === '00:00' || startTime.startsWith('00:00')
            })
            
            // Lösche SLEEP-Einträge vom Folgetag nur wenn kein Nachtdienst vom Vortag existiert
            for (const entry of nextDaySleepEntries) {
              try {
                const deleteResponse = await fetch(`/api/employee/time-entries/${entry.id}`, {
                  method: 'DELETE',
                })
                if (!deleteResponse.ok) {
                  console.error('Fehler beim Löschen des SLEEP-Eintrags:', entry.id, deleteResponse.status)
                }
              } catch (error) {
                console.error('Fehler beim Löschen des SLEEP-Eintrags:', error)
              }
            }
          }

          // Warte kurz, damit die Löschungen abgeschlossen sind
          await new Promise(resolve => setTimeout(resolve, 100))

          // Prüfe ob SLEEP-Eintrag für aktuellen Tag (23:01-23:59:59) bereits existiert
          // WICHTIG: Lade die Einträge direkt vom Server, nicht nur aus dem State
          let currentDayEntries: TimeEntry[] = []
          try {
            const currentDayResponse = await fetch(`/api/employee/time-entries?date=${dateStr}`)
            if (currentDayResponse.ok) {
              currentDayEntries = await currentDayResponse.json()
            }
          } catch (error) {
            console.error('Fehler beim Laden der Einträge vom aktuellen Tag:', error)
            currentDayEntries = entries.filter(e => {
              const entryDate = new Date(e.date)
              return isSameDay(entryDate, selectedDate)
            })
          }
          
          const existingSleepOnCurrentDay = currentDayEntries.some(e => {
            if (e.entryType !== 'SLEEP' || !e.endTime) return false
            const startTime = format(parseISO(e.startTime), 'HH:mm')
            return startTime === '23:01' || startTime.startsWith('23:01')
          })
          
          if (!existingSleepOnCurrentDay) {
            // Erstelle SLEEP-Eintrag für aktuellen Tag (23:01-23:59:59 = 59 Minuten)
            console.log('Erstelle SLEEP-Eintrag für aktuellen Tag:', dateStr, '23:01-23:59:59')
            const sleepResponse1 = await fetch('/api/employee/time-entries', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                date: dateStr,
                startTime: new Date(`${dateStr}T23:01:00`).toISOString(),
                endTime: new Date(`${dateStr}T23:59:59`).toISOString(),
                breakMinutes: 0,
                entryType: 'SLEEP',
              }),
            })
            
            if (!sleepResponse1.ok) {
              const errorData = await sleepResponse1.json().catch(() => ({ error: 'Unbekannter Fehler' }))
              console.error('Fehler beim Erstellen des SLEEP-Eintrags (aktueller Tag):', errorData, sleepResponse1.status)
              setError(`Fehler beim Speichern: SLEEP-Eintrag für aktuellen Tag konnte nicht erstellt werden: ${errorData.error || 'Unbekannter Fehler'}`)
              // WICHTIG: Bei Fehler abbrechen, damit nicht teilweise gespeichert wird
              return
            } else {
              const createdEntry1 = await sleepResponse1.json()
              console.log('SLEEP-Eintrag für aktuellen Tag erfolgreich erstellt:', createdEntry1.id)
              // Füge den erstellten Eintrag sofort zum State hinzu
              setEntries(prevEntries => {
                const exists = prevEntries.some(e => e.id === createdEntry1.id)
                if (exists) return prevEntries
                return [...prevEntries, createdEntry1]
              })
            }
          } else {
            console.log('SLEEP-Eintrag für aktuellen Tag existiert bereits, wird nicht erstellt')
          }

          // Warte kurz, damit der erste Eintrag verarbeitet ist
          await new Promise(resolve => setTimeout(resolve, 100))

          // Erstelle SLEEP-Eintrag für Folgetag (00:00-06:00 = 6 Stunden) NUR wenn noch keiner existiert
          // Wenn bereits ein Nachtdienst vom Vortag existiert, sind die SLEEP-Einträge bereits vorhanden
          const existingSleepOnNextDay = nextDayEntries.some(e => {
            if (e.entryType !== 'SLEEP' || !e.endTime) return false
            const startTime = format(parseISO(e.startTime), 'HH:mm')
            return startTime === '00:00' || startTime.startsWith('00:00')
          })
          
          if (!existingSleepOnNextDay) {
            console.log('Erstelle SLEEP-Eintrag für Folgetag:', nextDateStr, '00:00-06:00')
            const sleepResponse2 = await fetch('/api/employee/time-entries', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                date: nextDateStr,
                startTime: new Date(`${nextDateStr}T00:00:00`).toISOString(),
                endTime: new Date(`${nextDateStr}T06:00:00`).toISOString(),
                breakMinutes: 0,
                entryType: 'SLEEP',
              }),
            })
            
            if (!sleepResponse2.ok) {
              const errorData = await sleepResponse2.json().catch(() => ({ error: 'Unbekannter Fehler' }))
              console.error('Fehler beim Erstellen des SLEEP-Eintrags (Folgetag):', errorData, sleepResponse2.status)
              setError(`Fehler beim Speichern: SLEEP-Eintrag für Folgetag konnte nicht erstellt werden: ${errorData.error || 'Unbekannter Fehler'}`)
              // WICHTIG: Bei Fehler abbrechen, damit nicht teilweise gespeichert wird
              return
            } else {
              const createdEntry2 = await sleepResponse2.json()
              console.log('SLEEP-Eintrag für Folgetag erfolgreich erstellt:', createdEntry2.id)
              // Füge den erstellten Eintrag sofort zum State hinzu
              setEntries(prevEntries => {
                const exists = prevEntries.some(e => e.id === createdEntry2.id)
                if (exists) return prevEntries
                return [...prevEntries, createdEntry2]
              })
            }
          } else {
            console.log('SLEEP-Eintrag für Folgetag existiert bereits (vom Vortag-Nachtdienst), wird nicht erstellt')
          }
        } catch (error) {
          console.error('Fehler beim Erstellen der SLEEP-Einträge:', error)
          let errorMessage = 'Fehler beim Speichern: Ein Fehler ist beim Erstellen der Schlafstunden aufgetreten'
          if (error instanceof Error) {
            errorMessage += `: ${error.message}`
            console.error('Fehlerdetails:', {
              message: error.message,
              stack: error.stack,
              name: error.name
            })
          }
          setError(errorMessage)
          // WICHTIG: Bei Fehler abbrechen
          return
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
            await fetch(`/api/employee/time-entries/${existingInterruption.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sleepInterruptionMinutes: totalInterruptionMinutes,
              }),
            })
          } else {
            // Erstelle neuen Eintrag für den Folgetag
            await fetch('/api/employee/time-entries', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
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
            await fetch(`/api/employee/time-entries/${existingInterruption.id}`, {
              method: 'DELETE',
            })
          }
        }
      }

      // WICHTIG: Lade Einträge neu - zuerst loadEntriesForMonth (für alle Einträge im Monat),
      // dann loadEntriesForDate (für spezifische Einträge des ausgewählten Tages)
      // damit die Stunden vom Folgetag korrekt angezeigt werden und isNightShift korrekt gesetzt wird
      // Bei Nachtdienst: Lade auch Einträge vom Vortag und Folgetag, um sicherzustellen, dass alle Einträge geladen sind
      
      // Warte zuerst, damit alle API-Aufrufe abgeschlossen sind
      await new Promise(resolve => setTimeout(resolve, 800))
      
      // Lade zuerst den gesamten Monat (inkl. Folgetage)
      await loadEntriesForMonth()
      await new Promise(resolve => setTimeout(resolve, 400))
      
      // Bei Nachtdienst: Lade auch Einträge vom Vortag und Folgetag explizit
      if (isNightShift) {
        const previousDay = subDays(selectedDate, 1)
        const nextDay = addDays(selectedDate, 1)
        await Promise.all([
          loadEntriesForDate(previousDay),
          loadEntriesForDate(selectedDate),
          loadEntriesForDate(nextDay)
        ])
        await new Promise(resolve => setTimeout(resolve, 400))
      } else {
        // Auch bei normalen Einträgen: Lade den ausgewählten Tag
        await loadEntriesForDate(selectedDate)
        await new Promise(resolve => setTimeout(resolve, 300))
      }
      
      // Finale Überprüfung: Lade nochmal den ausgewählten Tag, um sicherzustellen, dass alle Einträge geladen sind
      await loadEntriesForDate(selectedDate)
      await new Promise(resolve => setTimeout(resolve, 300))
      
      // WICHTIG: Bei Nachtdienst: Stelle sicher, dass workBlocks mit den gespeicherten IDs aktualisiert werden
      // Die loadEntriesForDate Funktion sollte das bereits tun, aber wir stellen es explizit sicher
      if (isNightShift) {
        // Warte nochmal kurz, damit loadEntriesForDate abgeschlossen ist
        await new Promise(resolve => setTimeout(resolve, 200))
        
        // Hole die gespeicherten Einträge aus dem entries State
        const savedWorkEntries = entries.filter(e => {
          const entryDate = new Date(e.date)
          const isCurrentDay = isSameDay(entryDate, selectedDate)
          const isNextDay = isSameDay(entryDate, addDays(selectedDate, 1))
          
          if (!isCurrentDay && !isNextDay) return false
          if (e.entryType !== 'WORK') return false
          
          const startTime = format(parseISO(e.startTime), 'HH:mm')
          const endTime = e.endTime ? format(parseISO(e.endTime), 'HH:mm') : null
          
          // Block 1: 19:00-23:00 am aktuellen Tag
          const isBlock1 = isCurrentDay && startTime === '19:00' && endTime === '23:00'
          // Block 2: 06:01-07:xx am Folgetag
          const isBlock2 = isNextDay && (startTime === '06:01' || startTime.startsWith('06:01'))
          
          return isBlock1 || isBlock2
        })
        
        if (savedWorkEntries.length >= 2) {
          // Konvertiere gespeicherte Einträge zu workBlocks
          const updatedWorkBlocks: WorkBlock[] = savedWorkEntries.map(e => {
            const entryDate = new Date(e.date)
            const isNextDay = isSameDay(entryDate, addDays(selectedDate, 1))
            const startTime = format(parseISO(e.startTime), 'HH:mm')
            const endTime = e.endTime ? format(parseISO(e.endTime), 'HH:mm') : null
            return {
              id: e.id, // WICHTIG: Verwende die gespeicherte ID, nicht "new-"
              startTime,
              endTime,
              entryType: e.entryType,
            }
          }).sort((a, b) => {
            // Sortiere: Block 1 (19:00) zuerst, dann Block 2 (06:01)
            if (a.startTime === '19:00' || a.startTime.startsWith('19:')) return -1
            if (b.startTime === '19:00' || b.startTime.startsWith('19:')) return 1
            return 0
          })
          
          console.log('Aktualisiere workBlocks mit gespeicherten IDs:', updatedWorkBlocks)
          setWorkBlocks(updatedWorkBlocks)
        }
      }
      
      console.log('Alle Einträge erfolgreich gespeichert und geladen')
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

  const handleSendMessage = async () => {
    if (!messageTopic || !messageText.trim()) {
      setMessageError('Bitte wählen Sie ein Thema aus und geben Sie eine Nachricht ein')
      return
    }

    setMessageLoading(true)
    setMessageError('')

    try {
      const response = await fetch('/api/employee/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic: messageTopic,
          message: messageText.trim(),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        const errorMessage = errorData.details || errorData.error || 'Fehler beim Senden der Nachricht'
        throw new Error(errorMessage)
      }

      // Erfolg - Dialog schließen und Formular zurücksetzen
      setShowMessageDialog(false)
      setMessageTopic('')
      setMessageText('')
      alert('Nachricht erfolgreich gesendet')
    } catch (error) {
      console.error('Fehler beim Senden der Nachricht:', error)
      setMessageError(error instanceof Error ? error.message : 'Ein Fehler ist aufgetreten')
    } finally {
      setMessageLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex items-center justify-between">
          <Button variant="outline" onClick={() => router.push('/employee/dashboard')}>
            ← Zurück zum Dashboard
          </Button>
          <Button onClick={() => setShowMessageDialog(true)} variant="outline">
            <MessageSquare className="mr-2 h-4 w-4" />
            Mitteilung an Leitung
          </Button>
        </div>

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
                  const isEditable = isDateEditableForEmployee(day, false)

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
                      title={!isEditable ? 'Dieses Datum kann nicht mehr bearbeitet werden' : format(day, 'EEEE, d. MMMM yyyy', { locale: de })}
                    >
                      <div className="text-sm font-medium mb-1">
                        {format(day, 'd')}
                      </div>
                      {(() => {
                        const vacation = getVacationForDate(day)
                        const training = getTrainingForDate(day)
                        const sickness = getSicknessForDate(day)
                        const hasEntries = dayEntries.length > 0 || vacation || training || sickness
                        return hasEntries && (
                          <div className="text-xs">
                            {dayEntries.length > 0 && (
                              <div className="text-gray-600">
                                {totalHours.toFixed(1)}h
                                {surchargeHours > 0 && (
                                  <span className="text-blue-600 ml-0.5 font-medium">
                                    (+{surchargeHours.toFixed(1)}h)
                                  </span>
                                )}
                              </div>
                            )}
                            {vacation && (
                              <div className="text-blue-600 font-medium">
                                Ferien: {vacation.hours.toFixed(1)}h
                              </div>
                            )}
                            {training && (
                              <div className="text-green-600 font-medium">
                                Weiterbildung: {training.hours.toFixed(1)}h
                              </div>
                            )}
                            {sickness && (
                              <div className="text-red-600 font-medium">
                                Krankheit: {sickness.hours.toFixed(1)}h
                              </div>
                            )}
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
                            {(dayEntries.some(e => e.entryType === 'SICK') || sickness) && (
                              <div className="text-red-600 font-medium mt-0.5">K</div>
                            )}
                            {(dayEntries.some(e => e.entryType === 'VACATION') || vacation) && (
                              <div className="text-blue-600 font-medium mt-0.5">F</div>
                            )}
                            {(dayEntries.some(e => e.entryType === 'TRAINING') || training) && (
                              <div className="text-green-600 font-medium mt-0.5">W</div>
                            )}
                          </div>
                        )
                      })()}
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
                        // WICHTIG: Lade immer Einträge vom Server, um sicherzustellen, dass wir die neuesten Daten haben
                        const dateStr = format(selectedDate, 'yyyy-MM-dd')
                        const nextDateStr = format(addDays(selectedDate, 1), 'yyyy-MM-dd')
                        
                        console.log('Lade Einträge für:', { dateStr, nextDateStr })
                        
                        const [currentResponse, nextResponse] = await Promise.all([
                          fetch(`/api/employee/time-entries?date=${dateStr}`),
                          fetch(`/api/employee/time-entries?date=${nextDateStr}`)
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
                        
                        console.log('Checkbox aktiviert - geladene Daten:', {
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
                        
                        // WICHTIG: Füge auch die Einträge zum entries State hinzu, damit sie für Stundenberechnung verfügbar sind
                        setEntries(prevEntries => {
                          const filtered = prevEntries.filter(e => {
                            const entryDate = new Date(e.date)
                            return !isSameDay(entryDate, selectedDate) && !isSameDay(entryDate, addDays(selectedDate, 1))
                          })
                          return [...filtered, ...currentData, ...nextData]
                        })
                        
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
                        
                        // Prüfe auch bereits geladene Blöcke in workBlocks
                        const existingBlocks = workBlocks.filter(b => !b.id.startsWith('new-'))
                        const hasExistingBlock1 = existingBlocks.some(b => {
                          const startMatch = b.startTime === '19:00' || (b.startTime && b.startTime.startsWith('19:'))
                          const endMatch = b.endTime === '23:00' || (b.endTime && b.endTime.startsWith('23:'))
                          return startMatch && endMatch
                        })
                        const hasExistingBlock2 = existingBlocks.some(b => {
                          return b.startTime === '06:01' || (b.startTime && b.startTime.startsWith('06:01'))
                        })
                        
                        console.log('Prüfe gespeicherte Blöcke:', {
                          existingBlocksCount: existingBlocks.length,
                          hasExistingBlock1,
                          hasExistingBlock2,
                          allBlocksCount: allBlocks.length,
                          allBlocks: allBlocks.map(b => ({ id: b.id, startTime: b.startTime, endTime: b.endTime })),
                          currentDataCount: currentData.length,
                          nextDataCount: nextData.length,
                          hasBlock1,
                          hasBlock2
                        })
                        
                        if ((hasExistingBlock1 && hasExistingBlock2) || (hasBlock1 && hasBlock2)) {
                          // Bereits gespeicherte Blöcke vorhanden - verwende diese
                          const blocksToUse = (hasBlock1 && hasBlock2) ? allBlocks : existingBlocks
                          console.log('Verwende bereits gespeicherte Nachtdienst-Blöcke:', blocksToUse)
                          setIsNightShift(true)
                          setWorkBlocks(blocksToUse)
                        } else {
                          // Keine gespeicherten Blöcke - erstelle neue
                          console.log('Erstelle neue Nachtdienst-Blöcke (hasBlock1:', hasBlock1, 'hasBlock2:', hasBlock2, ')')
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
              {!isDateEditableForEmployee(selectedDate, false) && (
                <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <div className="flex items-start">
                    <AlertCircle className="h-5 w-5 text-yellow-600 mr-2 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-yellow-900">
                        Datum nicht mehr bearbeitbar
                      </p>
                      <p className="text-xs text-yellow-700 mt-1">
                        Rückwirkende Zeiterfassung ist nur für die letzten 2 Tage möglich. Bitte wenden Sie sich an den Administrator für Änderungen.
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
              
              {!isNightShift && (
                <div className="mb-4 space-y-2">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={addWorkBlock}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Block hinzufügen
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={addBlockWithCurrentTime}
                  >
                    <Clock className="mr-2 h-4 w-4" />
                    Block mit aktueller Zeit hinzufügen
                  </Button>
                </div>
              )}

              <div className="space-y-4">
                {/* Zeige Blöcke nur wenn Nachtdienst aktiviert ist ODER wenn es normale Blöcke sind */}
                {workBlocks
                  .filter(block => {
                    // Wenn Nachtdienst aktiviert ist, zeige alle Blöcke
                    if (isNightShift) return true
                    // Wenn Nachtdienst nicht aktiviert ist, zeige nur normale Blöcke (keine Nachtdienst-Blöcke)
                    const isNightShiftBlock = (block.startTime === '19:00' && block.endTime === '23:00') || 
                                             (block.startTime === '06:01')
                    return !isNightShiftBlock
                  })
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
                        {/* Lösch-Button: Immer anzeigen wenn Datum bearbeitbar ist */}
                        {(() => {
                          const isEditable = isDateEditableForEmployee(selectedDate, false)
                          const isNewBlock = block.id.startsWith('new-')
                          
                          console.log('Lösch-Button Prüfung:', {
                            blockId: block.id,
                            isNewBlock,
                            isEditable,
                            selectedDate: format(selectedDate, 'yyyy-MM-dd'),
                            startTime: block.startTime,
                            endTime: block.endTime,
                            isNightShift,
                            index
                          })
                          
                          // Wenn Datum nicht bearbeitbar, kein Lösch-Button
                          if (!isEditable) {
                            console.log('Datum nicht bearbeitbar, kein Lösch-Button')
                            return null
                          }
                          
                          // Für neue Blöcke (noch nicht gespeichert): Entfernen aus Formular
                          if (isNewBlock) {
                            // Bei Nachtdienst: Standard-Blöcke (19:00-23:00 und 06:01-07:00) nicht löschbar
                            if (isNightShift && (
                              (block.startTime === '19:00' && block.endTime === '23:00') ||
                              (block.startTime === '06:01' && block.endTime === '07:00')
                            )) {
                              return null
                            }
                            // Alle anderen neuen Blöcke können entfernt werden
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
                          
                          // Für gespeicherte Blöcke: IMMER Lösch-Button anzeigen
                          // Die API-Route prüft selbst, ob beide Tage (bei Nachtdienst) bearbeitbar sind
                          const deleteTitle = isNightShift 
                            ? "Eintrag löschen (beide Nachtdienst-Blöcke werden gelöscht, falls beide Tage bearbeitbar sind)"
                            : "Eintrag löschen"
                          
                          console.log('Zeige Lösch-Button für gespeicherten Block')
                          
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
                        <div className={(isNightShift && index === 0) || (isNightShift && index === 1) ? "grid grid-cols-1 gap-3" : "grid grid-cols-2 gap-3"}>
                          {/* Startzeit-Feld nur anzeigen wenn nicht zweiter Block im Nachtdienst */}
                          {!(isNightShift && index === 1) && (
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
                          )}
                          {/* Endzeit-Feld nur anzeigen wenn nicht erster Block im Nachtdienst */}
                          {!(isNightShift && index === 0) && (
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
                          )}
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

                {(() => {
                  // Berechne die angezeigten Blöcke (gefiltert)
                  const displayedBlocks = workBlocks.filter(block => {
                    if (isNightShift) return true
                    const isNightShiftBlock = (block.startTime === '19:00' && block.endTime === '23:00') || 
                                             (block.startTime === '06:01')
                    return !isNightShiftBlock
                  })
                  
                  // Prüfe disabled-Bedingungen
                  const isDateNotEditable = !isDateEditableForEmployee(selectedDate, false)
                  
                  // Bei Nachtdienst: Nur prüfen ob Datum bearbeitbar ist
                  // Die Standard-Validierungen (6-Stunden-Regel, Pausen) gelten nicht für Nachtdienst
                  if (isNightShift) {
                    return (
                      <Button
                        className="w-full"
                        onClick={handleSave}
                        disabled={isDateNotEditable}
                        title={isDateNotEditable ? 'Datum nicht bearbeitbar' : ''}
                      >
                        Speichern
                      </Button>
                    )
                  }
                  
                  // Für normale Arbeitszeiterfassung: Alle Validierungen prüfen
                  const hasIncompleteBlocks = displayedBlocks.some(b => !b.startTime || !b.endTime)
                  const hasBlocksOver6Hours = displayedBlocks.some(b => {
                    if (!b.startTime || !b.endTime) return false
                    const hours = calculateBlockHours(b.startTime, b.endTime)
                    return hours > 6
                  })
                  
                  const totalHours = calculateTotalWorkHours(displayedBlocks)
                  let hasBreakTooShort = false
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
                  
                  const isDisabled = isDateNotEditable || hasIncompleteBlocks || hasBlocksOver6Hours || hasBreakTooShort
                  
                  return displayedBlocks.length > 0 && (
                    <Button
                      className="w-full"
                      onClick={handleSave}
                      disabled={isDisabled}
                      title={isDisabled ? 
                        (isDateNotEditable ? 'Datum nicht bearbeitbar' :
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
                        {(() => {
                          const vacation = getVacationForDate(selectedDate)
                          const training = getTrainingForDate(selectedDate)
                          const sickness = getSicknessForDate(selectedDate)
                          
                          if (!vacation && !training && !sickness) {
                            return null
                          }
                          
                          return (
                            <>
                              {vacation && (
                                <div className="flex justify-between items-center border-t pt-2 mt-2">
                                  <span className="text-sm text-gray-600">Ferien (Dienstplan):</span>
                                  <span className="font-medium text-blue-600">
                                    {vacation.hours.toFixed(1)}h
                                  </span>
                                </div>
                              )}
                              {training && (
                                <div className="flex justify-between items-center border-t pt-2 mt-2">
                                  <span className="text-sm text-gray-600">Weiterbildung (Dienstplan):</span>
                                  <span className="font-medium text-green-600">
                                    {training.hours.toFixed(1)}h
                                  </span>
                                </div>
                              )}
                              {sickness && (
                                <div className="flex justify-between items-center border-t pt-2 mt-2">
                                  <span className="text-sm text-gray-600">Krankheit (Dienstplan):</span>
                                  <span className="font-medium text-red-600">
                                    {sickness.hours.toFixed(1)}h
                                  </span>
                                </div>
                              )}
                            </>
                          )
                        })()}
                      </CardContent>
                    </Card>
                  )
                })()}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Mitteilung an Leitung Dialog */}
      <Dialog open={showMessageDialog} onOpenChange={setShowMessageDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Mitteilung an Leitung</DialogTitle>
            <DialogDescription>
              Senden Sie eine Nachricht an die Leitung
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="topic">Thema</Label>
              <Select value={messageTopic} onValueChange={setMessageTopic}>
                <SelectTrigger id="topic">
                  <SelectValue placeholder="Thema auswählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FERIENANTRAG">Ferienantrag</SelectItem>
                  <SelectItem value="FREIWUNSCH">Freiwunsch</SelectItem>
                  <SelectItem value="ZEITERFASSUNG">Nachträgliche Zeiterfassung</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Nachricht</Label>
              <Textarea
                id="message"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Ihre Nachricht an die Leitung..."
                rows={6}
              />
            </div>
            {messageError && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
                {messageError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMessageDialog(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSendMessage} disabled={messageLoading}>
              {messageLoading ? 'Wird gesendet...' : 'Mitteilung absenden'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
