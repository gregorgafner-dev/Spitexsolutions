'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Sun, Moon } from 'lucide-react'
import { POOL_AVAILABLE_YEARS, getHolidayMap, POOL_SHIFTS, type PoolShiftId } from '@/lib/pool/holidays-zh'

const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

const WEEKDAY_NAMES = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

function pad2(n: number) {
  return String(n).padStart(2, '0')
}
function isoDate(y: number, m: number, d: number) {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`
}

/** Tage des Monats inkl. führender Tage aus dem Vormonat, sodass Woche Mo-So beginnt. */
function buildMonthGrid(year: number, monthIndex: number) {
  const firstOfMonth = new Date(year, monthIndex, 1)
  const lastOfMonth = new Date(year, monthIndex + 1, 0)
  const daysInMonth = lastOfMonth.getDate()

  // JS getDay(): 0 = So, 1 = Mo, ..., 6 = Sa. Wir wollen Mo = 0.
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7

  const cells: Array<{ day: number; inMonth: boolean; date: Date; iso: string }> = []
  // Führende Vor-Monat-Tage
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const d = new Date(year, monthIndex, -i)
    cells.push({
      day: d.getDate(),
      inMonth: false,
      date: d,
      iso: isoDate(d.getFullYear(), d.getMonth(), d.getDate()),
    })
  }
  // Aktuelle Monatstage
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      day,
      inMonth: true,
      date: new Date(year, monthIndex, day),
      iso: isoDate(year, monthIndex, day),
    })
  }
  // Trailing-Tage bis Wochenende
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date
    const d = new Date(last)
    d.setDate(last.getDate() + 1)
    cells.push({
      day: d.getDate(),
      inMonth: false,
      date: d,
      iso: isoDate(d.getFullYear(), d.getMonth(), d.getDate()),
    })
  }
  return cells
}

type AvailabilityByDate = Record<string, Set<PoolShiftId>>
type BookingsByDate = Record<string, Set<PoolShiftId>>

export type PoolMonthCalendarProps = {
  initialYear?: number
  initialMonth?: number
  /** Optional: Verfügbarkeit pro Datum/Schicht (z.B. eingetragene Wünsche). */
  availability?: AvailabilityByDate
  /** Optional: bereits gebuchte Schichten (überschreiben Verfügbarkeit visuell). */
  bookings?: BookingsByDate
  /** Optional: Klick-Handler pro Tag (für späteres Eintragen/Buchen). */
  onDayClick?: (iso: string) => void
  /** Optional: wird bei jedem Monatswechsel mit (year, monthIndex 0-11) aufgerufen. */
  onMonthChange?: (year: number, monthIndex: number) => void
}

export default function PoolMonthCalendar({
  initialYear,
  initialMonth,
  availability = {},
  bookings = {},
  onDayClick,
  onMonthChange,
}: PoolMonthCalendarProps) {
  const today = new Date()
  const [year, setYear] = useState<number>(initialYear ?? today.getFullYear())
  const [monthIndex, setMonthIndex] = useState<number>(initialMonth ?? today.getMonth())

  useEffect(() => {
    onMonthChange?.(year, monthIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, monthIndex])

  const holidayMap = useMemo(() => getHolidayMap(year), [year])
  const cells = useMemo(() => buildMonthGrid(year, monthIndex), [year, monthIndex])

  function prevMonth() {
    if (monthIndex === 0) {
      const newYear = year - 1
      if (!POOL_AVAILABLE_YEARS.includes(newYear)) return
      setYear(newYear)
      setMonthIndex(11)
    } else {
      setMonthIndex(monthIndex - 1)
    }
  }
  function nextMonth() {
    if (monthIndex === 11) {
      const newYear = year + 1
      if (!POOL_AVAILABLE_YEARS.includes(newYear)) return
      setYear(newYear)
      setMonthIndex(0)
    } else {
      setMonthIndex(monthIndex + 1)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      {/* Header mit Navigation */}
      <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-4 py-3">
        <button
          onClick={prevMonth}
          className="rounded-lg p-2 text-gray-700 hover:bg-gray-100"
          aria-label="Vorheriger Monat"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900">
            {MONTH_NAMES[monthIndex]} {year}
          </h2>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
            aria-label="Jahr wählen"
          >
            {POOL_AVAILABLE_YEARS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <button
          onClick={nextMonth}
          className="rounded-lg p-2 text-gray-700 hover:bg-gray-100"
          aria-label="Nächster Monat"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Wochentag-Header */}
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-600">
        {WEEKDAY_NAMES.map((d, i) => (
          <div
            key={d}
            className={`px-2 py-2 text-center ${i >= 5 ? 'text-red-600' : ''}`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Tage-Grid */}
      <div className="grid grid-cols-7">
        {cells.map((cell, idx) => {
          const weekday = (cell.date.getDay() + 6) % 7
          const isWeekend = weekday >= 5
          const holiday = holidayMap.get(cell.iso)
          const isToday =
            cell.date.getFullYear() === today.getFullYear() &&
            cell.date.getMonth() === today.getMonth() &&
            cell.date.getDate() === today.getDate()

          const avail = availability[cell.iso] ?? new Set<PoolShiftId>()
          const booked = bookings[cell.iso] ?? new Set<PoolShiftId>()

          const baseBg = !cell.inMonth
            ? 'bg-gray-50 text-gray-400'
            : holiday
              ? 'bg-amber-50'
              : isWeekend
                ? 'bg-red-50'
                : 'bg-white'

          return (
            <button
              key={idx}
              type="button"
              onClick={() => cell.inMonth && onDayClick?.(cell.iso)}
              className={`relative flex min-h-[88px] flex-col items-stretch border-b border-r border-gray-100 p-1.5 text-left transition-colors hover:bg-blue-50 ${baseBg}`}
              disabled={!cell.inMonth}
            >
              <div className="flex items-start justify-between">
                <span
                  className={`text-sm ${isToday ? 'inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 font-semibold text-white' : 'font-medium text-gray-900'} ${!cell.inMonth ? 'text-gray-400' : ''}`}
                >
                  {cell.day}
                </span>
                {holiday && cell.inMonth && (
                  <span className="ml-1 truncate text-[10px] font-medium text-amber-700" title={holiday.name}>
                    {holiday.name}
                  </span>
                )}
              </div>

              {/* Shift-Slots: Frühdienst / Spätdienst */}
              {cell.inMonth && (
                <div className="mt-auto flex flex-col gap-1">
                  <ShiftBadge
                    shift="EARLY"
                    isAvailable={avail.has('EARLY')}
                    isBooked={booked.has('EARLY')}
                  />
                  <ShiftBadge
                    shift="LATE"
                    isAvailable={avail.has('LATE')}
                    isBooked={booked.has('LATE')}
                  />
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Legende */}
      <div className="flex flex-wrap items-center gap-4 border-t border-gray-200 px-4 py-3 text-xs text-gray-600">
        <span className="inline-flex items-center gap-1.5">
          <Sun className="h-3.5 w-3.5 text-amber-500" /> Frühdienst (F)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Moon className="h-3.5 w-3.5 text-indigo-500" /> Spätdienst (S)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-red-50 ring-1 ring-red-200" /> Wochenende
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-amber-50 ring-1 ring-amber-200" /> Feiertag ZH
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-emerald-200" /> verfügbar
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-blue-600" /> gebucht
        </span>
      </div>
    </div>
  )
}

function ShiftBadge({
  shift,
  isAvailable,
  isBooked,
}: {
  shift: PoolShiftId
  isAvailable: boolean
  isBooked: boolean
}) {
  const def = POOL_SHIFTS[shift]
  const Icon = shift === 'EARLY' ? Sun : Moon
  const iconColor = shift === 'EARLY' ? 'text-amber-500' : 'text-indigo-500'

  let style = 'border-gray-200 bg-white text-gray-400'
  if (isBooked) style = 'border-blue-600 bg-blue-600 text-white'
  else if (isAvailable) style = 'border-emerald-300 bg-emerald-100 text-emerald-800'

  return (
    <div
      className={`flex items-center justify-between rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none ${style}`}
      title={`${def.label}${isBooked ? ' (gebucht)' : isAvailable ? ' (verfügbar)' : ''}`}
    >
      <span className="inline-flex items-center gap-1">
        <Icon className={`h-3 w-3 ${isBooked ? 'text-white' : iconColor}`} />
        {def.short}
      </span>
      {isBooked && <span className="text-[9px]">gebucht</span>}
    </div>
  )
}
