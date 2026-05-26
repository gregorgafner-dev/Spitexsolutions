'use client'

import { useCallback, useEffect, useState } from 'react'
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
import { Sun, Moon, Loader2, Plus, X, CheckCircle2, AlertCircle, Send } from 'lucide-react'
import { POOL_TEAMS, POOL_TEAM_IDS, type PoolTeamId } from '@/lib/pool/teams'
import {
  POOL_QUALIFICATIONS,
  POOL_QUALIFICATION_IDS,
  type PoolQualificationId,
} from '@/lib/pool/qualifications'

type ShiftRequest = {
  id: string
  date: string
  shift: 'EARLY' | 'LATE'
  team: PoolTeamId
  teamLabel: string
  status: 'OPEN' | 'FILLED' | 'CANCELLED'
  message: string | null
  allowedQualifications: PoolQualificationId[]
  allowedQualificationLabels: string[]
  filledAt: string | null
  filledByPoolUser: { id: string; firstName: string; lastName: string } | null
  createdAt: string
}

function formatDe(iso: string): string {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10))
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
}

function isoToday(): string {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

export default function ShiftRequestsView() {
  const [items, setItems] = useState<ShiftRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [teamFilter, setTeamFilter] = useState<string>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<ShiftRequest | null>(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (teamFilter !== 'all') params.set('team', teamFilter)
      const res = await fetch(`/api/pool/shift-requests?${params.toString()}`, { cache: 'no-store' })
      if (res.ok) {
        const d = await res.json()
        setItems(d.items ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [statusFilter, teamFilter])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="r-status" className="text-xs">Status</Label>
            <select
              id="r-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flex h-9 rounded-md border border-gray-300 bg-white px-3 text-sm"
            >
              <option value="all">Alle</option>
              <option value="OPEN">Offen</option>
              <option value="FILLED">Übernommen</option>
              <option value="CANCELLED">Storniert</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="r-team" className="text-xs">Team</Label>
            <select
              id="r-team"
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="flex h-9 rounded-md border border-gray-300 bg-white px-3 text-sm"
            >
              <option value="all">Alle</option>
              {POOL_TEAM_IDS.map((id) => (
                <option key={id} value={id}>{POOL_TEAMS[id].label}</option>
              ))}
            </select>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="mr-1 h-4 w-4" />
          Neue Anfrage
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-600">
              <tr>
                <th className="px-4 py-2">Datum</th>
                <th className="px-4 py-2">Schicht</th>
                <th className="px-4 py-2">Team</th>
                <th className="px-4 py-2">Mindestqual.</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Notiz</th>
                <th className="px-4 py-2">Erstellt</th>
                <th className="px-4 py-2 text-right">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">
                    Keine Anfragen vorhanden.
                  </td>
                </tr>
              )}
              {items.map((it) => {
                const teamDef = POOL_TEAMS[it.team]
                return (
                <tr key={it.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">{formatDe(it.date)}</td>
                  <td className="px-4 py-2">
                    {it.shift === 'EARLY' ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                        <Sun className="h-3.5 w-3.5" /> Früh
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-800">
                        <Moon className="h-3.5 w-3.5" /> Spät
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${teamDef?.color ?? 'bg-gray-100 text-gray-700'}`}>
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${teamDef?.dotColor ?? 'bg-gray-500'}`} />
                      {teamDef?.label ?? it.team}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {it.allowedQualifications.length === 0 ? (
                      <span className="text-xs text-gray-400">alle</span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800"
                        title={it.allowedQualificationLabels.join(', ')}
                      >
                        {it.allowedQualifications.join(' / ')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={it.status} filledBy={it.filledByPoolUser} />
                  </td>
                  <td className="px-4 py-2 max-w-xs truncate" title={it.message ?? ''}>
                    <span className="text-gray-700">{it.message || '–'}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {new Date(it.createdAt).toLocaleString('de-CH', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {it.status === 'OPEN' || it.status === 'FILLED' ? (
                      <Button size="sm" variant="outline" onClick={() => setCancelTarget(it)}>
                        <X className="mr-1 h-3.5 w-3.5" />
                        Stornieren
                      </Button>
                    ) : (
                      <span className="text-xs text-gray-400">–</span>
                    )}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <CreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false)
          fetchItems()
        }}
      />

      <CancelDialog
        target={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onDone={() => {
          setCancelTarget(null)
          fetchItems()
        }}
      />
    </div>
  )
}

function StatusBadge({
  status,
  filledBy,
}: {
  status: ShiftRequest['status']
  filledBy: ShiftRequest['filledByPoolUser']
}) {
  if (status === 'OPEN') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
        <AlertCircle className="h-3.5 w-3.5" />
        Offen
      </span>
    )
  }
  if (status === 'FILLED') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {filledBy ? `${filledBy.firstName} ${filledBy.lastName}` : 'Übernommen'}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
      Storniert
    </span>
  )
}

function CreateDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [date, setDate] = useState<string>(isoToday())
  const [shift, setShift] = useState<'EARLY' | 'LATE'>('EARLY')
  const [team, setTeam] = useState<PoolTeamId>('MAENNEDORF_UETIKON')
  const [message, setMessage] = useState('')
  const [allowedQuals, setAllowedQuals] = useState<PoolQualificationId[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okInfo, setOkInfo] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setDate(isoToday())
      setShift('EARLY')
      setTeam('MAENNEDORF_UETIKON')
      setMessage('')
      setAllowedQuals([])
      setError(null)
      setOkInfo(null)
      setSaving(false)
    }
  }, [open])

  function toggleQual(q: PoolQualificationId) {
    setAllowedQuals((prev) => (prev.includes(q) ? prev.filter((x) => x !== q) : [...prev, q]))
  }

  async function handleSubmit() {
    setSaving(true)
    setError(null)
    setOkInfo(null)
    try {
      const res = await fetch('/api/pool/shift-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
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
          ? `Anfrage erstellt – an ${notified} von ${total} qualifizierten Mitarbeitenden geschickt.`
          : `Anfrage erstellt und an ${notified} Mitarbeitende geschickt.`
      setOkInfo(note)
      setTimeout(() => onCreated(), 800)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neue Dienstanfrage</DialogTitle>
          <DialogDescription>
            Erzeugt eine offene Anfrage. Alle aktiven Pool-Mitarbeitenden erhalten eine
            Postfach-Nachricht und können nach FCFS-Prinzip übernehmen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="c-date">Datum</Label>
            <Input id="c-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="c-shift">Schicht</Label>
            <select
              id="c-shift"
              value={shift}
              onChange={(e) => setShift(e.target.value as 'EARLY' | 'LATE')}
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="EARLY">Frühdienst</option>
              <option value="LATE">Spätdienst</option>
            </select>
          </div>
          <div>
            <Label htmlFor="c-team">Team</Label>
            <select
              id="c-team"
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
            <Label htmlFor="c-msg">Nachricht (optional)</Label>
            <Textarea
              id="c-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="z.B. ‘Pflegeintensiver Klient, Erfahrung mit Dekubitus von Vorteil’"
              rows={3}
            />
          </div>
          <div>
            <Label>Mindestqualifikation</Label>
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
          {error && <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>}
          {okInfo && <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">{okInfo}</div>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            <Send className="mr-1 h-4 w-4" />
            {saving ? 'Anlegen…' : 'Anfrage absenden'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CancelDialog({
  target,
  onClose,
  onDone,
}: {
  target: ShiftRequest | null
  onClose: () => void
  onDone: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    if (!target) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/pool/shift-requests/${target.id}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error || 'Stornieren fehlgeschlagen.')
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
          <DialogTitle>Anfrage stornieren?</DialogTitle>
          <DialogDescription>
            {target && (
              <>
                {formatDe(target.date)} – {target.shift === 'EARLY' ? 'Frühdienst' : 'Spätdienst'} ·{' '}
                {target.teamLabel}.
                {target.status === 'FILLED' && (
                  <> Die zugehörige Buchung wird ebenfalls aufgehoben.</>
                )}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {error && <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={saving}>
            {saving ? 'Storniere…' : 'Ja, stornieren'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
