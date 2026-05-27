'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Plus, X, Sun, Moon, AlertCircle, CheckCircle2, Users, CalendarDays, TableProperties } from 'lucide-react'
import PoolPlannerRoster from '@/components/pool/admin/PoolPlannerRoster'
import { getQualificationShort } from '@/lib/pool/qualifications'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { POOL_AVAILABLE_YEARS, getHolidayMap } from '@/lib/pool/holidays-zh'
import { POOL_TEAMS, POOL_TEAM_IDS, type PoolTeamId } from '@/lib/pool/teams'
import {
  POOL_QUALIFICATIONS,
  POOL_QUALIFICATION_IDS,
  type PoolQualificationId,
} from '@/lib/pool/qualifications'

const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]
const WEEKDAY_NAMES = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

type ShiftRequestApi = {
  id: string
  date: string
  shift: 'EARLY' | 'LATE'
  team: PoolTeamId
  teamLabel: string
  status: 'OPEN' | 'FILLED' | 'CANCELLED'
  message: string | null
  allowedQualifications: PoolQualificationId[]
  allowedQualificationLabels: string[]
  filledByPoolUser: { id: string; firstName: string; lastName: string } | null
  createdAt: string
}

type PoolUserMini = {
  id: string
  firstName: string
  lastName: string
  qualification: string | null
  qualificationShort: string | null
}

type BookingApi = {
  id: string
  date: string
  shift: 'EARLY' | 'LATE'
  team: PoolTeamId
  teamLabel: string
  shiftRequestId: string | null
  poolUser: PoolUserMini
}

type AvailabilityApi = {
  id: string
  date: string
  shift: 'EARLY' | 'LATE'
  poolUser: PoolUserMini
  lockedByBooking: boolean
}

function pad2(n: number) { return String(n).padStart(2, '0') }
function iso(y: number, m: number, d: number) { return `${y}-${pad2(m + 1)}-${pad2(d)}` }

function buildMonthGrid(year: number, monthIndex: number) {
  const firstOfMonth = new Date(year, monthIndex, 1)
  const lastOfMonth = new Date(year, monthIndex + 1, 0)
  const daysInMonth = lastOfMonth.getDate()
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7

  const cells: Array<{ day: number; inMonth: boolean; date: Date; iso: string }> = []
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const d = new Date(year, monthIndex, -i)
    cells.push({ day: d.getDate(), inMonth: false, date: d, iso: iso(d.getFullYear(), d.getMonth(), d.getDate()) })
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, inMonth: true, date: new Date(year, monthIndex, day), iso: iso(year, monthIndex, day) })
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date
    const d = new Date(last)
    d.setDate(last.getDate() + 1)
    cells.push({ day: d.getDate(), inMonth: false, date: d, iso: iso(d.getFullYear(), d.getMonth(), d.getDate()) })
  }
  return cells
}

function formatDayLong(isoStr: string): string {
  const [y, m, d] = isoStr.split('-').map((s) => parseInt(s, 10))
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

type MemberListItem = {
  id: string
  firstName: string
  lastName: string
  qualificationShort: string | null
  role: 'MEMBER' | 'PLANNER'
  active: boolean
}

export default function PoolPlannerCalendar() {
  const today = new Date()
  const [year, setYear] = useState<number>(today.getFullYear())
  const [monthIndex, setMonthIndex] = useState<number>(today.getMonth())
  const [viewMode, setViewMode] = useState<'roster' | 'calendar'>('roster')
  const [requests, setRequests] = useState<ShiftRequestApi[]>([])
  const [bookings, setBookings] = useState<BookingApi[]>([])
  const [availabilities, setAvailabilities] = useState<AvailabilityApi[]>([])
  const [members, setMembers] = useState<MemberListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [openDay, setOpenDay] = useState<string | null>(null)

  const holidayMap = useMemo(() => getHolidayMap(year), [year])
  const cells = useMemo(() => buildMonthGrid(year, monthIndex), [year, monthIndex])

  const monthStart = useMemo(() => iso(year, monthIndex, 1), [year, monthIndex])
  const monthEnd = useMemo(() => {
    const last = new Date(year, monthIndex + 1, 0)
    return iso(last.getFullYear(), last.getMonth(), last.getDate())
  }, [year, monthIndex])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ dateFrom: monthStart, dateTo: monthEnd })
      const res = await fetch(`/api/pool/planner/calendar?${params.toString()}`, { cache: 'no-store' })
      if (res.ok) {
        const d = await res.json()
        setRequests((d.requests ?? []) as ShiftRequestApi[])
        setBookings((d.bookings ?? []) as BookingApi[])
        setAvailabilities((d.availabilities ?? []) as AvailabilityApi[])
      } else {
        setRequests([]); setBookings([]); setAvailabilities([])
      }
    } finally {
      setLoading(false)
    }
  }, [monthStart, monthEnd])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    fetch('/api/pool/members', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const list = (d.members ?? []) as Array<{
          id: string
          firstName: string
          lastName: string
          role: 'MEMBER' | 'PLANNER'
          active: boolean
          qualification: string | null
        }>
        setMembers(
          list
            .filter((m) => m.active && m.role === 'MEMBER')
            .map((m) => ({
              id: m.id,
              firstName: m.firstName,
              lastName: m.lastName,
              role: m.role,
              active: m.active,
              qualificationShort: getQualificationShort(m.qualification),
            }))
        )
      })
      .catch(() => setMembers([]))
  }, [])

  // Aggregierte Sicht pro Tag:
  //  - open: offene Anfragen
  //  - filled: gefüllte Anfragen (vom Member übernommen) -> als Buchung sichtbar
  //  - directBookings: Buchungen ohne zugehörige Anfrage (Direkt vom Planer)
  //  - availabilities: Verfügbarkeiten, gruppiert nach Schicht
  const byDay = useMemo(() => {
    type DayBucket = {
      open: ShiftRequestApi[]
      bookings: BookingApi[] // ALLE Buchungen (auch aus FILLED-Requests)
      availEarly: AvailabilityApi[]
      availLate: AvailabilityApi[]
    }
    const map = new Map<string, DayBucket>()
    function entry(iso: string): DayBucket {
      let e = map.get(iso)
      if (!e) {
        e = { open: [], bookings: [], availEarly: [], availLate: [] }
        map.set(iso, e)
      }
      return e
    }
    for (const r of requests) {
      if (r.status !== 'OPEN') continue
      entry(r.date).open.push(r)
    }
    for (const b of bookings) {
      entry(b.date).bookings.push(b)
    }
    for (const a of availabilities) {
      const bucket = entry(a.date)
      if (a.shift === 'EARLY') bucket.availEarly.push(a)
      else bucket.availLate.push(a)
    }
    return map
  }, [requests, bookings, availabilities])

  function prevMonth() {
    if (monthIndex === 0) {
      const ny = year - 1
      if (!POOL_AVAILABLE_YEARS.includes(ny)) return
      setYear(ny); setMonthIndex(11)
    } else setMonthIndex(monthIndex - 1)
  }
  function nextMonth() {
    if (monthIndex === 11) {
      const ny = year + 1
      if (!POOL_AVAILABLE_YEARS.includes(ny)) return
      setYear(ny); setMonthIndex(0)
    } else setMonthIndex(monthIndex + 1)
  }

  const todayIso = iso(today.getFullYear(), today.getMonth(), today.getDate())

  const dayDetails = openDay
    ? byDay.get(openDay) ?? { open: [], bookings: [], availEarly: [], availLate: [] }
    : null

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="rounded-lg p-2 text-gray-700 hover:bg-gray-100" aria-label="Vorheriger Monat">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button onClick={nextMonth} className="rounded-lg p-2 text-gray-700 hover:bg-gray-100" aria-label="Nächster Monat">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900">{MONTH_NAMES[monthIndex]} {year}</h2>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
          >
            {POOL_AVAILABLE_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('roster')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              viewMode === 'roster'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-white'
            }`}
          >
            <TableProperties className="h-3.5 w-3.5" />
            Einsatzplan
          </button>
          <button
            type="button"
            onClick={() => setViewMode('calendar')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              viewMode === 'calendar'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-white'
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Kalender
          </button>
        </div>
      </div>

      {viewMode === 'roster' ? (
        <PoolPlannerRoster
          year={year}
          monthIndex={monthIndex}
          holidayMap={holidayMap}
          requests={requests}
          bookings={bookings}
          availabilities={availabilities}
          members={members}
          onDayClick={setOpenDay}
        />
      ) : (
      <>
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-600">
        {WEEKDAY_NAMES.map((d, i) => (
          <div key={d} className={`px-2 py-2 text-center ${i >= 5 ? 'text-red-600' : ''}`}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((cell, idx) => {
          const weekday = (cell.date.getDay() + 6) % 7
          const isWeekend = weekday >= 5
          const holiday = holidayMap.get(cell.iso)
          const isToday = cell.iso === todayIso
          const dayInfo = byDay.get(cell.iso)

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
              onClick={() => cell.inMonth && setOpenDay(cell.iso)}
              className={`relative flex min-h-[100px] flex-col items-stretch border-b border-r border-gray-100 p-1.5 text-left transition-colors hover:bg-blue-50 ${baseBg}`}
              disabled={!cell.inMonth}
            >
              <div className="flex items-start justify-between">
                <span className={`text-sm ${isToday ? 'inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 font-semibold text-white' : 'font-medium text-gray-900'} ${!cell.inMonth ? 'text-gray-400' : ''}`}>
                  {cell.day}
                </span>
                {holiday && cell.inMonth && (
                  <span className="ml-1 truncate text-[10px] font-medium text-amber-700" title={holiday.name}>
                    {holiday.name}
                  </span>
                )}
              </div>

              {cell.inMonth && dayInfo && (dayInfo.open.length > 0 || dayInfo.bookings.length > 0) && (
                <div className="mt-1 flex flex-col gap-1">
                  {dayInfo.open.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {dayInfo.open.slice(0, 3).map((r) => (
                        <RequestPill key={r.id} shift={r.shift} team={r.team} status="OPEN" />
                      ))}
                      {dayInfo.open.length > 3 && (
                        <span className="text-[10px] font-medium text-gray-500">+{dayInfo.open.length - 3}</span>
                      )}
                    </div>
                  )}
                  {dayInfo.bookings.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {dayInfo.bookings.slice(0, 3).map((b) => (
                        <RequestPill key={b.id} shift={b.shift} team={b.team} status="FILLED" />
                      ))}
                      {dayInfo.bookings.length > 3 && (
                        <span className="text-[10px] font-medium text-gray-500">+{dayInfo.bookings.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Angebote = Verfügbarkeiten als kleine türkise Pills unten in der Zelle.
                  WICHTIG: nur noch *buchbare* Verfügbarkeiten zählen (lockedByBooking ausschliessen),
                  damit nach einer Buchung keine "Phantom-Pille" stehen bleibt. */}
              {cell.inMonth && dayInfo && (() => {
                const freeEarly = dayInfo.availEarly.filter((a) => !a.lockedByBooking).length
                const freeLate = dayInfo.availLate.filter((a) => !a.lockedByBooking).length
                if (freeEarly === 0 && freeLate === 0) return null
                return (
                  <div className="mt-auto flex flex-wrap items-center gap-1 pt-1">
                    {freeEarly > 0 && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-teal-300 bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-800"
                        title={`${freeEarly} Mitarbeitende für Frühdienst verfügbar`}
                      >
                        <Users className="h-2.5 w-2.5" />
                        F·{freeEarly}
                      </span>
                    )}
                    {freeLate > 0 && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-teal-300 bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-800"
                        title={`${freeLate} Mitarbeitende für Spätdienst verfügbar`}
                      >
                        <Users className="h-2.5 w-2.5" />
                        S·{freeLate}
                      </span>
                    )}
                  </div>
                )
              })()}

              {cell.inMonth && (!dayInfo || (dayInfo.open.length === 0 && dayInfo.bookings.length === 0 && dayInfo.availEarly.length === 0 && dayInfo.availLate.length === 0)) && (
                <div className="mt-auto flex items-end justify-end opacity-0 transition-opacity group-hover:opacity-100">
                  <Plus className="h-4 w-4 text-gray-400" />
                </div>
              )}
            </button>
          )
        })}
      </div>
      </>
      )}

      {/* Legende */}
      <div className="space-y-2 border-t border-gray-200 px-4 py-3 text-xs text-gray-600">
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-medium text-gray-700">
            {viewMode === 'roster' ? 'Einsatzplan:' : 'Status:'}
          </span>
          {viewMode === 'roster' ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-red-500 text-[10px] font-bold text-white">F</span>
                <span className="text-gray-500">offener Bedarf (Früh/Spät)</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-blue-600 text-[10px] font-bold text-white">S</span>
                <span className="text-gray-500">gebucht</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-sm border-2 border-teal-400 bg-teal-50 text-[10px] font-bold text-teal-800">F</span>
                <span className="text-gray-500">verfügbar angeboten</span>
              </span>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-md border border-red-400 bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-900">
                  <AlertCircle className="h-3 w-3 text-red-600" />
                  offen
                </span>
                <span className="text-gray-500">sucht jemanden</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-md border border-blue-400 bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-900">
                  <CheckCircle2 className="h-3 w-3 text-blue-600" />
                  gebucht
                </span>
                <span className="text-gray-500">fix vergeben</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-teal-300 bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-800">
                  <Users className="h-3 w-3" />
                  F·N
                </span>
                <span className="text-gray-500">verfügbare Mitarbeitende</span>
              </span>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-medium text-gray-700">Teams:</span>
          {POOL_TEAM_IDS.map((id) => (
            <span key={id} className="inline-flex items-center gap-1.5">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${POOL_TEAMS[id].dotColor}`} />
              {POOL_TEAMS[id].label}
            </span>
          ))}
        </div>
      </div>

      <DayDialog
        isoDay={openDay}
        details={dayDetails}
        onClose={() => setOpenDay(null)}
        onChanged={fetchData}
      />
    </div>
  )
}

function RequestPill({
  shift,
  team,
  status,
}: {
  shift: 'EARLY' | 'LATE'
  team: PoolTeamId
  status: 'OPEN' | 'FILLED'
}) {
  const teamDef = POOL_TEAMS[team]
  const ShiftIcon = shift === 'EARLY' ? Sun : Moon
  const shiftColor = shift === 'EARLY' ? 'text-amber-600' : 'text-indigo-600'

  // OPEN = rot mit Alarm-Icon (Aktion nötig)
  // FILLED = blau mit Check-Icon (erledigt)
  const containerClass =
    status === 'OPEN'
      ? 'border border-red-400 bg-red-100 text-red-900'
      : 'border border-blue-400 bg-blue-100 text-blue-900'
  const StatusIcon = status === 'OPEN' ? AlertCircle : CheckCircle2
  const statusIconClass = status === 'OPEN' ? 'text-red-600' : 'text-blue-600'

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-none ${containerClass}`}
      title={`${teamDef?.label ?? team} · ${shift === 'EARLY' ? 'Frühdienst' : 'Spätdienst'} · ${status === 'OPEN' ? 'offen – sucht jemanden' : 'gebucht'}`}
    >
      <StatusIcon className={`h-3 w-3 ${statusIconClass}`} />
      <ShiftIcon className={`h-3 w-3 ${shiftColor}`} />
      {teamDef?.short ?? team}
    </div>
  )
}

function DayDialog({
  isoDay,
  details,
  onClose,
  onChanged,
}: {
  isoDay: string | null
  details: {
    open: ShiftRequestApi[]
    bookings: BookingApi[]
    availEarly: AvailabilityApi[]
    availLate: AvailabilityApi[]
  } | null
  onClose: () => void
  onChanged: () => void
}) {
  const [creating, setCreating] = useState(false)
  const [shift, setShift] = useState<'EARLY' | 'LATE'>('EARLY')
  const [team, setTeam] = useState<PoolTeamId>('MAENNEDORF_UETIKON')
  const [message, setMessage] = useState('')
  const [allowedQuals, setAllowedQuals] = useState<PoolQualificationId[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [bookingSaving, setBookingSaving] = useState(false)

  // Buchte Team-Slots an diesem Tag ermitteln (Tag+Schicht+Team), damit
  // Doppelbuchungen optisch unterbunden werden können.
  const bookedTeamSlots = new Set(
    (details?.bookings ?? []).map((b) => `${b.shift}:${b.team}`)
  )

  useEffect(() => {
    if (isoDay) {
      setCreating(false)
      setShift('EARLY')
      setTeam('MAENNEDORF_UETIKON')
      setMessage('')
      setAllowedQuals([])
      setError(null)
      setSuccess(null)
      setSaving(false)
      setBookingId(null)
      setBookingSaving(false)
    }
  }, [isoDay])

  async function handleBookAvailability(item: AvailabilityApi, teamId: PoolTeamId) {
    if (!isoDay) return
    setBookingSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/pool/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolUserId: item.poolUser.id,
          date: isoDay,
          shift: item.shift,
          team: teamId,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error || 'Buchung fehlgeschlagen.')
        return
      }
      const teamLabel = POOL_TEAMS[teamId]?.label ?? teamId
      const shiftLabel = item.shift === 'EARLY' ? 'Frühdienst' : 'Spätdienst'
      setSuccess(`${item.poolUser.firstName} ${item.poolUser.lastName} für ${shiftLabel} (${teamLabel}) gebucht.`)
      setBookingId(null)
      onChanged()
    } finally {
      setBookingSaving(false)
    }
  }

  function toggleQual(q: PoolQualificationId) {
    setAllowedQuals((prev) => (prev.includes(q) ? prev.filter((x) => x !== q) : [...prev, q]))
  }

  async function handleCreate() {
    if (!isoDay) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/pool/shift-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: isoDay,
          shift,
          team,
          message: message.trim() || undefined,
          allowedQualifications: allowedQuals.length > 0 ? allowedQuals : undefined,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error || 'Anfrage konnte nicht erstellt werden.')
        return
      }
      const notified = d.request?.notified ?? 0
      const total = d.request?.memberTotal ?? notified
      const note =
        allowedQuals.length > 0
          ? `Anfrage erstellt – an ${notified} von ${total} Mitarbeitenden mit passender Qualifikation geschickt.`
          : `Anfrage erstellt und an ${notified} Mitarbeitende geschickt.`
      setSuccess(note)
      setCreating(false)
      setMessage('')
      setAllowedQuals([])
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  async function handleCancel(id: string) {
    setError(null)
    setSuccess(null)
    const res = await fetch(`/api/pool/shift-requests/${id}`, { method: 'DELETE' })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(d.error || 'Stornieren fehlgeschlagen.')
      return
    }
    setSuccess('Anfrage storniert.')
    onChanged()
  }

  return (
    <Dialog open={isoDay !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bedarf für diesen Tag</DialogTitle>
          <DialogDescription>{isoDay ? formatDayLong(isoDay) : ''}</DialogDescription>
        </DialogHeader>

        {details && (
          <div className="space-y-4">
            {/* Sektion: Offene Anfragen (rot = Aktion nötig) */}
            <section className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-red-700">
                <AlertCircle className="h-3.5 w-3.5" />
                Offene Anfragen
              </div>
              {details.open.length === 0 ? (
                <p className="rounded border border-dashed border-gray-200 bg-gray-50 p-2 text-xs text-gray-500">
                  Keine offenen Anfragen.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {details.open.map((r) => (
                    <OpenRequestRow key={r.id} req={r} onCancel={() => handleCancel(r.id)} />
                  ))}
                </div>
              )}
            </section>

            {/* Sektion: Belegte Schichten (blau = fix vergeben) */}
            <section className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Gebuchte Schichten
              </div>
              {details.bookings.length === 0 ? (
                <p className="rounded border border-dashed border-gray-200 bg-gray-50 p-2 text-xs text-gray-500">
                  Noch keine Buchung.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {details.bookings.map((b) => (
                    <BookingRow key={b.id} booking={b} />
                  ))}
                </div>
              )}
            </section>

            {/* Sektion: Verfügbarkeiten / Angebote (teal = MA angeboten) */}
            <section className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-teal-700">
                <Users className="h-3.5 w-3.5" />
                Angeboten (verfügbar)
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <AvailabilityList
                  title="Frühdienst"
                  icon={<Sun className="h-3.5 w-3.5 text-amber-500" />}
                  items={details.availEarly}
                  bookedTeamSlots={bookedTeamSlots}
                  expandedId={bookingId}
                  onToggleExpand={(id) => setBookingId((cur) => (cur === id ? null : id))}
                  onBook={handleBookAvailability}
                  saving={bookingSaving}
                />
                <AvailabilityList
                  title="Spätdienst"
                  icon={<Moon className="h-3.5 w-3.5 text-indigo-500" />}
                  items={details.availLate}
                  bookedTeamSlots={bookedTeamSlots}
                  expandedId={bookingId}
                  onToggleExpand={(id) => setBookingId((cur) => (cur === id ? null : id))}
                  onBook={handleBookAvailability}
                  saving={bookingSaving}
                />
              </div>
            </section>

            {/* Erstell-Block */}
            {!creating ? (
              <Button
                type="button"
                onClick={() => setCreating(true)}
                className="w-full bg-emerald-600 hover:bg-emerald-700"
              >
                <Plus className="mr-1 h-4 w-4" /> Neue Anfrage für diesen Tag
              </Button>
            ) : (
              <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="dlg-shift" className="text-xs">Schicht</Label>
                    <select
                      id="dlg-shift"
                      value={shift}
                      onChange={(e) => setShift(e.target.value as 'EARLY' | 'LATE')}
                      className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="EARLY">Frühdienst</option>
                      <option value="LATE">Spätdienst</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="dlg-team" className="text-xs">Team</Label>
                    <select
                      id="dlg-team"
                      value={team}
                      onChange={(e) => setTeam(e.target.value as PoolTeamId)}
                      className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                    >
                      {POOL_TEAM_IDS.map((id) => (
                        <option key={id} value={id}>{POOL_TEAMS[id].label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <Label htmlFor="dlg-msg" className="text-xs">Notiz (optional)</Label>
                  <Textarea
                    id="dlg-msg"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="z.B. pflegeintensiv, Erfahrung mit Dekubitus"
                    rows={2}
                  />
                </div>
                <div>
                  <Label className="text-xs">Qualifikationen, die in Frage kommen</Label>
                  <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {POOL_QUALIFICATION_IDS.map((q) => (
                      <label
                        key={q}
                        className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${
                          allowedQuals.includes(q)
                            ? 'border-sky-400 bg-sky-50 text-sky-900'
                            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={allowedQuals.includes(q)}
                          onChange={() => toggleQual(q)}
                          className="h-3.5 w-3.5 rounded border-gray-300"
                        />
                        <span className="font-semibold">{POOL_QUALIFICATIONS[q].short}</span>
                        <span className="truncate text-[10px] text-gray-500">
                          {POOL_QUALIFICATIONS[q].label}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-gray-500">
                    {allowedQuals.length === 0
                      ? 'Ohne Auswahl ist die Anfrage für alle Mitarbeitenden sichtbar.'
                      : `Nur Mitarbeitende mit ${allowedQuals.join(' / ')} sehen die Anfrage und können sie übernehmen.`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setCreating(false)} disabled={saving} className="flex-1">
                    Abbrechen
                  </Button>
                  <Button type="button" onClick={handleCreate} disabled={saving} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                    {saving ? 'Anlegen…' : 'Anfrage absenden'}
                  </Button>
                </div>
              </div>
            )}

            {error && <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>}
            {success && <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">{success}</div>}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Schliessen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OpenRequestRow({ req, onCancel }: { req: ShiftRequestApi; onCancel: () => void }) {
  const team = POOL_TEAMS[req.team]
  const ShiftIcon = req.shift === 'EARLY' ? Sun : Moon
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border-l-4 border border-red-300 border-l-red-500 bg-red-50 p-2">
      <div className="flex flex-1 flex-wrap items-center gap-2 text-sm">
        <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
        <ShiftIcon className={`h-4 w-4 shrink-0 ${req.shift === 'EARLY' ? 'text-amber-500' : 'text-indigo-500'}`} />
        <span className="font-medium text-gray-900">
          {req.shift === 'EARLY' ? 'Frühdienst' : 'Spätdienst'}
        </span>
        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${team?.color ?? 'bg-gray-100'}`}>
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${team?.dotColor ?? 'bg-gray-500'}`} />
          {team?.label ?? req.team}
        </span>
        {req.allowedQualifications.length > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800"
            title={`Qualifikationen: ${req.allowedQualificationLabels.join(', ')}`}
          >
            für: {req.allowedQualifications.join('/')}
          </span>
        )}
        {req.message && (
          <span className="ml-1 truncate text-xs text-gray-600" title={req.message}>· {req.message}</span>
        )}
      </div>
      <Button type="button" size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={onCancel} title="Anfrage stornieren">
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}

function BookingRow({ booking }: { booking: BookingApi }) {
  const team = POOL_TEAMS[booking.team]
  const ShiftIcon = booking.shift === 'EARLY' ? Sun : Moon
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border-l-4 border border-blue-300 border-l-blue-500 bg-blue-50 p-2">
      <div className="flex flex-1 flex-wrap items-center gap-2 text-sm">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600" />
        <ShiftIcon className={`h-4 w-4 shrink-0 ${booking.shift === 'EARLY' ? 'text-amber-500' : 'text-indigo-500'}`} />
        <span className="font-medium text-gray-900">
          {booking.shift === 'EARLY' ? 'Frühdienst' : 'Spätdienst'}
        </span>
        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${team?.color ?? 'bg-gray-100'}`}>
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${team?.dotColor ?? 'bg-gray-500'}`} />
          {team?.label ?? booking.team}
        </span>
        <span className="inline-flex items-center gap-1.5 text-sm text-gray-900">
          {booking.poolUser.firstName} {booking.poolUser.lastName}
          {booking.poolUser.qualificationShort && (
            <span
              className="rounded border border-sky-200 bg-sky-50 px-1 text-[10px] font-semibold uppercase tracking-wide text-sky-800"
              title={booking.poolUser.qualification ?? ''}
            >
              {booking.poolUser.qualificationShort}
            </span>
          )}
        </span>
        {!booking.shiftRequestId && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600" title="Direkt vom Planer gebucht (ohne Anfrage)">
            direkt
          </span>
        )}
      </div>
    </div>
  )
}

function AvailabilityList({
  title,
  icon,
  items,
  bookedTeamSlots,
  expandedId,
  onToggleExpand,
  onBook,
  saving,
}: {
  title: string
  icon: React.ReactNode
  items: AvailabilityApi[]
  bookedTeamSlots: Set<string>
  expandedId: string | null
  onToggleExpand: (id: string) => void
  onBook: (item: AvailabilityApi, team: PoolTeamId) => void | Promise<void>
  saving: boolean
}) {
  // Personen ausblenden, die für dieselbe (Tag, Schicht) bereits gebucht sind.
  const visible = items.filter((a) => !a.lockedByBooking)
  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50/40 p-2">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-teal-800">
        {icon}
        {title}
        <span className="ml-auto rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-medium text-teal-800">
          {visible.length}
        </span>
      </div>
      {visible.length === 0 ? (
        <p className="text-xs text-gray-400">niemand angeboten</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {visible.map((a) => {
            const isOpen = expandedId === a.id
            return (
              <li key={a.id} className="rounded border border-transparent hover:border-teal-200">
                <button
                  type="button"
                  onClick={() => onToggleExpand(a.id)}
                  disabled={saving}
                  className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-teal-100/60 disabled:cursor-not-allowed"
                  title="Mit einem Team buchen"
                >
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-500" />
                  <span className="text-gray-900">
                    {a.poolUser.firstName} {a.poolUser.lastName}
                  </span>
                  {a.poolUser.qualificationShort && (
                    <span
                      className="rounded border border-sky-200 bg-sky-50 px-1 text-[9px] font-semibold uppercase tracking-wide text-sky-800"
                      title={a.poolUser.qualification ?? ''}
                    >
                      {a.poolUser.qualificationShort}
                    </span>
                  )}
                  <span className="ml-auto text-[9px] font-medium text-teal-700">
                    {isOpen ? '×' : 'buchen ›'}
                  </span>
                </button>
                {isOpen && (
                  <div className="mt-1 space-y-1 rounded border border-teal-300 bg-white p-1.5">
                    <div className="text-[10px] text-gray-600">Team für Buchung wählen:</div>
                    <div className="flex flex-wrap gap-1">
                      {POOL_TEAM_IDS.map((tid) => {
                        const teamDef = POOL_TEAMS[tid]
                        const slotKey = `${a.shift}:${tid}`
                        const slotTaken = bookedTeamSlots.has(slotKey)
                        return (
                          <button
                            key={tid}
                            type="button"
                            disabled={saving || slotTaken}
                            onClick={() => onBook(a, tid)}
                            title={
                              slotTaken
                                ? `${teamDef.label} · ${a.shift === 'EARLY' ? 'Frühdienst' : 'Spätdienst'} ist bereits gebucht`
                                : `Bei ${teamDef.label} buchen`
                            }
                            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-none transition ${
                              slotTaken
                                ? 'cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400 line-through'
                                : 'border border-teal-300 bg-teal-50 text-teal-900 hover:bg-teal-100'
                            }`}
                          >
                            <span className={`inline-block h-1.5 w-1.5 rounded-full ${teamDef.dotColor}`} />
                            {teamDef.short}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
