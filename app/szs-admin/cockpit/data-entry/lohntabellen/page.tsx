"use client";

import Navigation from "@/components/admin-szs/cockpit/Navigation";
import { useEffect, useMemo, useState } from "react";

type ApiResponse = {
  meta: { year: number; sourceUrl: string; classes: string[]; rowCount: number };
  rows: { stufe: string; values: Array<number | null> }[];
};

function formatChf(n: number) {
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function LohntabellenPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedStufe, setSelectedStufe] = useState<string>("");
  const [selectedKlasse, setSelectedKlasse] = useState<string>("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch("/api/szs-admin/cockpit/lohntabellen/zh/2025", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const t = await r.text();
          throw new Error(`${r.status} ${r.statusText}: ${t}`);
        }
        return r.json();
      })
      .then((json) => {
        if (!alive) return;
        setData(json);
        setError(null);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e?.message ?? String(e));
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const stufen = useMemo(() => data?.rows?.map((r) => r.stufe) ?? [], [data]);
  const klassen = useMemo(() => data?.meta?.classes ?? [], [data]);

  useEffect(() => {
    if (!data) return;
    if (!selectedStufe && stufen.length) setSelectedStufe(stufen[0]);
    if (!selectedKlasse && klassen.length) setSelectedKlasse(klassen[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const lookup = useMemo(() => {
    if (!data || !selectedStufe || !selectedKlasse) return null;
    const row = data.rows.find((r) => r.stufe === selectedStufe);
    const colIdx = data.meta.classes.findIndex((c) => c === selectedKlasse);
    if (!row || colIdx < 0) return null;
    const value = row.values[colIdx];
    return typeof value === "number" ? value : null;
  }, [data, selectedKlasse, selectedStufe]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-gray-900">Lohntabellen</h1>
          <p className="text-sm text-gray-600 mt-1">
            Hinterlegt: Kreuztabelle aller kantonalen Lohnklassen (Kanton Zürich) – Jahr{" "}
            <span className="font-medium">{data?.meta?.year ?? "…"}</span>.
          </p>

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg shadow border border-gray-200 p-5">
              <h2 className="text-base font-semibold text-gray-900 mb-3">
                Lookup
              </h2>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Lohnstufe
                  </label>
                  <select
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={selectedStufe}
                    onChange={(e) => setSelectedStufe(e.target.value)}
                    disabled={!stufen.length}
                  >
                    {stufen.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Klasse
                  </label>
                  <select
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={selectedKlasse}
                    onChange={(e) => setSelectedKlasse(e.target.value)}
                    disabled={!klassen.length}
                  >
                    {klassen.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                  <div className="text-xs text-gray-600 mb-1">Betrag</div>
                  <div className="text-lg font-semibold text-gray-900 tabular-nums">
                    {lookup === null ? "—" : formatChf(lookup)}
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  Quelle:{" "}
                  {data?.meta?.sourceUrl ? (
                    <a
                      className="text-blue-700 hover:text-blue-800 underline break-all"
                      href={data.meta.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {data.meta.sourceUrl}
                    </a>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 bg-white rounded-lg shadow border border-gray-200">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between gap-3">
                <div className="text-sm text-gray-700">
                  <span className="font-medium">Tabelle</span>{" "}
                  {data?.meta?.rowCount ? (
                    <span className="text-gray-500">
                      · {data.meta.rowCount} Stufen · {data.meta.classes.length} Klassen
                    </span>
                  ) : null}
                </div>
                {loading ? (
                  <div className="text-sm text-gray-600">Lade…</div>
                ) : error ? (
                  <div className="text-sm text-red-700">Fehler: {error}</div>
                ) : null}
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[1100px] w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Lohnstufe
                      </th>
                      {(data?.meta?.classes ?? []).map((c) => (
                        <th
                          key={c}
                          className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                        >
                          Klasse {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {(data?.rows ?? []).map((r) => (
                      <tr key={r.stufe}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                          {r.stufe}
                        </td>
                        {r.values.map((v, i) => (
                          <td
                            key={`${r.stufe}-${i}`}
                            className="px-3 py-3 text-sm text-gray-900 text-right tabular-nums whitespace-nowrap"
                          >
                            {typeof v === "number" ? formatChf(v) : "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {!loading && !error && (data?.rows?.length ?? 0) === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-sm text-gray-600" colSpan={(data?.meta?.classes?.length ?? 0) + 1}>
                          Keine Daten.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="mt-6 text-xs text-gray-500">
            Hinweis: Für Berechnungen ist eine strukturierte Tabelle (wie hier) deutlich robuster als ein PDF. PDF eignet sich eher für reine Anzeige/Archiv.
          </div>
        </div>
      </main>
    </div>
  );
}

