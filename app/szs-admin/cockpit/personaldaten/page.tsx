"use client";

import { useEffect, useMemo, useState } from "react";
import Navigation from "@/components/admin-szs/cockpit/Navigation";
import * as XLSX from "xlsx";

type Person = {
  pNr: string;
  name: string;
  vorname: string;
  nachname: string;
  beschaeftigungsgrad: string;
  funktion: string;
  abtNr?: string;
  abteilung?: string;
};

type MetaBase = { count: number; sheetName: string };
type ApiMeta = MetaBase & { path: string; asOf?: string };
type UploadMeta = MetaBase & { source: "upload"; fileName: string };

type ApiResponse =
  | {
      meta: ApiMeta;
      people: Person[];
    }
  | { error: string; path?: string; detail?: string };

type LocalData = {
  meta: UploadMeta;
  people: Person[];
};

const LS_KEY = "personaldaten-upload-cache-v1";

function normalizePercent(v: unknown): string {
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return "";
    return s.endsWith("%") ? s : `${s}%`;
  }
  if (typeof v === "number" && Number.isFinite(v)) return `${v}%`;
  return "";
}

export default function PersonaldatenPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [localData, setLocalData] = useState<LocalData | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch("/api/szs-admin/cockpit/personaldaten", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return;
        setData(json);
      })
      .catch((e) => {
        if (!alive) return;
        setData({ error: "Fehler beim Laden der Personaldaten.", detail: String(e) });
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    // Optional: letzte Upload-Daten wiederherstellen (damit Demo/IST schnell verfügbar bleibt)
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as LocalData;
      if (parsed?.people?.length) setLocalData(parsed);
    } catch {
      // ignore
    }
  }, []);

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    setUploadError(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        defval: "",
        raw: false,
      });

      const people: Person[] = rows
        .map((r) => {
          const nachname = String(r["Nachname"] ?? "").trim();
          const vorname = String(r["Vorname"] ?? "").trim();
          const funktion = String(r["Funktion"] ?? "").trim();
          const beschaeftigungsgrad = normalizePercent(r["Beschäftigungsgrad"]);
          const pNr = String(r["P-Nr."] ?? "").trim();
          const abtNr = String(r["Abt-Nr."] ?? "").trim();
          const abteilung = String(r["Abteilung"] ?? "").trim();
          const name = [vorname, nachname].filter(Boolean).join(" ").trim();
          return { pNr, name, vorname, nachname, beschaeftigungsgrad, funktion, abtNr, abteilung };
        })
        .filter((p) => p.name.length > 0);

      const next: LocalData = {
        meta: {
          source: "upload",
          fileName: file.name,
          sheetName,
          count: people.length,
        },
        people,
      };
      setLocalData(next);
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
    } catch (e: any) {
      setUploadError(e?.message ?? String(e));
    }
  };

  const effectivePeople = useMemo(() => {
    if (localData?.people?.length) return localData.people;
    if (!data || "error" in data) return [];
    return data.people ?? [];
  }, [data, localData]);

  const people = useMemo(() => {
    return effectivePeople;
  }, [effectivePeople]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => {
      const hay = `${p.name} ${p.funktion} ${p.beschaeftigungsgrad} ${p.pNr} ${p.abteilung ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [people, query]);

  const meta = useMemo(() => {
    if (!data || "error" in data) return null;
    return data.meta;
  }, [data]);

  const effectiveMeta = useMemo(() => {
    if (localData) return localData.meta;
    return meta;
  }, [localData, meta]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Personaldaten</h1>
              <p className="text-sm text-gray-600 mt-1">
                Übersicht der angestellten Personen (Name, Anstellungspensum, Funktion).
              </p>
            </div>
            <div className="w-full sm:w-[440px] space-y-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Suche</label>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="z.B. Name, Funktion, Pensum, P-Nr."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-gray-600">
                  Falls der Server die Desktop‑Datei nicht lesen kann: Excel hier auswählen.
                </div>
                <label className="inline-flex items-center gap-2 text-sm">
                  <span className="px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition cursor-pointer">
                    Excel auswählen
                  </span>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              {uploadError ? (
                <div className="text-xs text-red-700">
                  Upload-Fehler: <span className="font-mono">{uploadError}</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              {loading ? (
                <div className="text-sm text-gray-600">Lade Personaldaten…</div>
              ) : data && "error" in data ? (
                <div className="text-sm text-red-700">
                  <div className="font-semibold">{data.error}</div>
                  {data.path ? <div className="mt-1 text-xs">Pfad: {data.path}</div> : null}
                  {data.detail ? <div className="mt-1 text-xs">{data.detail}</div> : null}
                  {!localData ? (
                    <div className="mt-2 text-xs text-gray-700">
                      Tipp: Nutze oben <span className="font-semibold">„Excel auswählen“</span>, um die Datei im Browser zu laden.
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="text-sm text-gray-700">
                    <span className="font-medium">Datensatz:</span>{" "}
                    <span className="tabular-nums">{effectiveMeta?.count ?? people.length}</span>
                    {effectiveMeta && "asOf" in effectiveMeta && effectiveMeta.asOf ? (
                      <span className="text-gray-500"> · Stand: {effectiveMeta.asOf}</span>
                    ) : null}
                    {effectiveMeta && "source" in effectiveMeta && effectiveMeta.source === "upload" ? (
                      <span className="text-gray-500"> · Quelle: Upload</span>
                    ) : null}
                  </div>
                  <div className="text-xs text-gray-500 break-all">
                    Sheet: <span className="font-mono">{effectiveMeta?.sheetName ?? "—"}</span>
                    {effectiveMeta && "source" in effectiveMeta && effectiveMeta.source === "upload" ? (
                      <>
                        {" "}
                        · Datei: <span className="font-mono">{effectiveMeta.fileName}</span>
                      </>
                    ) : null}
                  </div>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Anstellungspensum
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Funktion
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      P‑Nr.
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {filtered.map((p) => (
                    <tr key={`${p.pNr}-${p.name}`}>
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium whitespace-nowrap">
                        {p.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap tabular-nums">
                        {p.beschaeftigungsgrad || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                        {p.funktion || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap tabular-nums">
                        {p.pNr || "—"}
                      </td>
                    </tr>
                  ))}
                  {!loading && filtered.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-gray-600" colSpan={4}>
                        Keine Treffer.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

