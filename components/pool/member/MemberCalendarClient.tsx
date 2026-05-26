'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Loader2,
  Lock,
  CheckCircle2,
  AlertCircle,
  Users,
} from 'lucide-react'
import { POOL_AVAILABLE_YEARS, getHolidayMap } from '@/lib/pool/holidays-zh'
import { POOL_TEAMS, type PoolTeamId } from '@/lib/pool/teams'

const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]
const WEEKDAY_NAMES = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

type ShiftId = 'EARLY' | 'LATE'

type OpenRequestApi = {
  id: string
  shift: ShiftId
  team: PoolTeamId
  teamLabel: string
  message: string | null
  allowedQualifications: string[]
  allowedQualificationLabels: string[]
}

type BookingDetail = { shift: ShiftId; team: PoolTeamId; teamLabel: string }

type CalendarData = {
  availability: Record<string, ShiftId[]>
  bookings: Record<string, ShiftId[]>
  bookingDetails: Record<string, BookingDetail[]>
  openRequests: Record<string, OpenRequestApi[]>
}

function pad2(n: number) { return String(n).padStart(2, '0') }
function iso(y: number, m: number, d: number) { return `${y}-${pad2(m + 1)}-${pad2(d)}` }

function buildMonthGrid(year: number, monthIndex: number) {
  const first = new Date(year, monthIndex, 1)
  const last = new Date(year, monthIndex + 1, 0)
  const daysInMonth = last.getDate()
  const firstWeekday = (first.getDay() + 6) % 7
  const cells: Array<{ day: number; inMonth: boolean; date: Date; iso: string }> = []
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const d = new Date(year, monthIndex, -i)
    cells.push({ day: d.getDate(), inMonth: false, date: d, iso: iso(d.getFullYear(), d.getMonth(), d.getDate()) })
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, inMonth: true, date: new Date(year, monthIndex, day), iso: iso(year, monthIndex, day) })
  }
  while (cells.length % 7 !== 0) {
    const lastCell = cells[cells.length - 1].date
    const d = new Date(lastCell)
    d.setDate(lastCell.getDate() + 1)
    cells.push({ day: d.getDate(), inMonth: false, date: d, iso: iso(d.getFullYear(), d.getMonth(), d.getDate()) })
  }
  return cells
}

function formatDayLong(isoStr: string): string {
  const [y, m, d] = isoStr.split('-').map((s) => parseInt(s, 10))
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export default function MemberCalendarClient() {
  const today = new Date()
  const [year, setYear] = useState<number>(today.getFullYear())
  const [monthIndex, setMonthIndex] = useState<number>(today.getMonth())
  const [data, setData] = useState<CalendarData>({
    availability: {},
    bookings: {},
    bookingDetails: {},
    openRequests: {},
  })
  const [loading, setLoading] = useState(true)
  const [openDayIso, setOpenDayIso] = useState<string | null>(null)

  const holidayMap = useMemo(() => getHolidayMap(year), [year])
  const cells = useMemo(() => buildMonthGrid(year, monthIndex), [year, monthIndex])

  const todayIso = useMemo(() => {
    const t = new Date()
    return iso(t.getFullYear(), t.getMonth(), t.getDate())
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/pool/me/calendar?year=${year}&month=${monthIndex + 1}`, { cache: 'no-store' })
      if (res.ok) {
        const d = await res.json()
        setData({
          availability: d.availability ?? {},
          bookings: d.bookings ?? {},
          bookingDetails: d.bookingDetails ?? {},
          openRequests: d.openRequests ?? {},
        })
      }
    } finally {
      setLoading(false)
    }
  }, [year, monthIndex])

  useEffect(() => { fetchData() }, [fetchData])

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

  const dialogData = openDayIso
    ? {
        iso: openDayIso,
        availability: data.availability[openDayIso] ?? [],
        bookings: data.bookings[openDayIso] ?? [],
        bookingDetails: data.bookingDetails[openDayIso] ?? [],
        openRequests: data.openRequests[openDayIso] ?? [],
      }
    : null

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-4 py-3">
          <button onClick={prevMonth} className="rounded-lg p-2 text-gray-700 hover:bg-gray-100" aria-label="Vorheriger Monat">
            <ChevronLeft className="h-5 w-5" />
          </button>
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
          <button onClick={nextMonth} className="rounded-lg p-2 text-gray-700 hover:bg-gray-100" aria-label="Nächster Monat">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

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
            const isPast = cell.iso < todayIso

            const myBookings = data.bookingDetails[cell.iso] ?? []
            const openReqs = data.openRequests[cell.iso] ?? []
            const myAvail = data.availability[cell.iso] ?? []

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
                onClick={() => cell.inMonth && setOpenDayIso(cell.iso)}
                className={`relative flex min-h-[92px] flex-col items-stretch border-b border-r border-gray-100 p-1.5 text-left transition-colors hover:bg-blue-50 disabled:cursor-default ${baseBg}`}
                disabled={!cell.inMonth}
              >
                <div className="flex items-start justify-between">
                  <span
                    className={`text-sm ${isToday ? 'inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 font-semibold text-white' : isPast ? 'text-gray-400' : 'font-medium text-gray-900'} ${!cell.inMonth ? 'text-gray-400' : ''}`}
                  >
                    {cell.day}
                  </span>
                  {holiday && cell.inMonth && (
                    <span className="ml-1 truncate text-[10px] font-medium text-amber-700" title={holiday.name}>
                      {holiday.name}
                    </span>
                  )}
                </div>

                {cell.inMonth && (openReqs.length > 0 || myBookings.length > 0) && (
                  <div className="mt-1 flex flex-col gap-1">
                    {openReqs.slice(0, 3).map((r) => (
                      <ShiftPill key={r.id} kind="OPEN" shift={r.shift} team={r.team} />
                    ))}
                    {openReqs.length > 3 && (
                      <span className="text-[10px] font-medium text-red-700">+{openReqs.length - 3} weitere offen</span>
                    )}
                    {myBookings.slice(0, 3).map((b, i) => (
                      <ShiftPill key={`b-${i}`} kind="BOOKED" shift={b.shift} team={b.team} />
                    ))}
                  </div>
                )}

                {/* Eigene Verfügbarkeit dezent unten, sobald keine Buchungen */}
                {cell.inMonth && myBookings.length === 0 && myAvail.length > 0 && (
                  <div className="mt-auto flex items-center gap-1 pt-1 text-[10px] text-teal-700">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-500" />
                    verfügbar: {myAvail.map((s) => (s === 'EARLY' ? 'F' : 'S')).join('/')}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-gray-200 px-4 py-3 text-xs text-gray-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md border border-red-400 bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-900">
              <AlertCircle className="h-3 w-3 text-red-600" />
              offen
            </span>
            <span className="text-gray-500">kannst du übernehmen</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md border border-blue-400 bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-900">
              <CheckCircle2 className="h-3 w-3 text-blue-600" />
              gebucht
            </span>
            <span className="text-gray-500">deine Schicht</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-teal-500" /> deine Verfügbarkeit
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5">
            <Sun className="h-3.5 w-3.5 text-amber-500" /> Früh (F)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Moon className="h-3.5 w-3.5 text-indigo-500" /> Spät (S)
          </span>
        </div>
      </div>

      <DayDialog
        data={dialogData}
        isPast={openDayIso ? openDayIso < todayIso : false}
        onClose={() => setOpenDayIso(null)}
        onChanged={fetchData}
      />
    </div>
  )
}

function ShiftPill({
  kind,
  shift,
  team,
}: {
  kind: 'OPEN' | 'BOOKED'
  shift: ShiftId
  team: PoolTeamId
}) {
  const teamDef = POOL_TEAMS[team]
  const ShiftIcon = shift === 'EARLY' ? Sun : Moon
  const shiftColor = shift === 'EARLY' ? 'text-amber-600' : 'text-indigo-600'
  const containerClass =
    kind === 'OPEN'
      ? 'border border-red-400 bg-red-100 text-red-900'
      : 'border border-blue-400 bg-blue-100 text-blue-900'
  const StatusIcon = kind === 'OPEN' ? AlertCircle : CheckCircle2
  const statusIconClass = kind === 'OPEN' ? 'text-red-600' : 'text-blue-600'
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-none ${containerClass}`}
      title={`${teamDef?.label ?? team} · ${shift === 'EARLY' ? 'Frühdienst' : 'Spätdienst'} · ${kind === 'OPEN' ? 'offen – kannst du übernehmen' : 'von dir gebucht'}`}
    >
      <StatusIcon className={`h-3 w-3 ${statusIconClass}`} />
      <ShiftIcon className={`h-3 w-3 ${shiftColor}`} />
      {teamDef?.short ?? team}
    </div>
  )
}

function DayDialog({
  data,
  isPast,
  onClose,
  onChanged,
}: {
  data: {
    iso: string
    availability: ShiftId[]
    bookings: ShiftId[]
    bookingDetails: BookingDetail[]
    openRequests: OpenRequestApi[]
  } | null
  isPast: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [early, setEarly] = useState(false)
  const [late, setLate] = useState(false)
  const [savingAvail, setSavingAvail] = useState(false)
  const [savingAcceptId, setSavingAcceptId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (data) {
      setEarly(data.availability.includes('EARLY') || data.bookings.includes('EARLY'))
      setLate(data.availability.includes('LATE') || data.bookings.includes('LATE'))
      setError(null)
      setSuccess(null)
      setSavingAvail(false)
      setSavingAcceptId(null)
    }
  }, [data])

  if (!data) return null

  const earlyLocked = data.bookings.includes('EARLY')
  const lateLocked = data.bookings.includes('LATE')

  async function handleSaveAvail() {
    if (!data) return
    setSavingAvail(true)
    setError(null)
    setSuccess(null)
    try {
      const shifts: string[] = []
      if (early) shifts.push('EARLY')
      if (late) shifts.push('LATE')
      const res = await fetch('/api/pool/me/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: data.iso, shifts }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error || 'Speichern fehlgeschlagen.')
        return
      }
      const note =
        shifts.length === 0
          ? 'Verfügbarkeit entfernt.'
          : `Verfügbarkeit gespeichert (${shifts.map((s) => (s === 'EARLY' ? 'Frühdienst' : 'Spätdienst')).join(', ')}).`
      setSuccess(note)
      onChanged()
      // Dialog kurz offen lassen, damit der Hinweis sichtbar bleibt, dann schliessen.
      setTimeout(() => onClose(), 1100)
    } finally {
      setSavingAvail(false)
    }
  }

  async function handleAccept(reqId: string) {
    setSavingAcceptId(reqId)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/pool/shift-requests/${reqId}/accept`, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error || 'Übernahme fehlgeschlagen.')
        return
      }
      setSuccess('Dienst übernommen.')
      onChanged()
      setTimeout(() => onClose(), 1100)
    } finally {
      setSavingAcceptId(null)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Dienste an diesem Tag</DialogTitle>
          <DialogDescription>{formatDayLong(data.iso)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Offene Anfragen */}
          {data.openRequests.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-red-700">
                <AlertCircle className="h-3.5 w-3.5" />
                Offene Anfragen
              </div>
              {data.openRequests.map((r) => {
                const teamDef = POOL_TEAMS[r.team]
                const ShiftIcon = r.shift === 'EARLY' ? Sun : Moon
                const acceptDisabled = isPast || savingAcceptId === r.id
                return (
                  <div key={r.id} className="rounded-lg border-l-4 border border-red-300 border-l-red-500 bg-red-50 p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <AlertCircle className="h-4 w-4 text-red-600" />
                      <ShiftIcon className={`h-4 w-4 ${r.shift === 'EARLY' ? 'text-amber-500' : 'text-indigo-500'}`} />
                      <span className="font-semibold text-gray-900">
                        {r.shift === 'EARLY' ? 'Frühdienst' : 'Spätdienst'}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${teamDef?.color ?? 'bg-gray-100'}`}>
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${teamDef?.dotColor ?? 'bg-gray-500'}`} />
                        {teamDef?.label ?? r.team}
                      </span>
                      {r.allowedQualifications.length > 0 && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800"
                          title={r.allowedQualificationLabels.join(', ')}
                        >
                          für: {r.allowedQualifications.join(' / ')}
                        </span>
                      )}
                    </div>
                    {r.message && (
                      <p className="mt-1.5 text-xs text-gray-700">{r.message}</p>
                    )}
                    <div className="mt-2 flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleAccept(r.id)}
                        disabled={acceptDisabled}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        <CheckCircle2 className="mr-1 h-4 w-4" />
                        {savingAcceptId === r.id ? 'Übernehme…' : 'Dienst übernehmen'}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </section>
          )}

          {/* Eigene Buchungen */}
          {data.bookingDetails.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Deine Buchungen
              </div>
              {data.bookingDetails.map((b, i) => {
                const teamDef = POOL_TEAMS[b.team]
                const ShiftIcon = b.shift === 'EARLY' ? Sun : Moon
                return (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border-l-4 border border-blue-300 border-l-blue-500 bg-blue-50 p-3 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-blue-600" />
                    <ShiftIcon className={`h-4 w-4 ${b.shift === 'EARLY' ? 'text-amber-500' : 'text-indigo-500'}`} />
                    <span className="font-semibold text-gray-900">
                      {b.shift === 'EARLY' ? 'Frühdienst' : 'Spätdienst'}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${teamDef?.color ?? 'bg-gray-100'}`}>
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${teamDef?.dotColor ?? 'bg-gray-500'}`} />
                      {teamDef?.label ?? b.team}
                    </span>
                  </div>
                )
              })}
            </section>
          )}

          {/* Verfügbarkeit / Angebot */}
          <section className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-teal-700">
              <Users className="h-3.5 w-3.5" />
              Verfügbarkeit anbieten
            </Label>
            {isPast ? (
              <p className="rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-500">
                Vergangene Tage können nicht mehr geändert werden.
              </p>
            ) : (
              <>
                <ShiftToggle
                  icon={Sun}
                  iconClass="text-amber-500"
                  label="Frühdienst"
                  checked={early}
                  locked={earlyLocked}
                  onChange={setEarly}
                />
                <ShiftToggle
                  icon={Moon}
                  iconClass="text-indigo-500"
                  label="Spätdienst"
                  checked={late}
                  locked={lateLocked}
                  onChange={setLate}
                />
                <p className="text-[11px] text-gray-500">
                  Bereits gebuchte Schichten sind gesperrt.
                </p>
              </>
            )}
          </section>

          {data.openRequests.length === 0 && data.bookingDetails.length === 0 && !isPast && (
            <p className="rounded border border-dashed border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
              Aktuell keine Anfragen oder Buchungen für diesen Tag. Du kannst hier deine Verfügbarkeit eintragen.
            </p>
          )}

          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>
          )}
          {success && (
            <div className="flex items-center gap-2 rounded border border-emerald-200 bg-emerald-50 p-2 text-sm font-medium text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              {success}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Schliessen
          </Button>
          {!isPast && (
            <Button
              type="button"
              onClick={handleSaveAvail}
              disabled={savingAvail}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {savingAvail ? 'Speichern…' : 'Verfügbarkeit speichern'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ShiftToggle({
  icon: Icon,
  iconClass,
  label,
  checked,
  locked,
  onChange,
}: {
  icon: typeof Sun
  iconClass: string
  label: string
  checked: boolean
  locked: boolean
  onChange: (b: boolean) => void
}) {
  return (
    <label
      className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${
        locked
          ? 'cursor-not-allowed border-blue-200 bg-blue-50'
          : checked
            ? 'cursor-pointer border-emerald-300 bg-emerald-50'
            : 'cursor-pointer border-gray-200 bg-white hover:bg-gray-50'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <Icon className={`h-5 w-5 ${iconClass}`} />
        <span className="font-medium text-gray-900">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {locked ? (
          <span className="inline-flex items-center gap-1 rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
            <Lock className="h-3 w-3" />
            gebucht
          </span>
        ) : (
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
        )}
      </div>
    </label>
  )
}
