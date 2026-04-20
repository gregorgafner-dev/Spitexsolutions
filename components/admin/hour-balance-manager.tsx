'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type EmployeeLite = {
  id: string
  employmentType: string
  user: { firstName: string; lastName: string; email: string }
}

type AdjustmentRow = {
  id: string
  employeeId: string
  effectiveDate: string
  minutes: number
  reason: string
  createdAt: string
  employee?: { user?: { firstName: string; lastName: string } }
  createdByUser?: { email?: string } | null
}

const START_SALDI_NOV_2025: Array<{ matchFirstName: string; matchLastNameContains?: string; value: string }> = [
  { matchFirstName: 'Barbara', matchLastNameContains: 'Kost', value: '37:02' },
  { matchFirstName: 'Anna Joelle', matchLastNameContains: 'Furrer', value: '-3:43' },
  { matchFirstName: 'Almina', value: '36:04' },
  { matchFirstName: 'Adelina', value: '18:51' },
  { matchFirstName: 'Samantha', value: '28:58' },
]

function fullName(e: EmployeeLite) {
  return `${e.user.firstName} ${e.user.lastName}`.trim()
}

function normNamePart(s: string) {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^a-zäöüàéèêìíòóôùúçñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function HourBalanceManager({ employees }: { employees: EmployeeLite[] }) {
  const monthlySalaryEmployees = useMemo(
    () => employees.filter((e) => e.employmentType === 'MONTHLY_SALARY'),
    [employees]
  )

  const [startSaldoByEmployeeId, setStartSaldoByEmployeeId] = useState<Record<string, string>>({})
  const [initResult, setInitResult] = useState<any>(null)
  const [initLoading, setInitLoading] = useState(false)
  const [initError, setInitError] = useState('')

  const [adjEmployeeId, setAdjEmployeeId] = useState<string>('')
  const [adjEffectiveDate, setAdjEffectiveDate] = useState<string>('2026-12-01')
  const [adjAmount, setAdjAmount] = useState<string>('')
  const [adjReason, setAdjReason] = useState<string>('Auszahlung Plusstunden')
  const [adjLoading, setAdjLoading] = useState(false)
  const [adjError, setAdjError] = useState('')
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([])

  useEffect(() => {
    // Prefill the provided start saldi for Nov 2025.
    const next: Record<string, string> = {}
    for (const e of monthlySalaryEmployees) {
      const first = normNamePart(e.user.firstName)
      const last = normNamePart(e.user.lastName)
      const rule = START_SALDI_NOV_2025.find((r) => {
        const matchFirst = normNamePart(r.matchFirstName)
        if (!first || !matchFirst) return false
        if (!first.startsWith(matchFirst)) return false
        if (!r.matchLastNameContains) return true
        const needle = normNamePart(r.matchLastNameContains)
        return !!needle && last.includes(needle)
      })
      if (rule) next[e.id] = rule.value
    }
    setStartSaldoByEmployeeId(next)
  }, [monthlySalaryEmployees])

  async function loadAdjustments() {
    try {
      const res = await fetch('/api/admin/hour-balance-adjustments')
      if (!res.ok) return
      const data = await res.json()
      setAdjustments(Array.isArray(data) ? data : [])
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadAdjustments()
  }, [])

  async function handleInit() {
    setInitError('')
    setInitResult(null)
    setInitLoading(true)
    try {
      const items = Object.entries(startSaldoByEmployeeId)
        .filter(([, saldo]) => String(saldo || '').trim().length > 0)
        .map(([employeeId, saldo]) => ({ employeeId, saldo }))

      const res = await fetch('/api/admin/hour-balances/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setInitError(data?.error || 'Initialisierung fehlgeschlagen')
        setInitLoading(false)
        return
      }
      setInitResult(data)
    } catch {
      setInitError('Initialisierung fehlgeschlagen')
    } finally {
      setInitLoading(false)
    }
  }

  async function handleCreateAdjustment() {
    setAdjError('')
    setAdjLoading(true)
    try {
      const res = await fetch('/api/admin/hour-balance-adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: adjEmployeeId,
          effectiveDate: adjEffectiveDate,
          amount: adjAmount,
          reason: adjReason,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setAdjError(data?.details ? `${data?.error || 'Speichern fehlgeschlagen'} (${data.details})` : (data?.error || 'Speichern fehlgeschlagen'))
        setAdjLoading(false)
        return
      }
      setAdjAmount('')
      setAdjReason('Auszahlung Plusstunden')
      await loadAdjustments()
    } catch {
      setAdjError('Speichern fehlgeschlagen')
    } finally {
      setAdjLoading(false)
    }
  }

  async function handleDeleteAdjustment(id: string) {
    if (!id) return
    try {
      await fetch(`/api/admin/hour-balance-adjustments?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      await loadAdjustments()
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Startsaldi Stundensaldo (per Ende November 2025)</CardTitle>
          <CardDescription>
            Einmalige Initialisierung. Das setzt den Monats‑Saldo 11/2025 als Anker und berechnet ab 12/2025 bis heute neu.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            {monthlySalaryEmployees.map((e) => (
              <div key={e.id} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                <div className="text-sm font-medium">{fullName(e)}</div>
                <div className="text-xs text-gray-500">{e.user.email}</div>
                <div className="flex items-center gap-2">
                  <Input
                    value={startSaldoByEmployeeId[e.id] ?? ''}
                    onChange={(ev) =>
                      setStartSaldoByEmployeeId((prev) => ({ ...prev, [e.id]: ev.target.value }))
                    }
                    placeholder="z.B. 28:58 oder -3:43"
                  />
                </div>
              </div>
            ))}
          </div>

          {initError && <div className="text-sm text-red-600">{initError}</div>}
          {initResult && (
            <div className="text-xs bg-gray-50 border rounded p-3 whitespace-pre-wrap break-words">
              {JSON.stringify(initResult, null, 2)}
            </div>
          )}

          <Button onClick={handleInit} disabled={initLoading}>
            {initLoading ? 'Initialisiere…' : 'Startsaldi setzen (11/2025)'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manuelle Anpassungen (ab Dezember 2026)</CardTitle>
          <CardDescription>
            Für Fälle wie Auszahlung von Plusstunden. Diese Anpassungen verändern keine Zeiteinträge.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div className="space-y-1">
              <Label>Mitarbeiter</Label>
              <Select value={adjEmployeeId} onValueChange={setAdjEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {monthlySalaryEmployees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {fullName(e)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Datum</Label>
              <Input type="date" value={adjEffectiveDate} onChange={(e) => setAdjEffectiveDate(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label>Stunden (+/−) im Format HH:MM</Label>
              <Input value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} placeholder="z.B. -8:24" />
            </div>

            <div className="space-y-1">
              <Label>Grund</Label>
              <Input value={adjReason} onChange={(e) => setAdjReason(e.target.value)} placeholder="z.B. Auszahlung" />
            </div>
          </div>

          {adjError && <div className="text-sm text-red-600">{adjError}</div>}
          <Button onClick={handleCreateAdjustment} disabled={adjLoading || !adjEmployeeId}>
            {adjLoading ? 'Speichere…' : 'Anpassung speichern'}
          </Button>

          <div className="border-t pt-4">
            <div className="text-sm font-medium mb-2">Bestehende Anpassungen</div>
            <div className="space-y-2">
              {adjustments.length === 0 ? (
                <div className="text-sm text-gray-500">Noch keine Anpassungen erfasst.</div>
              ) : (
                adjustments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between border rounded p-3 bg-white">
                    <div className="text-sm">
                      <div className="font-medium">
                        {(a.employee?.user?.firstName ?? '') + ' ' + (a.employee?.user?.lastName ?? '')}
                      </div>
                      <div className="text-gray-600">
                        {new Date(a.effectiveDate).toLocaleDateString('de-CH')} | {a.minutes} min | {a.reason}
                      </div>
                      {a.createdByUser?.email ? (
                        <div className="text-xs text-gray-400">Erfasst von: {a.createdByUser.email}</div>
                      ) : null}
                    </div>
                    <Button variant="outline" onClick={() => handleDeleteAdjustment(a.id)}>
                      Löschen
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

