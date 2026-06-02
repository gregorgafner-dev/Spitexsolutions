'use client'

import { useCallback, useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import type { FahrzeugAuswertung } from '@/lib/szs-admin/cockpit/fahrzeug-auswertung'

const DEFAULT_FROM = '2026-05-04'
const DEFAULT_TO = '2026-06-01'

function fmtPct(n: number): string {
  return `${new Intl.NumberFormat('de-CH', { maximumFractionDigits: 1 }).format(n)}%`
}

function fmtDe(iso: string): string {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10))
  return new Date(y, m - 1, d).toLocaleDateString('de-CH')
}

export default function FahrzeugAuswertungPanel() {
  const [dateFrom, setDateFrom] = useState(DEFAULT_FROM)
  const [dateTo, setDateTo] = useState(DEFAULT_TO)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<FahrzeugAuswertung | null>(null)

  const loadAuswertung = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ dateFrom, dateTo })
      const res = await fetch(
        `/api/szs-admin/cockpit/fahrzeuge/auswertung?${params.toString()}`,
        { cache: 'no-store' }
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'Auswertung konnte nicht geladen werden.')
        setData(null)
        return
      }
      setData(body.auswertung ?? null)
    } catch {
      setError('Verbindungsfehler beim Laden der Auswertung.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => {
    void loadAuswertung()
  }, [loadAuswertung])

  function exportExcel() {
    if (!data) return

    const wb = XLSX.utils.book_new()

    const summaryRows = data.vehicles.map((v) => ({
      Fahrzeug: v.kontrollschild,
      Standort: v.standort,
      Typ: v.typ,
      'SOLL (%)': v.sollPct,
      'Ø IST (%)': Number(v.avgIstPct.toFixed(2)),
      'Delta IST–SOLL (%)': Number(v.deltaPct.toFixed(2)),
      'Tage mit Nutzung': v.daysWithUsage,
      'Tage im Zeitraum': data.daysInRange,
    }))
    summaryRows.push({
      Fahrzeug: 'Flotte Ø',
      Standort: '',
      Typ: '',
      'SOLL (%)': Number(data.fleetAvgSoll.toFixed(2)),
      'Ø IST (%)': Number(data.fleetAvgIst.toFixed(2)),
      'Delta IST–SOLL (%)': Number(data.fleetDelta.toFixed(2)),
      'Tage mit Nutzung': 0,
      'Tage im Zeitraum': data.daysInRange,
    })
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows)
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Zusammenfassung')

    const dailyRows = data.daily.map((row) => ({
      Datum: row.date,
      Fahrzeug: row.kontrollschild,
      Standort: row.standort,
      VM: row.vormittag ? 'ja' : 'nein',
      NM: row.nachmittag ? 'ja' : 'nein',
      Abend: row.abend ? 'ja' : 'nein',
      'IST (%)': Number(row.istPct.toFixed(2)),
      'SOLL (%)': row.sollPct,
      'Delta (%)': Number(row.deltaPct.toFixed(2)),
    }))
    const wsDaily = XLSX.utils.json_to_sheet(dailyRows)
    XLSX.utils.book_append_sheet(wb, wsDaily, 'Tagesdetail')

    XLSX.writeFile(wb, `Fahrzeug-Auslastung_${dateFrom}_${dateTo}.xlsx`)
  }

  return (
    <div className="mt-10 rounded-xl border border-violet-200 bg-violet-50/30 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-bold text-gray-950">
            3) Auswertung Flotten-Auslastung
          </div>
          <p className="mt-1 text-sm font-medium text-gray-800">
            Ø IST pro Fahrzeug über einen Zeitraum, verglichen mit dem hinterlegten SOLL-Wert.
            Basis sind alle erfassten Tages-Checkboxen (VM / NM / Abend).
          </p>
        </div>
        {data && (
          <button
            type="button"
            onClick={exportExcel}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Als Excel exportieren
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-violet-200 bg-white p-4">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-violet-900">
            Von
          </span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="mt-1 block rounded-md border border-violet-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-violet-900">
            Bis
          </span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="mt-1 block rounded-md border border-violet-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900"
          />
        </label>
        <button
          type="button"
          onClick={() => void loadAuswertung()}
          disabled={loading}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {loading ? 'Lade…' : 'Auswertung aktualisieren'}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                Zeitraum
              </div>
              <div className="mt-1 text-sm font-bold text-gray-950">
                {fmtDe(data.dateFrom)} – {fmtDe(data.dateTo)}
              </div>
              <div className="text-xs text-gray-600">{data.daysInRange} Kalendertage</div>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-800">
                Flotte Ø IST
              </div>
              <div className="mt-1 text-2xl font-extrabold text-blue-950">
                {fmtPct(data.fleetAvgIst)}
              </div>
            </div>
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-indigo-800">
                Flotte Ø SOLL
              </div>
              <div className="mt-1 text-2xl font-extrabold text-indigo-950">
                {fmtPct(data.fleetAvgSoll)}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                Delta IST zu SOLL
              </div>
              <div
                className={`mt-1 text-2xl font-extrabold ${
                  data.fleetDelta >= 0 ? 'text-emerald-800' : 'text-rose-800'
                }`}
              >
                {fmtPct(data.fleetDelta)}
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-900">
                <tr>
                  <th className="px-3 py-2 text-left font-bold">Fahrzeug</th>
                  <th className="px-3 py-2 text-left font-bold">Standort</th>
                  <th className="px-3 py-2 text-right font-bold">SOLL</th>
                  <th className="px-3 py-2 text-right font-bold">Ø IST</th>
                  <th className="px-3 py-2 text-right font-bold">Delta</th>
                  <th className="px-3 py-2 text-right font-bold">Tage mit Nutzung</th>
                </tr>
              </thead>
              <tbody>
                {data.vehicles.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                      Keine aktiven Fahrzeuge in der Flotte hinterlegt.
                    </td>
                  </tr>
                ) : (
                  data.vehicles.map((v) => (
                    <tr key={v.vehicleId} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-semibold">{v.kontrollschild}</td>
                      <td className="px-3 py-2">{v.standort}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtPct(v.sollPct)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">
                        {fmtPct(v.avgIstPct)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums font-semibold ${
                          v.deltaPct >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {fmtPct(v.deltaPct)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {v.daysWithUsage} / {data.daysInRange}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-gray-600">
            Ø IST = Mittelwert über alle Kalendertage im Zeitraum (Tage ohne Häkchen zählen als 0 %).
            Excel-Export enthält zusätzlich ein Blatt „Tagesdetail“ mit allen VM/NM/Abend-Einträgen.
          </p>
        </>
      )}
    </div>
  )
}
