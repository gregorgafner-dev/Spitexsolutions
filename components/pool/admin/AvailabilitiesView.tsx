'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Sun, Moon, CheckCircle2, RotateCcw, UserCheck } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { POOL_TEAMS, POOL_TEAM_IDS, type PoolTeamId } from '@/lib/pool/teams'

type Member = {
  id: string
  firstName: string
  lastName: string
  email: string
  active: boolean
  role: 'PLANNER' | 'MEMBER'
}

type AvailabilityItem = {
  id: string
  date: string // yyyy-mm-dd
  shift: 'EARLY' | 'LATE'
  poolUser: { id: string; firstName: string; lastName: string; email: string; active: boolean }
  isBooked: boolean
  bookedTeam: PoolTeamId | null
  bookedTeamLabel: string | null
  bookingId: string | null
}

function isoToday(): string {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

function isoPlusDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10))
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatDe(iso: string): string {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10))
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function AvailabilitiesView() {
  const [members, setMembers] = useState<Member[]>([])
  const [items, setItems] = useState<AvailabilityItem[]>([])
  const [loading, setLoading] = useState(false)

  // Filter
  const [dateFrom, setDateFrom] = useState<string>(isoToday())
  const [dateTo, setDateTo] = useState<string>(isoPlusDays(isoToday(), 60))
  const [poolUserId, setPoolUserId] = useState<string>('all')
  const [shift, setShift] = useState<string>('all')
  const [status, setStatus] = useState<string>('all')

  // Booking-Dialog
  const [bookingTarget, setBookingTarget] = useState<AvailabilityItem | null>(null)

  // Mitglieder einmalig laden
  useEffect(() => {
    fetch('/api/pool/members', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setMembers(d.members ?? []))
      .catch(() => {})
  }, [])

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (poolUserId !== 'all') params.set('poolUserId', poolUserId)
      if (shift !== 'all') params.set('shift', shift)
      if (status !== 'all') params.set('status', status)
      const res = await fetch(`/api/pool/availabilities?${params.toString()}`, { cache: 'no-store' })
      if (res.ok) {
        const d = await res.json()
        setItems(d.items ?? [])
      } else {
        setItems([])
      }
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, poolUserId, shift, status])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const stats = useMemo(() => {
    const open = items.filter((i) => !i.isBooked).length
    const booked = items.filter((i) => i.isBooked).length
    return { total: items.length, open, booked }
  }, [items])

  function resetFilters() {
    setDateFrom(isoToday())
    setDateTo(isoPlusDays(isoToday(), 60))
    setPoolUserId('all')
    setShift('all')
    setStatus('all')
  }

  return (
    <div className="space-y-4">
      {/* Filter-Panel */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
          <div>
            <Label htmlFor="f-from" className="text-xs">Von</Label>
            <Input id="f-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="f-to" className="text-xs">Bis</Label>
            <Input id="f-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="f-member" className="text-xs">Mitarbeitende</Label>
            <select
              id="f-member"
              value={poolUserId}
              onChange={(e) => setPoolUserId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="all">Alle</option>
              {members
                .filter((m) => m.role === 'MEMBER')
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.firstName} {m.lastName}
                    {!m.active ? ' (inaktiv)' : ''}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <Label htmlFor="f-shift" className="text-xs">Schicht</Label>
            <select
              id="f-shift"
              value={shift}
              onChange={(e) => setShift(e.target.value)}
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="all">Alle</option>
              <option value="EARLY">Frühdienst (F)</option>
              <option value="LATE">Spätdienst (S)</option>
            </select>
          </div>
          <div>
            <Label htmlFor="f-status" className="text-xs">Status</Label>
            <select
              id="f-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="all">Alle</option>
              <option value="open">Offen</option>
              <option value="booked">Gebucht</option>
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-gray-600">
            <span className="font-medium">{stats.total}</span> Verfügbarkeit(en) –{' '}
            <span className="text-emerald-700">{stats.open} offen</span>,{' '}
            <span className="text-blue-700">{stats.booked} gebucht</span>
            {loading && <Loader2 className="ml-2 inline h-4 w-4 animate-spin text-gray-400" />}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Filter zurücksetzen
            </Button>
            <Button type="button" size="sm" onClick={fetchItems} disabled={loading}>
              Aktualisieren
            </Button>
          </div>
        </div>
      </div>

      {/* Tabelle */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-600">
              <tr>
                <th className="px-4 py-2">Datum</th>
                <th className="px-4 py-2">Schicht</th>
                <th className="px-4 py-2">Mitarbeiter:in</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">
                    Keine Verfügbarkeiten im gewählten Filter.
                  </td>
                </tr>
              )}
              {items.map((it) => (
                <tr key={it.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">{formatDe(it.date)}</td>
                  <td className="px-4 py-2">
                    {it.shift === 'EARLY' ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                        <Sun className="h-3.5 w-3.5" /> Frühdienst
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-800">
                        <Moon className="h-3.5 w-3.5" /> Spätdienst
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="font-medium text-gray-900">
                      {it.poolUser.firstName} {it.poolUser.lastName}
                    </div>
                    <div className="text-xs text-gray-500">{it.poolUser.email}</div>
                  </td>
                  <td className="px-4 py-2">
                    {it.isBooked ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Gebucht
                        {it.bookedTeamLabel && (
                          <span className="ml-1 text-blue-900">· {it.bookedTeamLabel}</span>
                        )}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Verfügbar
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {!it.isBooked ? (
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => setBookingTarget(it)}
                      >
                        <UserCheck className="mr-1 h-3.5 w-3.5" /> Buchen
                      </Button>
                    ) : (
                      <span className="text-xs text-gray-400">–</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <BookingDialog
        target={bookingTarget}
        onClose={() => setBookingTarget(null)}
        onDone={() => {
          setBookingTarget(null)
          fetchItems()
        }}
      />
    </div>
  )
}

function BookingDialog({
  target,
  onClose,
  onDone,
}: {
  target: AvailabilityItem | null
  onClose: () => void
  onDone: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [team, setTeam] = useState<PoolTeamId>('MAENNEDORF_UETIKON')

  useEffect(() => {
    if (target) {
      setNotes('')
      setError(null)
      setSaving(false)
      setTeam('MAENNEDORF_UETIKON')
    }
  }, [target])

  async function handleConfirm() {
    if (!target) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/pool/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolUserId: target.poolUser.id,
          date: target.date,
          shift: target.shift,
          team,
          notes: notes.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Buchung fehlgeschlagen.')
        return
      }
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dienst buchen</DialogTitle>
          <DialogDescription>
            Diese Verfügbarkeit wird verbindlich gebucht. Die Mitarbeiter:in wird informiert
            und kann den Eintrag anschliessend nicht mehr ändern.
          </DialogDescription>
        </DialogHeader>

        {target && (
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-gray-500">Datum: </span>
              <span className="font-medium">{formatDe(target.date)}</span>
            </div>
            <div>
              <span className="text-gray-500">Schicht: </span>
              <span className="font-medium">
                {target.shift === 'EARLY' ? 'Frühdienst' : 'Spätdienst'}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Mitarbeiter:in: </span>
              <span className="font-medium">
                {target.poolUser.firstName} {target.poolUser.lastName}
              </span>
            </div>
            <div>
              <Label htmlFor="b-team" className="text-xs">Team</Label>
              <select
                id="b-team"
                value={team}
                onChange={(e) => setTeam(e.target.value as PoolTeamId)}
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                {POOL_TEAM_IDS.map((id) => (
                  <option key={id} value={id}>{POOL_TEAMS[id].label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="b-notes" className="text-xs">Notiz (optional)</Label>
              <Input
                id="b-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="z.B. spezielle Absprache"
              />
            </div>
            {error && (
              <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? 'Buchen…' : 'Verbindlich buchen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
