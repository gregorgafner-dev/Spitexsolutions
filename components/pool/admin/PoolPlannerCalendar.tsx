'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Plus, X, Sun, Moon, AlertCircle, CheckCircle2 } from 'lucide-react'
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

export default function PoolPlannerCalendar() {
  const today = new Date()
  const [year, setYear] = useState<number>(today.getFullYear())
  const [monthIndex, setMonthIndex] = useState<number>(today.getMonth())
  const [requests, setRequests] = useState<ShiftRequestApi[]>([])
  const [loading, setLoading] = useState(true)
  const [openDay, setOpenDay] = useState<string | null>(null)

  const holidayMap = useMemo(() => getHolidayMap(year), [year])
  const cells = useMemo(() => buildMonthGrid(year, monthIndex), [year, monthIndex])

  const monthStart = useMemo(() => iso(year, monthIndex, 1), [year, monthIndex])
  const monthEnd = useMemo(() => {
    const last = new Date(year, monthIndex + 1, 0)
    return iso(last.getFullYear(), last.getMonth(), last.getDate())
  }, [year, monthIndex])

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ dateFrom: monthStart, dateTo: monthEnd })
      const res = await fetch(`/api/pool/shift-requests?${params.toString()}`, { cache: 'no-store' })
      if (res.ok) {
        const d = await res.json()
        setRequests((d.items ?? []) as ShiftRequestApi[])
      } else {
        setRequests([])
      }
    } finally {
      setLoading(false)
    }
  }, [monthStart, monthEnd])

  useEffect(() => { fetchRequests() }, [fetchRequests])

  // Map iso -> { open: ShiftRequestApi[], filled: ShiftRequestApi[], cancelled: ShiftRequestApi[] }
  const byDay = useMemo(() => {
    const map = new Map<string, { open: ShiftRequestApi[]; filled: ShiftRequestApi[] }>()
    for (const r of requests) {
      if (r.status === 'CANCELLED') continue
      const entry = map.get(r.date) ?? { open: [], filled: [] }
      if (r.status === 'OPEN') entry.open.push(r)
      else if (r.status === 'FILLED') entry.filled.push(r)
      map.set(r.date, entry)
    }
    return map
  }, [requests])

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

  const dayDetails = openDay ? byDay.get(openDay) ?? { open: [], filled: [] } : null

  return (
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

              {cell.inMonth && dayInfo && (dayInfo.open.length > 0 || dayInfo.filled.length > 0) && (
                <div className="mt-1 flex flex-col gap-1">
                  {dayInfo.open.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {dayInfo.open.slice(0, 3).map((r) => (
                        <TeamPill key={r.id} req={r} status="OPEN" />
                      ))}
                      {dayInfo.open.length > 3 && (
                        <span className="text-[10px] font-medium text-gray-500">+{dayInfo.open.length - 3}</span>
                      )}
                    </div>
                  )}
                  {dayInfo.filled.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {dayInfo.filled.slice(0, 3).map((r) => (
                        <TeamPill key={r.id} req={r} status="FILLED" />
                      ))}
                      {dayInfo.filled.length > 3 && (
                        <span className="text-[10px] font-medium text-gray-500">+{dayInfo.filled.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {cell.inMonth && (!dayInfo || (dayInfo.open.length === 0 && dayInfo.filled.length === 0)) && (
                <div className="mt-auto flex items-end justify-end opacity-0 transition-opacity group-hover:opacity-100">
                  <Plus className="h-4 w-4 text-gray-400" />
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Legende */}
      <div className="flex flex-wrap items-center gap-4 border-t border-gray-200 px-4 py-3 text-xs text-gray-600">
        <span className="font-medium text-gray-700">Teams:</span>
        {POOL_TEAM_IDS.map((id) => (
          <span key={id} className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${POOL_TEAMS[id].dotColor}`} />
            {POOL_TEAMS[id].label}
          </span>
        ))}
        <span className="ml-auto inline-flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 text-emerald-600" /> offen
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" /> übernommen
        </span>
      </div>

      <DayDialog
        isoDay={openDay}
        details={dayDetails}
        onClose={() => setOpenDay(null)}
        onChanged={fetchRequests}
      />
    </div>
  )
}

function TeamPill({ req, status }: { req: ShiftRequestApi; status: 'OPEN' | 'FILLED' }) {
  const team = POOL_TEAMS[req.team]
  const ShiftIcon = req.shift === 'EARLY' ? Sun : Moon
  const shiftColor = req.shift === 'EARLY' ? 'text-amber-500' : 'text-indigo-500'
  const ring = status === 'OPEN' ? 'ring-1 ring-emerald-300' : 'ring-1 ring-blue-400'
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-none ${team?.color ?? 'bg-gray-100 text-gray-700'} ${ring}`}
      title={`${team?.label ?? req.team} · ${req.shift === 'EARLY' ? 'Frühdienst' : 'Spätdienst'} · ${status === 'OPEN' ? 'offen' : 'übernommen'}`}
    >
      <ShiftIcon className={`h-3 w-3 ${shiftColor}`} />
      {team?.short ?? req.team}
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
  details: { open: ShiftRequestApi[]; filled: ShiftRequestApi[] } | null
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
    }
  }, [isoDay])

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
          <div className="space-y-3">
            {/* Existierende Anfragen */}
            {details.open.length === 0 && details.filled.length === 0 ? (
              <p className="rounded border border-dashed border-gray-200 bg-gray-50 p-3 text-sm text-gray-500">
                Noch keine Anfragen für diesen Tag.
              </p>
            ) : (
              <div className="space-y-2">
                {details.open.map((r) => (
                  <RequestRow key={r.id} req={r} onCancel={() => handleCancel(r.id)} />
                ))}
                {details.filled.map((r) => (
                  <RequestRow key={r.id} req={r} onCancel={() => handleCancel(r.id)} />
                ))}
              </div>
            )}

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
                  <Label className="text-xs">Mindestqualifikation</Label>
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
                      : `Nur Mitarbeitende mit Qualifikation ${allowedQuals.join(' / ')} sehen die Anfrage und können sie übernehmen.`}
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

function RequestRow({ req, onCancel }: { req: ShiftRequestApi; onCancel: () => void }) {
  const team = POOL_TEAMS[req.team]
  const ShiftIcon = req.shift === 'EARLY' ? Sun : Moon
  const isOpen = req.status === 'OPEN'

  return (
    <div className={`flex items-center justify-between gap-2 rounded-lg border p-2.5 ${isOpen ? 'border-emerald-200 bg-emerald-50/40' : 'border-blue-200 bg-blue-50/40'}`}>
      <div className="flex flex-1 items-center gap-2.5 text-sm">
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
            title={`Mindestqualifikation: ${req.allowedQualificationLabels.join(', ')}`}
          >
            Min: {req.allowedQualifications.join('/')}
          </span>
        )}
        {req.message && (
          <span className="ml-1 truncate text-xs text-gray-600" title={req.message}>· {req.message}</span>
        )}
        {!isOpen && req.filledByPoolUser && (
          <span className="ml-1 inline-flex items-center gap-1 text-xs text-blue-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {req.filledByPoolUser.firstName} {req.filledByPoolUser.lastName}
          </span>
        )}
      </div>
      <Button type="button" size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={onCancel}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}
