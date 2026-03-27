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

    setLoading(true)
    try {
      const res = await fetch('/api/admin/hotel-invoice/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, klvHours: klv }),
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

