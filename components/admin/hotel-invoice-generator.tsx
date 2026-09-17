'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function monthToYYYYMM(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export default function HotelInvoiceGenerator() {
  const defaultMonth = useMemo(() => monthToYYYYMM(new Date()), [])
  const [month, setMonth] = useState(defaultMonth)
  const [klvHours, setKlvHours] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [manualOverride, setManualOverride] = useState(false)
  const [workMonthlySalaryHours, setWorkMonthlySalaryHours] = useState<string>('')
  const [workHourlyWageHours, setWorkHourlyWageHours] = useState<string>('')
  const [sleepHours, setSleepHours] = useState<string>('')

  const parseOptional = (raw: string): { ok: boolean; value?: number } => {
    const trimmed = raw.trim()
    if (trimmed === '') return { ok: true }
    const value = Number(trimmed.replace(',', '.'))
    if (!Number.isFinite(value) || value < 0) return { ok: false }
    return { ok: true, value }
  }

  const onGenerate = async () => {
    setError(null)

    const klv = Number(klvHours.replace(',', '.'))
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      setError('Bitte einen gültigen Monat wählen.')
      return
    }
    if (!Number.isFinite(klv) || klv < 0) {
      setError('Bitte eine gültige Zahl für "Stunden KLV-verrechnet" eingeben.')
      return
    }

    const payload: Record<string, unknown> = { month, klvHours: klv }

    if (manualOverride) {
      const monthlySalary = parseOptional(workMonthlySalaryHours)
      const hourlyWage = parseOptional(workHourlyWageHours)
      const sleep = parseOptional(sleepHours)

      if (!monthlySalary.ok || !hourlyWage.ok || !sleep.ok) {
        setError('Bitte für die manuellen Werte gültige Zahlen (≥ 0) eingeben.')
        return
      }

      if (monthlySalary.value !== undefined) payload.workMonthlySalaryHours = monthlySalary.value
      if (hourlyWage.value !== undefined) payload.workHourlyWageHours = hourlyWage.value
      if (sleep.value !== undefined) payload.sleepHours = sleep.value
    }

    setLoading(true)
    try {
      const res = await fetch('/api/admin/hotel-invoice/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const msg = await res.json().catch(() => null)
        throw new Error(msg?.error || 'PDF konnte nicht generiert werden.')
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = url
      a.download = `Rechnung_Hotel_${month}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()

      window.URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rechnung an Hotel</CardTitle>
        <CardDescription>
          Monat auswählen, Stunden KLV-verrechnet eintragen und PDF-Rechnung generieren. Alle weiteren Werte werden
          read-only aus der Datenbank berechnet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="month">Monat</Label>
            <Input id="month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="klv">Stunden KLV-verrechnet</Label>
            <Input
              id="klv"
              inputMode="decimal"
              placeholder="z.B. 644.33"
              value={klvHours}
              onChange={(e) => setKlvHours(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-md border border-gray-200 p-4 space-y-4">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={manualOverride}
              onChange={(e) => setManualOverride(e.target.checked)}
            />
            <span className="text-sm">
              <span className="font-medium">Stunden manuell überschreiben (einmalige Korrektur)</span>
              <span className="block text-gray-500">
                Nur für das PDF. Die gebuchten Stunden in der Datenbank bleiben unverändert. Leere Felder werden
                weiterhin aus der Datenbank berechnet.
              </span>
            </span>
          </label>

          {manualOverride && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="workMonthlySalaryHours">Std M&apos;Arb Monatslohn (Arbeit)</Label>
                <Input
                  id="workMonthlySalaryHours"
                  inputMode="decimal"
                  placeholder="z.B. 500.37"
                  value={workMonthlySalaryHours}
                  onChange={(e) => setWorkMonthlySalaryHours(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workHourlyWageHours">Std M&apos;Arb Stundenlohn (Arbeit)</Label>
                <Input
                  id="workHourlyWageHours"
                  inputMode="decimal"
                  placeholder="z.B. 668.51"
                  value={workHourlyWageHours}
                  onChange={(e) => setWorkHourlyWageHours(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sleepHours">Schlafstunden (Std Total)</Label>
                <Input
                  id="sleepHours"
                  inputMode="decimal"
                  placeholder="z.B. 160.53"
                  value={sleepHours}
                  onChange={(e) => setSleepHours(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}

        <div className="flex gap-2">
          <Button onClick={onGenerate} disabled={loading}>
            {loading ? 'Generiere…' : 'PDF-Rechnung generieren'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

