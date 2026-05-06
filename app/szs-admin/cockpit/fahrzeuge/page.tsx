"use client";

import { useEffect, useMemo, useState } from "react";
import Navigation from "@/components/admin-szs/cockpit/Navigation";
import * as XLSX from "xlsx";

type AutoEntry = {
  id: string;
  nummer: string;
  kontrollschild: string;
  typ: string;
  standort: string;
  parkplatz: string;
  badge: string;
  versicherer: string;
  schadenInfo: string;
  status: "aktiv" | "ausser-betrieb";
};

type EbikeEntry = {
  id: string;
  nummer: string;
  bezeichnung: string;
  typ: string;
  standort: string;
  versicherer: string;
  vertragsnummer: string;
};

type FleetResponse = {
  sourceFile: string;
  autos: AutoEntry[];
  ebikes: EbikeEntry[];
  totals: {
    autosGesamt: number;
    autosAktiv: number;
    autosAusserBetrieb: number;
    ebikesGesamt: number;
  };
};

type UtilizationValue = {
  soll: string;
};

/** Tagesauslastung: Anteile pro Zeitfenster (Summe = 100 % bei vollem Tag). */
const SLOT_WEIGHT_VM = 33.33333333;
const SLOT_WEIGHT_NM = 33.33333333;
const SLOT_WEIGHT_AB = 33.33333333;

const fmtSlot = (n: number): string =>
  new Intl.NumberFormat("de-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

type DaySlots = {
  vormittag: boolean;
  nachmittag: boolean;
  abend: boolean;
};

const emptyDaySlots = (): DaySlots => ({
  vormittag: false,
  nachmittag: false,
  abend: false,
});

const dayUtilizationPct = (slots: DaySlots): number => {
  const total =
    (slots.vormittag ? SLOT_WEIGHT_VM : 0) +
    (slots.nachmittag ? SLOT_WEIGHT_NM : 0) +
    (slots.abend ? SLOT_WEIGHT_AB : 0);
  return slots.vormittag && slots.nachmittag && slots.abend ? 100 : total;
};

const TRACKING_STORAGE_KEY = "cockpit-fahrzeug-tagesauslastung";
const FLEET_STORAGE_KEY = "cockpit-fahrzeug-flotte-v1";

const asText = (value: unknown): string => String(value ?? "").trim();
const hasSwissPlateLikeValue = (value: unknown): boolean =>
  /^[A-Z]{1,3}\s?\d/.test(asText(value).toUpperCase());
const isLikelyVehicleRow = (row: Record<string, unknown>): boolean => {
  const kontrollschild = asText(row["Kontrollschild"]);
  const autotyp = asText(row["Autotyp"]);
  return hasSwissPlateLikeValue(kontrollschild) || autotyp !== "";
};

const buildFleetFromWorkbook = (workbook: XLSX.WorkBook, sourceFile: string): FleetResponse => {
  const autoSheet = workbook.Sheets["Auto"];
  const ebikeSheet = workbook.Sheets["E-Bike"];

  if (!autoSheet) {
    throw new Error("Sheet 'Auto' wurde in der Datei nicht gefunden.");
  }

  const autoRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(autoSheet, { defval: "" });
  const ebikeRows = ebikeSheet
    ? XLSX.utils.sheet_to_json<Record<string, unknown>>(ebikeSheet, { defval: "" })
    : [];

  const autos: AutoEntry[] = autoRows
    .filter((row) => isLikelyVehicleRow(row))
    .map((row, idx) => {
      const nummer = asText(row["Autobezeichnung (Nr)"]);
      const standort = asText(row["Standort"]);
      const badge = asText(row["Badge"]);
      const statusBlob = `${standort} ${badge}`.toLowerCase();
      return {
        id: `auto-${nummer || idx + 1}`,
        nummer,
        kontrollschild: asText(row["Kontrollschild"]),
        typ: asText(row["Autotyp"]),
        standort,
        parkplatz: asText(row["PP- Nr."]),
        badge,
        versicherer: asText(row["Versicherer"]),
        schadenInfo: asText(row["Infos bzgl. Schaden"]),
        status: statusBlob.includes("totalschaden") ? "ausser-betrieb" : "aktiv",
      };
    });

  const ebikes: EbikeEntry[] = ebikeRows
    .filter((row) => asText(row["Velobezeichnung"]) !== "")
    .map((row, idx) => ({
      id: `ebike-${asText(row["Velobezeichnung"]) || idx + 1}`,
      nummer: asText(row["Velobezeichnung"]),
      bezeichnung: asText(row["Velo-Typ"]),
      typ: asText((row as Record<string, unknown>)["Velo-Typ_1"] ?? row["Velo-Typ"]),
      standort: asText(row["Standort"]),
      versicherer: asText(row["Versicherer"]),
      vertragsnummer: asText(row["Vertragsnummer"]),
    }));

  return {
    sourceFile,
    autos,
    ebikes,
    totals: {
      autosGesamt: autos.length,
      autosAktiv: autos.filter((x) => x.status === "aktiv").length,
      autosAusserBetrieb: autos.filter((x) => x.status === "ausser-betrieb").length,
      ebikesGesamt: ebikes.length,
    },
  };
};

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function loadDaySlotsFromStorage(): Record<string, Record<string, DaySlots>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(TRACKING_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Record<string, DaySlots>>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persistDaySlots(data: Record<string, Record<string, DaySlots>>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore quota / private mode
  }
}

function loadFleetFromStorage(): FleetResponse | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(FLEET_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FleetResponse;
    if (!parsed || !Array.isArray(parsed.autos)) return null;
    if (!parsed.totals) {
      parsed.totals = {
        autosGesamt: parsed.autos.length,
        autosAktiv: parsed.autos.filter((a) => a.status === "aktiv").length,
        autosAusserBetrieb: parsed.autos.filter((a) => a.status === "ausser-betrieb").length,
        ebikesGesamt: Array.isArray(parsed.ebikes) ? parsed.ebikes.length : 0,
      };
    }
    if (!Array.isArray(parsed.ebikes)) parsed.ebikes = [];
    return parsed;
  } catch {
    return null;
  }
}

function persistFleet(fleet: FleetResponse) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FLEET_STORAGE_KEY, JSON.stringify(fleet));
  } catch {
    // ignore quota / private mode
  }
}

function clearFleetStorage() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(FLEET_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export default function FahrzeugePage() {
  const [data, setData] = useState<FleetResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string>("noch nicht geladen");
  const [utilization, setUtilization] = useState<Record<string, UtilizationValue>>({});
  const [trackingDate, setTrackingDate] = useState<string>(() => toDateInputValue(new Date()));
  const [daySlots, setDaySlots] = useState<Record<string, Record<string, DaySlots>>>({});

  useEffect(() => {
    setDaySlots(loadDaySlotsFromStorage());
    const cached = loadFleetFromStorage();
    if (cached) {
      setData(cached);
      setSourceLabel(cached.sourceFile || "Gespeicherte Flotte");
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch("/api/szs-admin/cockpit/fahrzeuge", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as FleetResponse;
      })
      .then((serverData) => {
        if (cancelled) return;
        if (!serverData || !Array.isArray(serverData.autos)) return;
        if (!serverData.totals) {
          serverData.totals = {
            autosGesamt: serverData.autos.length,
            autosAktiv: serverData.autos.filter((a) => a.status === "aktiv").length,
            autosAusserBetrieb: serverData.autos.filter((a) => a.status === "ausser-betrieb")
              .length,
            ebikesGesamt: Array.isArray(serverData.ebikes) ? serverData.ebikes.length : 0,
          };
        }
        if (!Array.isArray(serverData.ebikes)) serverData.ebikes = [];
        setData(serverData);
        setSourceLabel(serverData.sourceFile || "Server-Flotte");
      })
      .catch(() => {
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!data?.autos?.length) return;
    setUtilization((prev) => {
      const next = { ...prev };
      for (const auto of data.autos) {
        if (!next[auto.id]) {
          next[auto.id] = {
            soll: auto.status === "aktiv" ? "75" : "0",
          };
        }
      }
      return next;
    });
  }, [data]);

  const parsePercent = (value: string) => {
    const normalized = String(value ?? "").replace(",", ".").trim();
    const n = Number(normalized);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  };

  const getSlotsForDate = (dateKey: string, vehicleId: string): DaySlots => {
    const byDate = daySlots[dateKey];
    if (!byDate?.[vehicleId]) return emptyDaySlots();
    const s = byDate[vehicleId];
    return {
      vormittag: Boolean(s.vormittag),
      nachmittag: Boolean(s.nachmittag),
      abend: Boolean(s.abend),
    };
  };

  const setSlotForDate = (
    dateKey: string,
    vehicleId: string,
    slot: keyof DaySlots,
    checked: boolean
  ) => {
    setDaySlots((prev) => {
      const byDate = { ...(prev[dateKey] ?? {}) };
      const current = { ...emptyDaySlots(), ...(byDate[vehicleId] ?? {}) };
      current[slot] = checked;
      byDate[vehicleId] = current;
      const next = { ...prev, [dateKey]: byDate };
      persistDaySlots(next);
      return next;
    });
  };

  const utilizationSummary = useMemo(() => {
    if (!data?.autos?.length) {
      return { avgIst: 0, avgSoll: 0, delta: 0, activeCount: 0 };
    }

    const activeAutos = data.autos.filter((x) => x.status === "aktiv");
    const activeCount = activeAutos.length;
    if (!activeCount) return { avgIst: 0, avgSoll: 0, delta: 0, activeCount: 0 };

    const sumIst = activeAutos.reduce(
      (acc, auto) => acc + dayUtilizationPct(getSlotsForDate(trackingDate, auto.id)),
      0
    );
    const sumSoll = activeAutos.reduce(
      (acc, auto) => acc + parsePercent(utilization[auto.id]?.soll ?? "75"),
      0
    );
    const avgIst = sumIst / activeCount;
    const avgSoll = sumSoll / activeCount;
    return {
      avgIst,
      avgSoll,
      delta: avgIst - avgSoll,
      activeCount,
    };
  }, [data, utilization, daySlots, trackingDate]);

  const fmtPct = (n: number) =>
    `${new Intl.NumberFormat("de-CH", { maximumFractionDigits: 1 }).format(n)}%`;

  const handleSollChange = (id: string, value: string) => {
    setUtilization((prev) => ({
      ...prev,
      [id]: {
        soll: value,
      },
    }));
  };

  const handleExcelUpload = async (file: File) => {
    try {
      setLoading(true);
      setError(null);
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const fleetData = buildFleetFromWorkbook(workbook, file.name);
      persistFleet(fleetData);
      setData(fleetData);
      setSourceLabel(file.name);
    } catch (e) {
      setError(
        e instanceof Error
          ? `Datei konnte nicht verarbeitet werden: ${e.message}`
          : "Datei konnte nicht verarbeitet werden."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClearFleet = async () => {
    clearFleetStorage();
    setData(null);
    setSourceLabel("noch nicht geladen");
    setError(null);
    try {
      setLoading(true);
      const res = await fetch("/api/szs-admin/cockpit/fahrzeuge", { cache: "no-store" });
      if (!res.ok) return;
      const serverData = (await res.json()) as FleetResponse;
      if (!serverData || !Array.isArray(serverData.autos)) return;
      if (!serverData.totals) {
        serverData.totals = {
          autosGesamt: serverData.autos.length,
          autosAktiv: serverData.autos.filter((a) => a.status === "aktiv").length,
          autosAusserBetrieb: serverData.autos.filter((a) => a.status === "ausser-betrieb").length,
          ebikesGesamt: Array.isArray(serverData.ebikes) ? serverData.ebikes.length : 0,
        };
      }
      if (!Array.isArray(serverData.ebikes)) serverData.ebikes = [];
      setData(serverData);
      setSourceLabel(serverData.sourceFile || "Server-Flotte");
    } catch {
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
            <h2 className="text-3xl font-extrabold text-gray-950">Fahrzeuge</h2>
            <p className="mt-2 text-sm font-medium text-gray-800">
              Flottenübersicht, Tages-Tracking (Vormittag / Nachmittag / Abend) und SOLL-Vergleich.
            </p>
            <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4">
              <div className="text-sm font-semibold text-gray-900">Excel-Datei (Flotte)</div>
              <p className="mt-1 text-xs font-medium text-gray-700">
                Nach dem ersten Upload wird die Flotte im Browser gespeichert — du musst die Datei
                nicht bei jedem Besuch erneut auswählen. Bei einer neuen Excel-Version einfach
                erneut hochladen oder zuerst die gespeicherte Flotte löschen.
              </p>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleExcelUpload(file);
                }}
                className="mt-3 block w-full text-sm text-gray-700 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-indigo-700"
              />
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs font-semibold text-gray-700">
                  Quelle: <span className="font-mono">{sourceLabel}</span>
                </div>
                {data && (
                  <button
                    type="button"
                    onClick={handleClearFleet}
                    className="shrink-0 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-100"
                  >
                    Gespeicherte Flotte löschen
                  </button>
                )}
              </div>
            </div>

            {loading && (
              <div className="mt-6 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                Fahrzeugdaten werden geladen...
              </div>
            )}

            {error && (
              <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                {error}
              </div>
            )}

            {!!data && (
              <>
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                      Autos gesamt
                    </div>
                    <div className="mt-1 text-2xl font-extrabold text-gray-950">
                      {data.totals.autosGesamt}
                    </div>
                  </div>
                  <div className="rounded-lg border border-emerald-200 p-4 bg-emerald-50">
                    <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                      Autos aktiv
                    </div>
                    <div className="mt-1 text-2xl font-extrabold text-emerald-950">
                      {data.totals.autosAktiv}
                    </div>
                  </div>
                  <div className="rounded-lg border border-amber-200 p-4 bg-amber-50">
                    <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                      Ausser Betrieb
                    </div>
                    <div className="mt-1 text-2xl font-extrabold text-amber-950">
                      {data.totals.autosAusserBetrieb}
                    </div>
                  </div>
                  <div className="rounded-lg border border-violet-200 p-4 bg-violet-50">
                    <div className="text-xs font-semibold uppercase tracking-wide text-violet-800">
                      E-Bikes
                    </div>
                    <div className="mt-1 text-2xl font-extrabold text-violet-950">
                      {data.totals.ebikesGesamt}
                    </div>
                  </div>
                </div>

                <div className="mt-8">
                  <div className="text-lg font-bold text-gray-950">1) Flotte</div>
                  <p className="mt-1 text-sm font-medium text-gray-800">
                    Quelle: <span className="font-mono text-xs">{data.sourceFile}</span>
                  </p>

                  <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-gray-900">
                        <tr>
                          <th className="px-3 py-2 text-left font-bold">Nr.</th>
                          <th className="px-3 py-2 text-left font-bold">Kontrollschild</th>
                          <th className="px-3 py-2 text-left font-bold">Typ</th>
                          <th className="px-3 py-2 text-left font-bold">Standort</th>
                          <th className="px-3 py-2 text-left font-bold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.autos.map((auto) => (
                          <tr key={auto.id} className="border-t border-gray-100 text-gray-900">
                            <td className="px-3 py-2 font-semibold">{auto.nummer}</td>
                            <td className="px-3 py-2 font-medium">{auto.kontrollschild || "-"}</td>
                            <td className="px-3 py-2 font-medium">{auto.typ || "-"}</td>
                            <td className="px-3 py-2 font-medium">{auto.standort || "-"}</td>
                            <td className="px-3 py-2">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  auto.status === "aktiv"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {auto.status === "aktiv" ? "Aktiv" : "Ausser Betrieb"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {!!data.ebikes.length && (
                    <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-gray-900">
                          <tr>
                            <th className="px-3 py-2 text-left font-bold">E-Bike Nr.</th>
                            <th className="px-3 py-2 text-left font-bold">Bezeichnung</th>
                            <th className="px-3 py-2 text-left font-bold">Typ</th>
                            <th className="px-3 py-2 text-left font-bold">Standort</th>
                            <th className="px-3 py-2 text-left font-bold">Versicherer</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.ebikes.map((bike) => (
                            <tr key={bike.id} className="border-t border-gray-100 text-gray-900">
                              <td className="px-3 py-2 font-semibold">{bike.nummer}</td>
                              <td className="px-3 py-2 font-medium">{bike.bezeichnung || "-"}</td>
                              <td className="px-3 py-2 font-medium">{bike.typ || "-"}</td>
                              <td className="px-3 py-2 font-medium">{bike.standort || "-"}</td>
                              <td className="px-3 py-2 font-medium">{bike.versicherer || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="mt-10">
                  <div className="text-lg font-bold text-gray-950">
                    2) Auslastung: Erfassung pro Tag (IST aus Zeitfenstern)
                  </div>
                  <p className="mt-1 text-sm font-medium text-gray-800">
                    Pro Kalendertag markierst du, in welchen Zeitfenstern das Fahrzeug im Einsatz war.
                    Vormittag zählt {fmtSlot(SLOT_WEIGHT_VM)} %, Nachmittag {fmtSlot(SLOT_WEIGHT_NM)} %, Abend{" "}
                    {fmtSlot(SLOT_WEIGHT_AB)} % — maximal 100 % pro Tag bei allen drei Fenstern. Beispiel: nur
                    Vormittag und Abend = {fmtSlot(SLOT_WEIGHT_VM + SLOT_WEIGHT_AB)} %.
                  </p>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between rounded-lg border border-indigo-200 bg-indigo-50/60 p-4">
                    <label className="block shrink-0">
                      <span className="text-xs font-semibold uppercase tracking-wide text-indigo-900">
                        Erfassungsdatum
                      </span>
                      <input
                        type="date"
                        value={trackingDate}
                        onChange={(e) => setTrackingDate(e.target.value)}
                        className="mt-1 block rounded-md border border-indigo-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900"
                      />
                    </label>
                    <p className="text-xs font-medium text-indigo-950 max-w-xl">
                      Die Eingaben werden lokal im Browser gespeichert (pro Datum und Fahrzeug).
                    </p>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                        Aktive Fahrzeuge
                      </div>
                      <div className="mt-1 text-2xl font-extrabold text-gray-950">
                        {utilizationSummary.activeCount}
                      </div>
                    </div>
                    <div className="rounded-lg border border-blue-200 p-4 bg-blue-50">
                      <div className="text-xs font-semibold uppercase tracking-wide text-blue-800">
                        Ø IST (gewählter Tag)
                      </div>
                      <div className="mt-1 text-2xl font-extrabold text-blue-950">
                        {fmtPct(utilizationSummary.avgIst)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-indigo-200 p-4 bg-indigo-50">
                      <div className="text-xs font-semibold uppercase tracking-wide text-indigo-800">
                        Delta IST zu SOLL
                      </div>
                      <div
                        className={`mt-1 text-2xl font-extrabold ${
                          utilizationSummary.delta >= 0 ? "text-emerald-800" : "text-rose-800"
                        }`}
                      >
                        {fmtPct(utilizationSummary.delta)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-gray-900">
                        <tr>
                          <th className="px-3 py-2 text-left font-bold">Fahrzeug</th>
                          <th className="px-3 py-2 text-left font-bold">Standort</th>
                          <th className="px-3 py-2 text-center font-bold whitespace-nowrap">
                            VM ({fmtSlot(SLOT_WEIGHT_VM)}%)
                          </th>
                          <th className="px-3 py-2 text-center font-bold whitespace-nowrap">
                            NM ({fmtSlot(SLOT_WEIGHT_NM)}%)
                          </th>
                          <th className="px-3 py-2 text-center font-bold whitespace-nowrap">
                            Abend ({fmtSlot(SLOT_WEIGHT_AB)}%)
                          </th>
                          <th className="px-3 py-2 text-left font-bold">IST Tag</th>
                          <th className="px-3 py-2 text-left font-bold">SOLL (%)</th>
                          <th className="px-3 py-2 text-left font-bold">Abweichung</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.autos
                          .filter((auto) => auto.status === "aktiv")
                          .map((auto) => {
                            const slots = getSlotsForDate(trackingDate, auto.id);
                            const istDay = dayUtilizationPct(slots);
                            const soll = parsePercent(utilization[auto.id]?.soll ?? "75");
                            const delta = istDay - soll;
                            return (
                              <tr key={auto.id} className="border-t border-gray-100 text-gray-900">
                                <td className="px-3 py-2 font-medium">
                                  {auto.kontrollschild || `Auto ${auto.nummer}`}
                                </td>
                                <td className="px-3 py-2 font-medium">{auto.standort || "-"}</td>
                                {(["vormittag", "nachmittag", "abend"] as const).map((slot) => (
                                  <td key={slot} className="px-3 py-2 text-center">
                                    <input
                                      type="checkbox"
                                      checked={slots[slot]}
                                      onChange={(e) =>
                                        setSlotForDate(trackingDate, auto.id, slot, e.target.checked)
                                      }
                                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                      aria-label={
                                        slot === "vormittag"
                                          ? "Vormittag"
                                          : slot === "nachmittag"
                                            ? "Nachmittag"
                                            : "Abend"
                                      }
                                    />
                                  </td>
                                ))}
                                <td className="px-3 py-2 font-bold tabular-nums">
                                  {fmtPct(istDay)}
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    inputMode="decimal"
                                    value={utilization[auto.id]?.soll ?? "75"}
                                    onChange={(e) => handleSollChange(auto.id, e.target.value)}
                                    className="w-24 rounded-md border border-gray-300 px-2 py-1 font-semibold text-gray-900"
                                  />
                                </td>
                                <td
                                  className={`px-3 py-2 font-bold ${
                                    delta >= 0 ? "text-emerald-800" : "text-rose-800"
                                  }`}
                                >
                                  {fmtPct(delta)}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
