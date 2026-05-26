'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sun,
  Moon,
  Loader2,
  RefreshCw,
  Calendar as CalendarIcon,
  Download,
} from 'lucide-react'
import { POOL_TEAMS, type PoolTeamId } from '@/lib/pool/teams'
import { POOL_AVAILABLE_YEARS } from '@/lib/pool/holidays-zh'

type BookingItem = {
  id: string
  date: string
  weekday: number
  isWeekend: boolean
  holidayLabel: string | null
  shift: 'EARLY' | 'LATE'
  shiftLabel: string
  team: PoolTeamId
  teamLabel: string
  notes: string | null
  hasSourceRequest: boolean
  createdAt: string
}

type Summary = {
  total: number
  early: number
  late: number
  weekend: number
  holiday: number
}

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
] as const

function formatDe(iso: string): string {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10))
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('de-CH', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function MemberBookingsView() {
  const now = new Date()
  const defaultYear = POOL_AVAILABLE_YEARS.includes(now.getFullYear())
    ? now.getFullYear()
    : POOL_AVAILABLE_YEARS[0]
  const [year, setYear] = useState<number>(defaultYear)
  const [month, setMonth] = useState<number | 'all'>(now.getMonth() + 1)
  const [items, setItems] = useState<BookingItem[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ year: String(year) })
      if (month !== 'all') params.set('month', String(month))
      const res = await fetch(`/api/pool/me/bookings?${params.toString()}`, {
        cache: 'no-store',
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error || 'Buchungen konnten nicht geladen werden.')
        setItems([])
        setSummary(null)
        return
      }
      setItems(d.items ?? [])
      setSummary(d.summary ?? null)
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const periodLabel = useMemo(() => {
    if (month === 'all') return `Jahr ${year}`
    return `${MONTHS[month - 1]} ${year}`
  }, [year, month])

  function handleExportCsv() {
    const header = [
      'Datum',
      'Wochentag',
      'Schicht',
      'Team',
      'Wochenende',
      'Feiertag',
      'Notiz',
    ]
    const rows = items.map((b) => [
      b.date,
      formatDe(b.date).split(',')[0],
      b.shiftLabel,
      b.teamLabel,
      b.isWeekend ? 'ja' : 'nein',
      b.holidayLabel ?? '',
      b.notes ?? '',
    ])
    downloadCsv(
      `meine-dienste-${year}${month === 'all' ? '' : `-${String(month).padStart(2, '0')}`}.csv`,
      [header, ...rows]
    )
  }

  return (
    <div className="space-y-4">
      {/* Filterleiste */}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700">Jahr</label>
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
              className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
            >
              {POOL_AVAILABLE_YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700">Monat</label>
            <select
              value={month}
              onChange={(e) => {
                const v = e.target.value
                setMonth(v === 'all' ? 'all' : parseInt(v, 10))
              }}
              className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
            >
              <option value="all">Gesamtes Jahr</option>
              {MONTHS.map((label, idx) => (
                <option key={idx} value={idx + 1}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchItems}
            disabled={loading}
          >
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Aktualisieren
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleExportCsv}
          disabled={items.length === 0}
          title="CSV-Export für die Abrechnung"
        >
          <Download className="mr-1 h-3.5 w-3.5" />
          CSV exportieren
        </Button>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <SummaryCard label="Total Dienste" value={summary.total} />
          <SummaryCard
            label="Frühdienst"
            value={summary.early}
            icon={<Sun className="h-4 w-4 text-amber-500" />}
          />
          <SummaryCard
            label="Spätdienst"
            value={summary.late}
            icon={<Moon className="h-4 w-4 text-indigo-500" />}
          />
          <SummaryCard
            label="Wochenende"
            value={summary.weekend}
            tone="rose"
          />
          <SummaryCard
            label="Feiertag"
            value={summary.holiday}
            tone="amber"
          />
        </div>
      )}

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Tabelle */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3">
          <CalendarIcon className="h-4 w-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-700">
            Buchungen · {periodLabel}
          </h2>
          {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin text-gray-400" />}
        </div>

        {!loading && items.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">
            Keine Buchungen in diesem Zeitraum.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50/60">
                <tr>
                  <Th>Datum</Th>
                  <Th>Schicht</Th>
                  <Th>Team</Th>
                  <Th>Tag-Typ</Th>
                  <Th>Notiz</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((b) => {
                  const team = POOL_TEAMS[b.team]
                  const ShiftIcon = b.shift === 'EARLY' ? Sun : Moon
                  return (
                    <tr key={b.id} className="hover:bg-gray-50/60">
                      <Td>
                        <div className="font-medium text-gray-900">
                          {formatDe(b.date)}
                        </div>
                      </Td>
                      <Td>
                        <span
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${
                            b.shift === 'EARLY'
                              ? 'border-amber-200 bg-amber-50 text-amber-800'
                              : 'border-indigo-200 bg-indigo-50 text-indigo-800'
                          }`}
                        >
                          <ShiftIcon className="h-3 w-3" />
                          {b.shiftLabel}
                        </span>
                      </Td>
                      <Td>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${team?.color ?? 'bg-gray-100 text-gray-700'}`}
                        >
                          <span className={`inline-block h-1.5 w-1.5 rounded-full ${team?.dotColor ?? 'bg-gray-500'}`} />
                          {team?.label ?? b.teamLabel}
                        </span>
                      </Td>
                      <Td>
                        <div className="flex flex-wrap items-center gap-1">
                          {b.holidayLabel ? (
                            <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                              Feiertag · {b.holidayLabel}
                            </span>
                          ) : b.isWeekend ? (
                            <span className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">
                              Wochenende
                            </span>
                          ) : (
                            <span className="text-xs text-gray-500">Werktag</span>
                          )}
                        </div>
                      </Td>
                      <Td>
                        <span className="text-xs text-gray-600">
                          {b.notes ?? '–'}
                        </span>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Hinweis: Diese Übersicht dient als Grundlage für die spätere Lohn-Abrechnung.
        Wochenend- und Feiertagsdienste sind markiert. Bei Fragen wende dich an die Planung.
      </p>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
      {children}
    </th>
  )
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string
  value: number
  icon?: React.ReactNode
  tone?: 'rose' | 'amber'
}) {
  const toneClasses =
    tone === 'rose'
      ? 'border-rose-200 bg-rose-50'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50'
        : 'border-gray-200 bg-white'
  return (
    <div className={`rounded-xl border p-3 shadow-sm ${toneClasses}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        {icon}
      </div>
      <div className="mt-1 text-2xl font-bold text-gray-900">{value}</div>
    </div>
  )
}
