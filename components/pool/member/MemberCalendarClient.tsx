'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sun, Moon, Loader2, Lock } from 'lucide-react'
import PoolMonthCalendar from '@/components/pool/PoolMonthCalendar'
import { POOL_SHIFTS, type PoolShiftId } from '@/lib/pool/holidays-zh'

type CalendarData = {
  availability: Record<string, string[]>
  bookings: Record<string, string[]>
}

function todayParts() {
  const t = new Date()
  return { year: t.getFullYear(), month: t.getMonth() }
}

function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10))
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export default function MemberCalendarClient() {
  const init = todayParts()
  const [year, setYear] = useState<number>(init.year)
  const [monthIndex, setMonthIndex] = useState<number>(init.month)
  const [data, setData] = useState<CalendarData>({ availability: {}, bookings: {} })
  const [loading, setLoading] = useState(true)
  const [editIso, setEditIso] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/pool/me/calendar?year=${year}&month=${monthIndex + 1}`, { cache: 'no-store' })
      if (res.ok) {
        const d = await res.json()
        setData({ availability: d.availability ?? {}, bookings: d.bookings ?? {} })
      }
    } finally {
      setLoading(false)
    }
  }, [year, monthIndex])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const availabilitySets = useMemo(() => {
    const out: Record<string, Set<PoolShiftId>> = {}
    for (const [iso, shifts] of Object.entries(data.availability)) {
      out[iso] = new Set(shifts as PoolShiftId[])
    }
    return out
  }, [data])
  const bookingSets = useMemo(() => {
    const out: Record<string, Set<PoolShiftId>> = {}
    for (const [iso, shifts] of Object.entries(data.bookings)) {
      out[iso] = new Set(shifts as PoolShiftId[])
    }
    return out
  }, [data])

  const todayIso = useMemo(() => {
    const t = new Date()
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  }, [])

  const handleDayClick = useCallback(
    (iso: string) => {
      if (iso < todayIso) return
      setEditIso(iso)
    },
    [todayIso]
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="text-gray-600">
          Klicke auf einen zukünftigen Tag, um deine Verfügbarkeit einzutragen.
          {loading && <Loader2 className="ml-2 inline h-4 w-4 animate-spin text-gray-400" />}
        </div>
      </div>

      <PoolMonthCalendar
        initialYear={year}
        initialMonth={monthIndex}
        availability={availabilitySets}
        bookings={bookingSets}
        onDayClick={handleDayClick}
        onMonthChange={(y, m) => {
          setYear(y)
          setMonthIndex(m)
        }}
      />

      <EditDialog
        iso={editIso}
        current={editIso ? (data.availability[editIso] ?? []) : []}
        booked={editIso ? (data.bookings[editIso] ?? []) : []}
        onClose={() => setEditIso(null)}
        onSaved={() => {
          setEditIso(null)
          fetchData()
        }}
      />
    </div>
  )
}

function EditDialog({
  iso,
  current,
  booked,
  onClose,
  onSaved,
}: {
  iso: string | null
  current: string[]
  booked: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [early, setEarly] = useState(false)
  const [late, setLate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (iso) {
      setEarly(current.includes('EARLY') || booked.includes('EARLY'))
      setLate(current.includes('LATE') || booked.includes('LATE'))
      setError(null)
      setSaving(false)
    }
  }, [iso, current, booked])

  const earlyLocked = booked.includes('EARLY')
  const lateLocked = booked.includes('LATE')

  async function handleSave() {
    if (!iso) return
    setSaving(true)
    setError(null)
    try {
      const shifts: string[] = []
      if (early) shifts.push('EARLY')
      if (late) shifts.push('LATE')
      const res = await fetch('/api/pool/me/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: iso, shifts }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Speichern fehlgeschlagen.')
        return
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={iso !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Verfügbarkeit</DialogTitle>
          <DialogDescription>{iso ? formatDay(iso) : ''}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <ShiftToggle
            icon={Sun}
            iconClass="text-amber-500"
            label={POOL_SHIFTS.EARLY.label}
            checked={early}
            locked={earlyLocked}
            onChange={setEarly}
          />
          <ShiftToggle
            icon={Moon}
            iconClass="text-indigo-500"
            label={POOL_SHIFTS.LATE.label}
            checked={late}
            locked={lateLocked}
            onChange={setLate}
          />
          <p className="mt-3 text-xs text-gray-500">
            Gesperrte Schichten sind bereits durch die Planung gebucht und können nicht mehr
            geändert werden.
          </p>
          {error && <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? 'Speichern…' : 'Speichern'}
          </Button>
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
          ? 'border-blue-200 bg-blue-50 cursor-not-allowed'
          : checked
            ? 'border-emerald-300 bg-emerald-50 cursor-pointer'
            : 'border-gray-200 bg-white cursor-pointer hover:bg-gray-50'
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
