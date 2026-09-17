'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, Download, FileText, Loader2, TrendingUp } from 'lucide-react'

interface Employee {
  id: string
  user: {
    firstName: string
    lastName: string
    email: string
  }
}

interface HistoryRow {
  year: number
  month: number
  label: string
  hasData: boolean
  previousBalance: number
  actualHours: number
  surchargeHours: number
  targetHours: number
  monthDelta: number
  adjustmentHours: number
  balance: number
}

interface HistoryResponse {
  employee: {
    id: string
    firstName: string
    lastName: string
    email: string
    pensum: number
    employmentType: string
  }
  from: { year: number; month: number }
  to: { year: number; month: number }
  rows: HistoryRow[]
}

const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

function formatSignedHHMM(hours: number): string {
  const totalMinutes = Math.round(hours * 60)
  const sign = totalMinutes < 0 ? '-' : '+'
  const abs = Math.abs(totalMinutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `${sign}${h}:${String(m).padStart(2, '0')}`
}

// Auswahlmonate ab Januar 2025 bis zum aktuellen Monat.
function buildMonthOptions(): Array<{ value: string; label: string }> {
  const now = new Date()
  const startYear = 2025
  const startMonth = 1
  const endYear = now.getFullYear()
  const endMonth = now.getMonth() + 1

  const options: Array<{ value: string; label: string }> = []
  let y = startYear
  let m = startMonth
  while (y < endYear || (y === endYear && m <= endMonth)) {
    options.push({
      value: `${y}-${String(m).padStart(2, '0')}`,
      label: `${MONTH_NAMES[m - 1]} ${y}`,
    })
    if (m === 12) {
      m = 1
      y++
    } else {
      m++
    }
  }
  return options.reverse()
}

export default function HourBalanceHistory({ employees }: { employees: Employee[] }) {
  const monthOptions = useMemo(() => buildMonthOptions(), [])

  const defaultTo = monthOptions[0]?.value ?? ''
  const defaultFrom = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-01`
  }, [])

  const [selectedEmployee, setSelectedEmployee] = useState<string>('')
  const [fromMonth, setFromMonth] = useState<string>(defaultFrom)
  const [toMonth, setToMonth] = useState<string>(defaultTo)
  const [loading, setLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [data, setData] = useState<HistoryResponse | null>(null)

  const employeeName = (id: string) => {
    const e = employees.find((x) => x.id === id)
    return e ? `${e.user.firstName} ${e.user.lastName}` : ''
  }

  const validate = (): string | null => {
    if (!selectedEmployee) return 'Bitte einen Mitarbeiter auswählen.'
    if (!fromMonth || !toMonth) return 'Bitte Von- und Bis-Monat auswählen.'
    if (fromMonth > toMonth) return 'Der Von-Monat darf nicht nach dem Bis-Monat liegen.'
    return null
  }

  const handleShow = async () => {
    const v = validate()
    if (v) {
      setError(v)
      return
    }
    setError('')
    setLoading(true)
    setData(null)
    try {
      const res = await fetch(
        `/api/admin/hour-balance-history?employeeId=${selectedEmployee}&from=${fromMonth}&to=${toMonth}`
      )
      if (!res.ok) {
        const msg = await res.json().catch(() => null)
        setError(msg?.error || 'Übersicht konnte nicht geladen werden.')
        return
      }
      const json = (await res.json()) as HistoryResponse
      setData(json)
    } catch {
      setError('Ein Fehler ist aufgetreten beim Laden der Übersicht.')
    } finally {
      setLoading(false)
    }
  }

  const handlePdf = async () => {
    const v = validate()
    if (v) {
      setError(v)
      return
    }
    setError('')
    setPdfLoading(true)
    try {
      const res = await fetch(
        `/api/admin/hour-balance-history?employeeId=${selectedEmployee}&from=${fromMonth}&to=${toMonth}&format=pdf`
      )
      if (!res.ok) {
        const msg = await res.json().catch(() => null)
        setError(msg?.error || 'PDF konnte nicht generiert werden.')
        return
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Stundensaldoverlauf_${employeeName(selectedEmployee).replace(/\s+/g, '_')}_${fromMonth}_bis_${toMonth}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      setError('Ein Fehler ist aufgetreten beim Generieren des PDFs.')
    } finally {
      setPdfLoading(false)
    }
  }

  const handleCsv = () => {
    if (!data) return
    const header = ['Monat', 'Vortrag (h)', 'Ist (h)', 'Zuschlag (h)', 'Soll (h)', 'Delta Monat (h)', 'Anpassung (h)', 'Saldo Ende (h)']
    const lines = [header.join(';')]
    for (const r of data.rows) {
      if (!r.hasData) {
        lines.push([r.label, '', '', '', '', '', r.adjustmentHours ? r.adjustmentHours.toFixed(2) : '', 'keine Daten'].join(';'))
        continue
      }
      lines.push(
        [
          r.label,
          r.previousBalance.toFixed(2),
          r.actualHours.toFixed(2),
          r.surchargeHours.toFixed(2),
          r.targetHours.toFixed(2),
          r.monthDelta.toFixed(2),
          r.adjustmentHours.toFixed(2),
          r.balance.toFixed(2),
        ].join(';')
      )
    }
    const csv = '\uFEFF' + lines.join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Stundensaldoverlauf_${employeeName(selectedEmployee).replace(/\s+/g, '_')}_${fromMonth}_bis_${toMonth}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  }

  const lastWithData = data ? [...data.rows].reverse().find((r) => r.hasData) : undefined

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label htmlFor="history-employee">Mitarbeiter</Label>
          <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
            <SelectTrigger id="history-employee">
              <SelectValue placeholder="Mitarbeiter auswählen" />
            </SelectTrigger>
            <SelectContent>
              {employees.map((employee) => (
                <SelectItem key={employee.id} value={employee.id}>
                  {employee.user.firstName} {employee.user.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="history-from">Von Monat</Label>
          <Select value={fromMonth} onValueChange={setFromMonth}>
            <SelectTrigger id="history-from">
              <SelectValue placeholder="Von auswählen" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((mo) => (
                <SelectItem key={mo.value} value={mo.value}>
                  {mo.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="history-to">Bis Monat</Label>
          <Select value={toMonth} onValueChange={setToMonth}>
            <SelectTrigger id="history-to">
              <SelectValue placeholder="Bis auswählen" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((mo) => (
                <SelectItem key={mo.value} value={mo.value}>
                  {mo.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleShow} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Wird geladen...
            </>
          ) : (
            <>
              <TrendingUp className="mr-2 h-4 w-4" />
              Übersicht anzeigen
            </>
          )}
        </Button>
        <Button variant="outline" onClick={handlePdf} disabled={pdfLoading}>
          {pdfLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              PDF wird generiert...
            </>
          ) : (
            <>
              <FileText className="mr-2 h-4 w-4" />
              Als PDF
            </>
          )}
        </Button>
        <Button variant="outline" onClick={handleCsv} disabled={!data}>
          <Download className="mr-2 h-4 w-4" />
          Als CSV
        </Button>
      </div>

      {data && (
        <div className="space-y-4">
          <div className="text-sm text-gray-600">
            <span className="font-medium">
              {data.employee.firstName} {data.employee.lastName}
            </span>{' '}
            · Pensum {data.employee.pensum}%
          </div>

          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-700">
                  <th className="text-left font-semibold px-3 py-2">Monat</th>
                  <th className="text-right font-semibold px-3 py-2">Vortrag</th>
                  <th className="text-right font-semibold px-3 py-2">Ist (h)</th>
                  <th className="text-right font-semibold px-3 py-2">Zuschlag (h)</th>
                  <th className="text-right font-semibold px-3 py-2">Soll (h)</th>
                  <th className="text-right font-semibold px-3 py-2">Diff. Monat</th>
                  <th className="text-right font-semibold px-3 py-2">Anpassung</th>
                  <th className="text-right font-semibold px-3 py-2">Saldo Ende</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={`${r.year}-${r.month}`} className="border-t">
                    <td className="px-3 py-2">{r.label}</td>
                    {r.hasData ? (
                      <>
                        <td className="px-3 py-2 text-right tabular-nums">{formatSignedHHMM(r.previousBalance)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.actualHours.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.surchargeHours.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.targetHours.toFixed(2)}</td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums ${r.monthDelta < 0 ? 'text-red-600' : 'text-green-700'}`}
                        >
                          {formatSignedHHMM(r.monthDelta)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.adjustmentHours !== 0 ? formatSignedHHMM(r.adjustmentHours) : '–'}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-semibold tabular-nums ${
                            r.balance < 0 ? 'text-red-600' : 'text-green-700'
                          }`}
                        >
                          {formatSignedHHMM(r.balance)}
                        </td>
                      </>
                    ) : (
                      <td className="px-3 py-2 text-gray-400 italic" colSpan={7}>
                        keine Daten für diesen Monat
                        {r.adjustmentHours !== 0 ? ` (Anpassung ${formatSignedHHMM(r.adjustmentHours)})` : ''}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {lastWithData && (
            <div className="text-base">
              <span className="font-medium">Endsaldo per {lastWithData.label}: </span>
              <span className={`font-bold ${lastWithData.balance < 0 ? 'text-red-600' : 'text-green-700'}`}>
                {formatSignedHHMM(lastWithData.balance)} ({lastWithData.balance.toFixed(2)} h)
              </span>
            </div>
          )}

          <div className="text-xs text-gray-500 space-y-1">
            <p>
              <span className="font-medium">Saldo Ende</span> = Vortrag + Ist + Zuschlag − Soll ± Anpassungen (kumuliert,
              per Ende des jeweiligen Monats).
            </p>
            <p>
              <span className="font-medium">Ist</span> enthält bezahlte Absenzen (Krankheit/Ferien) gemäss Soll.{' '}
              <span className="font-medium">Anpassung</span> = manuelle Stundensaldo-Korrekturen (z. B. Auszahlungen) in
              diesem Monat. Werte in <span className="font-mono">±HH:MM</span>.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
