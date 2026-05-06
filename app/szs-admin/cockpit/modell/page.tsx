"use client";

import Navigation from "@/components/admin-szs/cockpit/Navigation";
import { useState, useEffect, useCallback, useMemo } from "react";

interface FormData {
  dipl: Record<string, string>;
  bkm: Record<string, string>;
  fage: Record<string, string>;
  srk: Record<string, string>;
  ohneSRK: Record<string, string>;
  leitung: Record<string, string>;
  vollkostenProFte: {
    dipl: string;
    bkm: string;
    fage: string;
    srk: string;
    ohneSRK: string;
    leitung: string;
  };
  sollArbeitszeitProJahr: Record<string, Record<string, string>>;
  sollArbeitszeitProJahrAnnahme: Record<string, string>;
  stundenvolumen: {
    period: "monthly" | "yearly";
    klvA: string;
    klvB: string;
    klvC: string;
    hw: string;
  };
  tarifeProStunde: {
    klvA: string;
    klvB: string;
    klvC: string;
    hw: string;
  };
}

const STORAGE_KEY = "modell-form-data";
const DBG_ENDPOINT = "http://127.0.0.1:7243/ingest/9f83cdbc-7a2c-49ee-9246-0ca0a646dfe1";
const FTE_HOURS_PER_MONTH = 177.1;

function getRunId(): string {
  try {
    const g = globalThis as any;
    if (g.__DBG_RUN_ID) return String(g.__DBG_RUN_ID);
    const rid = `run_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    g.__DBG_RUN_ID = rid;
    return rid;
  } catch {
    return "run_unknown";
  }
}

export default function ModellPage() {
  const MONTHS = [
    "Dez",
    "Nov",
    "Okt",
    "Sept",
    "Aug",
    "Jul",
    "Jun",
    "Mai",
    "Apr",
    "Mär",
    "Feb",
    "Jan",
  ] as const;

  const SOLL_INPUT_ROWS = ["SOLL h in ZH", "Ferien", "Krank", "Weiterbildung"] as const;
  const SOLL_CALC_ROWS = ["Total h geleistet"] as const;
  const SOLL_ALL_ROWS = [...SOLL_INPUT_ROWS, ...SOLL_CALC_ROWS] as const;

  const sanitizeDecimal = (raw: string, maxDecimals: number = 2) => {
    // allow digits + one decimal separator (dot or comma), normalized to dot
    const cleaned = raw.replace(/[^\d.,]/g, "");
    if (!cleaned) return "";
    const firstSep = cleaned.search(/[.,]/);
    if (firstSep === -1) return cleaned.replace(/^0+(?=\d)/, "0");
    const intPart = cleaned.slice(0, firstSep).replace(/[^\d]/g, "");
    const decPart = cleaned
      .slice(firstSep + 1)
      .replace(/[^\d]/g, "")
      .slice(0, maxDecimals);
    return `${intPart || "0"}.${decPart}`;
  };

  const getDefaultFormData = useCallback((): FormData => {
    const sollArbeitszeitProJahr: Record<string, Record<string, string>> = {};
    for (const row of SOLL_INPUT_ROWS) {
      sollArbeitszeitProJahr[row] = {};
      for (const month of MONTHS) {
        sollArbeitszeitProJahr[row][month] = "";
      }
    }

    // Defaults gem. Screenshot (pinke Eingabefelder)
    // SOLL h in ZH (Monatswerte)
    const sollDefaults: Record<(typeof MONTHS)[number], string> = {
      Dez: "168.00",
      Nov: "176.40",
      Okt: "193.20",
      Sept: "176.40",
      Aug: "176.40",
      Jul: "193.20",
      Jun: "168.00",
      Mai: "168.00",
      Apr: "176.40",
      Mär: "168.00",
      Feb: "176.40",
      Jan: "184.80",
    };
    for (const month of MONTHS) {
      sollArbeitszeitProJahr["SOLL h in ZH"][month] = sollDefaults[month];
    }

    // Ferien / Krank / Weiterbildung (konstant pro Monat im Screenshot)
    for (const month of MONTHS) {
      sollArbeitszeitProJahr["Ferien"][month] = "17.47";
      sollArbeitszeitProJahr["Krank"][month] = "5.60";
      sollArbeitszeitProJahr["Weiterbildung"][month] = "1.40";
    }

    return {
      // Defaults gem. früherem Modell-Screenshot / Output
      dipl: {
        stellenprozent: "100",
        zielVerrechenbarkeit: "65",
        anteilKLV_A: "30",
        anteilKLV_B: "40",
        anteilKLV_C: "30",
        anteilHauswirtschaft: "0",
      },
      // BKM: vorwiegend KLV-A (70%) und KLV-B (30%) gemäss neuer Vorgabe
      bkm: {
        stellenprozent: "100",
        zielVerrechenbarkeit: "65",
        anteilKLV_A: "70",
        anteilKLV_B: "30",
        anteilKLV_C: "0",
        anteilHauswirtschaft: "0",
      },
      fage: {
        stellenprozent: "100",
        zielVerrechenbarkeit: "75",
        anteilKLV_A: "0",
        anteilKLV_B: "70",
        anteilKLV_C: "30",
        anteilHauswirtschaft: "0",
      },
      srk: {
        stellenprozent: "100",
        zielVerrechenbarkeit: "85",
        // Default-Schema gem. Vorgabe:
        // A: 0, B: 0, C: 70, HW: 30
        anteilKLV_A: "0",
        anteilKLV_B: "0",
        anteilKLV_C: "70",
        anteilHauswirtschaft: "30",
      },
      ohneSRK: {
        stellenprozent: "100",
        zielVerrechenbarkeit: "90",
        anteilKLV_A: "0",
        anteilKLV_B: "0",
        anteilKLV_C: "0",
        anteilHauswirtschaft: "100",
      },
      leitung: {
        stellenprozent: "100",
        anzahlStundenProMonat: "2000",
      },
      vollkostenProFte: {
        // Default-Sätze in CHF / Stunde
        dipl: "66",
        bkm: "66",
        fage: "54",
        srk: "49",
        ohneSRK: "40",
        leitung: "",
      },
      sollArbeitszeitProJahr,
      sollArbeitszeitProJahrAnnahme: {
        "SOLL h in ZH": "Soll-Kanton ZH",
        Ferien: "25 Tage pro Jahr",
        Krank: "8 Tage pro Jahr",
        Weiterbildung: "2 Tage pro Jahr",
      },
      stundenvolumen: {
        period: "monthly",
        klvA: "",
        klvB: "",
        klvC: "",
        hw: "",
      },
      tarifeProStunde: {
        // Normkosten pro Pflegestunde (Default gem. Vorgabe)
        // a) Abklärung, Beratung und Koordination: 159.20
        // b) Untersuchung und Behandlung: 154.52
        // c) Grundpflege: 146.62
        klvA: "159.20",
        klvB: "154.52",
        klvC: "146.62",
        hw: "90.00",
      },
    };
  }, []);

  // Wichtig: initialer Render muss server+client identisch sein (Hydration).
  // Deshalb initialisieren wir IMMER mit Defaults und laden localStorage erst nach Mount.
  const [formData, setFormData] = useState<FormData>(() => getDefaultFormData());
  const [hydrated, setHydrated] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const optimizeMode: "cost" = "cost";

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onError = (event: ErrorEvent) => {
      const msg = event.error?.stack || event.message || "Unbekannter Fehler";
      setClientError(msg);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason: any = event.reason;
      const msg = reason?.stack || String(reason) || "Unhandled promise rejection";
      setClientError(msg);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<FormData>;
        const base = getDefaultFormData();
        // Migration: falls früher "Vollkosten pro FTE (CHF/Monat)" gespeichert wurde,
        // rechnen wir zurück auf CHF/Stunde (÷ 177.10), damit die UI jetzt die Sätze zeigt.
        const normalizeRate = (raw: unknown) => {
          const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
          if (!Number.isFinite(n) || n <= 0) return "";
          // Heuristik: > 300 ist sehr wahrscheinlich ein Monatsbetrag pro FTE, nicht CHF/h.
          if (n > 300) return (n / FTE_HOURS_PER_MONTH).toFixed(2);
          return String(n);
        };
        const migratedVollkosten = {
          ...base.vollkostenProFte,
          ...(parsed.vollkostenProFte ?? {}),
        };
        (Object.keys(migratedVollkosten) as Array<keyof FormData["vollkostenProFte"]>).forEach((k) => {
          migratedVollkosten[k] = normalizeRate((migratedVollkosten as any)[k]);
        });

        // Migration/Heuristik: Wenn Tarife früher als 0 gespeichert wurden, behandeln wir das als "nicht gesetzt"
        // und verwenden die neuen Default-Normkosten.
        const isAllZeroTarife = (t: any) => {
          if (!t) return true;
          const a = Number(t.klvA ?? 0) || 0;
          const b = Number(t.klvB ?? 0) || 0;
          const c = Number(t.klvC ?? 0) || 0;
          const hw = Number(t.hw ?? 0) || 0;
          return a <= 0 && b <= 0 && c <= 0 && hw <= 0;
        };
        const mergedTarife = isAllZeroTarife(parsed.tarifeProStunde)
          ? base.tarifeProStunde
          : { ...base.tarifeProStunde, ...(parsed.tarifeProStunde ?? {}) };

        // Migration/Normierung: BKM soll gemäss Vorgabe immer 70/30/0/0 bei 65% Verrechenbarkeit sein.
        // Hintergrund: sonst kann der Optimierer B-/C-Anteile zu stark über BKM abdecken.
        const parsedBkmRaw: any = (parsed as any).bkm ?? null;
        const parsedBkm = parsedBkmRaw
          ? {
              ...parsedBkmRaw,
              zielVerrechenbarkeit: "65",
              anteilKLV_A: "70",
              anteilKLV_B: "30",
              anteilKLV_C: "0",
              anteilHauswirtschaft: "0",
            }
          : {};

        setFormData({
          ...base,
          ...parsed,
          leitung: { ...base.leitung, ...(parsed.leitung ?? {}) },
          dipl: { ...base.dipl, ...(parsed.dipl ?? {}) },
          bkm: { ...base.bkm, ...(parsedBkm ?? {}) },
          fage: { ...base.fage, ...(parsed.fage ?? {}) },
          srk: { ...base.srk, ...(parsed.srk ?? {}) },
          ohneSRK: { ...base.ohneSRK, ...(parsed.ohneSRK ?? {}) },
          vollkostenProFte: migratedVollkosten,
          sollArbeitszeitProJahr: {
            ...base.sollArbeitszeitProJahr,
            ...(parsed.sollArbeitszeitProJahr ?? {}),
          },
          sollArbeitszeitProJahrAnnahme: {
            ...base.sollArbeitszeitProJahrAnnahme,
            ...(parsed.sollArbeitszeitProJahrAnnahme ?? {}),
          },
          stundenvolumen: {
            ...base.stundenvolumen,
            ...(parsed.stundenvolumen ?? {}),
          },
          tarifeProStunde: mergedTarife,
        });
      }
    } catch (error) {
      console.error("Fehler beim Laden der gespeicherten Modell-Daten:", error);
    } finally {
      setHydrated(true);
    }
  }, [getDefaultFormData]);

  // Speichere Daten in localStorage bei jeder Änderung
  useEffect(() => {
    if (!hydrated) return;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
      } catch (error) {
        console.error("Fehler beim Speichern der Modell-Daten:", error);
      }
    }
  }, [formData, hydrated]);

  const updateField = useCallback((section: keyof FormData, field: string, value: string) => {
    setFormData((prev) => {
      const newState = {
        ...prev,
        [section]: {
          ...prev[section],
          [field]: value,
        },
      };
      return newState;
    });
  }, []);

  const getFieldValue = useCallback((section: keyof FormData, field: string) => {
    return (formData[section] as Record<string, string>)[field] || "";
  }, [formData]);

  // Spezielle Funktion für Leitung-Felder mit automatischer Berechnung
  // 2000 Stunden = 100 Stellenprozent
  const updateLeitungField = useCallback((field: "stellenprozent" | "anzahlStundenProMonat", value: string) => {
    const numValue = parseFloat(value);
    
    // Wenn der Wert leer oder keine gültige Zahl ist, beide Felder leeren
    if (!value || isNaN(numValue)) {
      setFormData((prev) => ({
        ...prev,
        leitung: {
          ...prev.leitung,
          stellenprozent: "",
          anzahlStundenProMonat: "",
        },
      }));
      return;
    }

    // Berechnung basierend auf welchem Feld geändert wurde
    if (field === "stellenprozent") {
      // Stellenprozent wurde eingegeben -> Stunden berechnen
      // Stunden = (Stellenprozent / 100) * 2000
      const stunden = Math.round((numValue / 100) * 2000);
      setFormData((prev) => ({
        ...prev,
        leitung: {
          ...prev.leitung,
          stellenprozent: value,
          anzahlStundenProMonat: stunden.toString(),
        },
      }));
    } else if (field === "anzahlStundenProMonat") {
      // Stunden wurden eingegeben -> Stellenprozent berechnen
      // Stellenprozent = (Stunden / 2000) * 100
      const stellenprozent = Math.round((numValue / 2000) * 100);
      setFormData((prev) => ({
        ...prev,
        leitung: {
          ...prev.leitung,
          stellenprozent: stellenprozent.toString(),
          anzahlStundenProMonat: value,
        },
      }));
    }
  }, []);

  // Hilfsfunktion zum Rendern der Felder für einen Bereich
  const renderSectionFields = (section: keyof FormData, sectionTitle: string) => (
    <div className="border border-gray-300 rounded-lg p-3">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">
        {sectionTitle}
      </h3>
      <div className="space-y-2">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-0.5">
            Stellenprozent %
          </label>
          <input
            type="number"
            step="any"
            value={getFieldValue(section, "stellenprozent")}
            onChange={(e) => updateField(section, "stellenprozent", e.target.value)}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="0"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ziel-Verrechenbarkeit %
          </label>
          <input
            type="number"
            step="any"
            value={getFieldValue(section, "zielVerrechenbarkeit")}
            onChange={(e) => updateField(section, "zielVerrechenbarkeit", e.target.value)}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="0"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            % Anteil KLV A
          </label>
          <input
            type="number"
            step="any"
            value={getFieldValue(section, "anteilKLV_A")}
            onChange={(e) => updateField(section, "anteilKLV_A", e.target.value)}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="0"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            % Anteil KLV B
          </label>
          <input
            type="number"
            step="any"
            value={getFieldValue(section, "anteilKLV_B")}
            onChange={(e) => updateField(section, "anteilKLV_B", e.target.value)}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="0"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            % Anteil KLV C
          </label>
          <input
            type="number"
            step="any"
            value={getFieldValue(section, "anteilKLV_C")}
            onChange={(e) => updateField(section, "anteilKLV_C", e.target.value)}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="0"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            % Anteil Hauswirtschaft
          </label>
          <input
            type="number"
            step="any"
            value={getFieldValue(section, "anteilHauswirtschaft")}
            onChange={(e) => updateField(section, "anteilHauswirtschaft", e.target.value)}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="0"
          />
        </div>
      </div>
    </div>
  );

  // Spezielle Render-Funktion für Leitung (nur 2 Felder)
  const renderLeitungFields = () => (
    <div className="border border-gray-300 rounded-lg p-3">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">
        Leitung
      </h3>
      <div className="space-y-2">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-0.5">
            Stellenprozent %
          </label>
          <input
            type="number"
            step="any"
            value={getFieldValue("leitung", "stellenprozent")}
            onChange={(e) => updateLeitungField("stellenprozent", e.target.value)}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="0"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-0.5">
            Anzahl Stunden pro Monat
          </label>
          <input
            type="number"
            step="any"
            value={getFieldValue("leitung", "anzahlStundenProMonat")}
            onChange={(e) => updateLeitungField("anzahlStundenProMonat", e.target.value)}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="0"
          />
        </div>
      </div>
    </div>
  );

  const updateStundenvolumen = useCallback(
    (field: keyof FormData["stundenvolumen"], value: string) => {
      if (field === "period") {
        setFormData((prev) => ({
          ...prev,
          stundenvolumen: {
            ...prev.stundenvolumen,
            period: value as "monthly" | "yearly",
          },
        }));
        return;
      }

      const sanitized = sanitizeDecimal(value, 2);
      setFormData((prev) => ({
        ...prev,
        stundenvolumen: {
          ...prev.stundenvolumen,
          [field]: sanitized,
        },
      }));
    },
    []
  );

  const renderStundenvolumenFields = () => (
    <div className="border-2 border-blue-500 rounded-lg p-3">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">Leistungsvolumen (Stunden)</h3>
      <div className="mb-2">
        <label className="block text-xs font-medium text-gray-700 mb-0.5">Zeitraum</label>
        <select
          value={formData.stundenvolumen?.period ?? "monthly"}
          onChange={(e) => updateStundenvolumen("period", e.target.value)}
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="monthly">pro Monat</option>
          <option value="yearly">pro Jahr</option>
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-0.5">KLV A Stunden</label>
          <input
            type="text"
            inputMode="decimal"
            value={formData.stundenvolumen?.klvA ?? ""}
            onChange={(e) => updateStundenvolumen("klvA", e.target.value)}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-0.5">KLV B Stunden</label>
          <input
            type="text"
            inputMode="decimal"
            value={formData.stundenvolumen?.klvB ?? ""}
            onChange={(e) => updateStundenvolumen("klvB", e.target.value)}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-0.5">KLV C Stunden</label>
          <input
            type="text"
            inputMode="decimal"
            value={formData.stundenvolumen?.klvC ?? ""}
            onChange={(e) => updateStundenvolumen("klvC", e.target.value)}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-0.5">HW Stunden</label>
          <input
            type="text"
            inputMode="decimal"
            value={formData.stundenvolumen?.hw ?? ""}
            onChange={(e) => updateStundenvolumen("hw", e.target.value)}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="0.00"
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Hinweis: A/B/C/HW-Anteile beziehen sich auf die <span className="font-medium">verrechenbare</span> Zeit (Ziel-Verrechenbarkeit).
        Unverrechenbare Zeit bleibt Teil der SOLL-Arbeitszeit und wird über die Verrechenbarkeitsquote berücksichtigt.
      </p>
    </div>
  );

  const renderTarifeFields = () => (
    <div className="border border-gray-300 rounded-lg p-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="text-sm font-semibold text-gray-900">Tarife (CHF / Stunde)</h3>
        <button
          type="button"
          onClick={() => {
            const defaults = getDefaultFormData();
            setFormData((prev) => ({
              ...prev,
              tarifeProStunde: defaults.tarifeProStunde,
            }));
          }}
          className="bg-gray-700 text-white px-3 py-1.5 text-xs rounded-md hover:bg-gray-800 transition"
        >
          Normkosten laden
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {(
          [
            ["klvA", "KLV A"],
            ["klvB", "KLV B"],
            ["klvC", "KLV C"],
            ["hw", "HW"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <label className="block text-xs font-medium text-gray-700 mb-0.5">{label}</label>
            <input
              type="text"
              inputMode="decimal"
              value={formData.tarifeProStunde?.[key] ?? "0"}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  tarifeProStunde: {
                    ...prev.tarifeProStunde,
                    [key]: sanitizeDecimal(e.target.value, 2),
                  },
                }))
              }
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="0.00"
            />
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Hinweis: Erträge werden als <span className="font-medium">Stunden × Tarif/Std</span> berechnet.
      </p>
    </div>
  );

  const renderVollkostenFields = () => (
    <div className="border border-gray-300 rounded-lg p-3">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">Satz (CHF / Stunde)</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {(
          [
            ["dipl", "Dipl"],
            ["bkm", "BKM"],
            ["fage", "FaGe"],
            ["srk", "SRK/AGS"],
            ["ohneSRK", "ohne SRK"],
            ["leitung", "Leitung"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <label className="block text-xs font-medium text-gray-700 mb-0.5">{label}</label>
            <input
              type="text"
              inputMode="decimal"
              value={formData.vollkostenProFte?.[key] ?? ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  vollkostenProFte: {
                    ...prev.vollkostenProFte,
                    [key]: sanitizeDecimal(e.target.value, 2),
                  },
                }))
              }
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="0.00"
            />
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Hinweis: Output‑CHF wird als <span className="font-medium">FTE × {FTE_HOURS_PER_MONTH.toFixed(2)} h/Monat × CHF/h</span> berechnet.
      </p>
    </div>
  );

  const updateSollArbeitszeit = useCallback((row: string, month: string, value: string) => {
    const sanitized = sanitizeDecimal(value, 2);
    setFormData((prev) => ({
      ...prev,
      sollArbeitszeitProJahr: {
        ...prev.sollArbeitszeitProJahr,
        [row]: {
          ...(prev.sollArbeitszeitProJahr?.[row] ?? {}),
          [month]: sanitized,
        },
      },
    }));
  }, []);

  const getSollArbeitszeit = useCallback(
    (row: string, month: string) => formData.sollArbeitszeitProJahr?.[row]?.[month] ?? "",
    [formData.sollArbeitszeitProJahr]
  );

  const updateSollArbeitszeitAnnahme = useCallback((row: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      sollArbeitszeitProJahrAnnahme: {
        ...prev.sollArbeitszeitProJahrAnnahme,
        [row]: value,
      },
    }));
  }, []);

  const getSollArbeitszeitAnnahme = useCallback(
    (row: string) => formData.sollArbeitszeitProJahrAnnahme?.[row] ?? "",
    [formData.sollArbeitszeitProJahrAnnahme]
  );

  const getSollArbeitszeitNumber = useCallback(
    (row: string, month: string) => {
      const v = getSollArbeitszeit(row, month);
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    },
    [getSollArbeitszeit]
  );

  const calcTotalGeleistetMonth = useCallback(
    (month: string) => {
      const soll = getSollArbeitszeitNumber("SOLL h in ZH", month);
      const ferien = getSollArbeitszeitNumber("Ferien", month);
      const krank = getSollArbeitszeitNumber("Krank", month);
      const weiterb = getSollArbeitszeitNumber("Weiterbildung", month);
      const total = soll - ferien - krank - weiterb;
      return Math.round(total * 100) / 100;
    },
    [getSollArbeitszeitNumber]
  );

  const calcRowSum = useCallback(
    (row: (typeof SOLL_ALL_ROWS)[number]) => {
      const sum =
        row === "Total h geleistet"
          ? MONTHS.reduce((acc, m) => acc + calcTotalGeleistetMonth(m), 0)
          : MONTHS.reduce((acc, m) => acc + getSollArbeitszeitNumber(row, m), 0);
      return Math.round(sum * 100) / 100;
    },
    [MONTHS, calcTotalGeleistetMonth, getSollArbeitszeitNumber]
  );

  const calcRowAvg = useCallback(
    (row: (typeof SOLL_ALL_ROWS)[number]) => {
      const avg = calcRowSum(row) / MONTHS.length;
      return Math.round(avg * 100) / 100;
    },
    [MONTHS.length, calcRowSum]
  );

  const parseNum = useCallback((v: string | undefined) => {
    if (!v) return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }, []);

  const calcRequiredFteByRole = useCallback(() => {
    // #region agent log (ndjson)
    fetch(DBG_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: getRunId(),
        hypothesisId: "F1",
        location: "app/modell/page.tsx:calcRequiredFteByRole:entry",
        message: "FTE optimizer entry",
        data: {
          period: formData.stundenvolumen?.period ?? "monthly",
          stundenvolumen: formData.stundenvolumen,
          optimizeMode,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion agent log (ndjson)

    const netHoursYear = calcRowSum("Total h geleistet");
    const period = formData.stundenvolumen?.period ?? "monthly";
    const multiplier = period === "monthly" ? 12 : 1; // Eingabe -> Jahresvolumen
    const reqA_period = parseNum(formData.stundenvolumen?.klvA);
    const reqB_period = parseNum(formData.stundenvolumen?.klvB);
    const reqC_period = parseNum(formData.stundenvolumen?.klvC);
    const reqHW_period = parseNum(formData.stundenvolumen?.hw);

    const reqA = reqA_period * multiplier;
    const reqB = reqB_period * multiplier;
    const reqC = reqC_period * multiplier;
    const reqHW = reqHW_period * multiplier;

    const roles = ["dipl", "bkm", "fage", "srk", "ohneSRK"] as const;
    type Role = (typeof roles)[number];

    const getRoleNum = (role: Role, key: string) => parseNum((formData[role] as Record<string, string>)[key]);

    const capPerFte = (role: Role, type: "A" | "B" | "C" | "HW") => {
      const bill = getRoleNum(role, "zielVerrechenbarkeit") / 100;
      // Business rule: nur Dipl und BKM dürfen KLV A erbringen
      if (type === "A" && !(role === "dipl" || role === "bkm")) return 0;
      const share =
        type === "A"
          ? getRoleNum(role, "anteilKLV_A") / 100
          : type === "B"
            ? getRoleNum(role, "anteilKLV_B") / 100
            : type === "C"
              ? getRoleNum(role, "anteilKLV_C") / 100
              : getRoleNum(role, "anteilHauswirtschaft") / 100;
      return netHoursYear * bill * share; // Stunden/Jahr pro 1.0 FTE dieser Rolle für diesen Leistungstyp
    };

    const coeffsByType = (type: "A" | "B" | "C" | "HW") =>
      roles.map((r) => capPerFte(r, type)) as [number, number, number, number, number];

    const demandConstraints = [
      { type: "A" as const, rhs: reqA, coeffs: coeffsByType("A") },
      { type: "B" as const, rhs: reqB, coeffs: coeffsByType("B") },
      { type: "C" as const, rhs: reqC, coeffs: coeffsByType("C") },
      { type: "HW" as const, rhs: reqHW, coeffs: coeffsByType("HW") },
    ];

    // #region agent log (ndjson)
    fetch(DBG_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: getRunId(),
        hypothesisId: "F2",
        location: "app/modell/page.tsx:calcRequiredFteByRole:coeffs",
        message: "Optimizer coefficients & demand (yearly)",
        data: {
          netHoursYear,
          period,
          req: { A: reqA, B: reqB, C: reqC, HW: reqHW },
          coeffs: {
            A: demandConstraints[0].coeffs,
            B: demandConstraints[1].coeffs,
            C: demandConstraints[2].coeffs,
            HW: demandConstraints[3].coeffs,
          },
          roleInputs: {
            dipl: formData.dipl,
            bkm: (formData as any).bkm,
            fage: formData.fage,
            srk: formData.srk,
            ohneSRK: formData.ohneSRK,
          },
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion agent log (ndjson)

    type Constraint =
      | { kind: "demand"; name: "A" | "B" | "C" | "HW"; coeffs: [number, number, number, number, number]; rhs: number }
      | { kind: "nonneg"; varIdx: 0 | 1 | 2 | 3 | 4 };

    const constraints: Constraint[] = [
      ...demandConstraints.map((c) => ({ kind: "demand" as const, name: c.type, coeffs: c.coeffs, rhs: c.rhs })),
      { kind: "nonneg" as const, varIdx: 0 },
      { kind: "nonneg" as const, varIdx: 1 },
      { kind: "nonneg" as const, varIdx: 2 },
      { kind: "nonneg" as const, varIdx: 3 },
      { kind: "nonneg" as const, varIdx: 4 },
    ];

    const eps = 1e-7;

    const solve5 = (A: number[][], b: number[]) => {
      // Gaussian elimination for 5x5
      const M = A.map((row, i) => [...row, b[i]]);
      for (let col = 0; col < 5; col++) {
        let pivot = col;
        for (let r = col + 1; r < 5; r++) {
          if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
        }
        if (Math.abs(M[pivot][col]) < eps) return null;
        if (pivot !== col) [M[col], M[pivot]] = [M[pivot], M[col]];
        const div = M[col][col];
        for (let c = col; c < 6; c++) M[col][c] /= div;
        for (let r = 0; r < 5; r++) {
          if (r === col) continue;
          const factor = M[r][col];
          if (Math.abs(factor) < eps) continue;
          for (let c = col; c < 6; c++) M[r][c] -= factor * M[col][c];
        }
      }
      return [M[0][5], M[1][5], M[2][5], M[3][5], M[4][5]] as [number, number, number, number, number];
    };

    const dot = (a: [number, number, number, number, number], x: [number, number, number, number, number]) =>
      a[0] * x[0] + a[1] * x[1] + a[2] * x[2] + a[3] * x[3] + a[4] * x[4];

    const isFeasible = (x: [number, number, number, number, number]) => {
      // nonneg
      if (x.some((v) => v < -1e-6)) return false;
      // demands (only if rhs > 0)
      for (const c of demandConstraints) {
        if (c.rhs <= 0) continue;
        if (dot(c.coeffs, x) + 1e-6 < c.rhs) return false;
      }
      return true;
    };

    // Kosten-Priorität gem. Vorgabe:
    // Prio 1: ohne SRK (günstig) → Prio 2: SRK → Prio 3: FaGe → Prio 4: Dipl (teuer)
    // Minimierung über Gewichte (höher = teurer): [dipl, bkm, fage, srk, ohneSRK]
    // Dipl wird sehr stark bestraft, damit Dipl nur dort verwendet wird, wo zwingend nötig (z.B. KLV A).
    const rate = (key: keyof FormData["vollkostenProFte"]) => {
      const n = parseNum((formData.vollkostenProFte as any)?.[key]);
      return n > 0 ? n : null;
    };
    const MODE_WEIGHTS: [number, number, number, number, number] = [
      rate("dipl") ?? 100,
      rate("bkm") ?? (rate("dipl") ?? 100),
      rate("fage") ?? 3,
      rate("srk") ?? 2,
      rate("ohneSRK") ?? 1,
    ];

    const scalarObjective = (x: [number, number, number, number, number]) =>
      MODE_WEIGHTS[0] * x[0] +
      MODE_WEIGHTS[1] * x[1] +
      MODE_WEIGHTS[2] * x[2] +
      MODE_WEIGHTS[3] * x[3] +
      MODE_WEIGHTS[4] * x[4];

    // lexikografischer Tie-breaker (nur bei sehr ähnlichem Objective):
    // weniger Dipl, weniger BKM, mehr FaGe, weniger SRK, weniger ohneSRK
    const lexKey = (x: [number, number, number, number, number]) => [
      scalarObjective(x),
      x[0], // Dipl
      x[1], // BKM
      -x[2], // FaGe (leicht bevorzugen, wenn Objective gleich)
      x[3], // SRK
      x[4], // ohneSRK
    ];

    const lexLess = (a: number[], b: number[], tol = 1e-9) => {
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        const d = a[i] - b[i];
        if (Math.abs(d) <= tol) continue;
        return d < 0;
      }
      return false;
    };

    const infeasibleReasons = demandConstraints
      .filter((c) => c.rhs > 0 && c.coeffs.every((v) => v <= eps))
      .map((c) => c.type);

    // enumerate all combinations of 5 active constraints out of (4 demand + 5 nonneg) = 9
    let bestX: [number, number, number, number, number] | null = null;
    let bestKey: number[] | null = null;
    const n = constraints.length; // 9
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        for (let k = j + 1; k < n; k++) {
          for (let l = k + 1; l < n; l++) {
            for (let m = l + 1; m < n; m++) {
              const active = [constraints[i], constraints[j], constraints[k], constraints[l], constraints[m]];
              const A: number[][] = [];
              const b: number[] = [];
              for (const c of active) {
                if (c.kind === "demand") {
                  A.push([...c.coeffs]);
                  b.push(c.rhs);
                } else {
                  const row = [0, 0, 0, 0, 0];
                  row[c.varIdx] = 1;
                  A.push(row);
                  b.push(0);
                }
              }
              const x = solve5(A, b);
              if (!x) continue;
              const xClean: [number, number, number, number, number] = [
                Math.max(0, x[0]),
                Math.max(0, x[1]),
                Math.max(0, x[2]),
                Math.max(0, x[3]),
                Math.max(0, x[4]),
              ];
              if (!isFeasible(xClean)) continue;
              const key = lexKey(xClean);
              if (!bestKey || lexLess(key, bestKey)) {
                bestKey = key;
                bestX = xClean;
              }
            }
          }
        }
      }
    }

    // #region agent log (ndjson)
    fetch(DBG_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: getRunId(),
        hypothesisId: "F3",
        location: "app/modell/page.tsx:calcRequiredFteByRole:result",
        message: "Optimizer best solution",
        data: {
          optimizeMode,
          costWeights: MODE_WEIGHTS,
          bestX,
          bestKey,
          infeasibleReasons,
          note:
            "Wenn fage=0 und srk>0 bei ähnlichen Koeffizienten, ist das starkes Indiz für Kosten-Gewichte statt Constraints.",
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion agent log (ndjson)

    const required: Record<Role, number> = {
      dipl: bestX ? bestX[0] : Infinity,
      bkm: bestX ? bestX[1] : Infinity,
      fage: bestX ? bestX[2] : Infinity,
      srk: bestX ? bestX[3] : Infinity,
      ohneSRK: bestX ? bestX[4] : Infinity,
    };

    return {
      netHoursYear,
      required,
      totalFte: bestX ? bestX[0] + bestX[1] + bestX[2] + bestX[3] + bestX[4] : Infinity,
      totalCost: bestX ? scalarObjective(bestX) : Infinity,
      infeasible: !bestX,
      infeasibleReasons,
      coefficients: {
        A: demandConstraints[0].coeffs,
        B: demandConstraints[1].coeffs,
        C: demandConstraints[2].coeffs,
        HW: demandConstraints[3].coeffs,
      },
      inputPeriod: period,
      periodDemand: { A: reqA_period, B: reqB_period, C: reqC_period, HW: reqHW_period },
      yearlyDemand: { A: reqA, B: reqB, C: reqC, HW: reqHW },
      costWeights: { dipl: MODE_WEIGHTS[0], bkm: MODE_WEIGHTS[1], fage: MODE_WEIGHTS[2], srk: MODE_WEIGHTS[3], ohneSRK: MODE_WEIGHTS[4] },
      optimizeMode,
    };
  }, [calcRowSum, formData, parseNum, optimizeMode]);

  const hasAnyReq = useMemo(() => {
    return (
      parseNum(formData.stundenvolumen?.klvA) +
        parseNum(formData.stundenvolumen?.klvB) +
        parseNum(formData.stundenvolumen?.klvC) +
        parseNum(formData.stundenvolumen?.hw) >
      0
    );
  }, [formData.stundenvolumen?.klvA, formData.stundenvolumen?.klvB, formData.stundenvolumen?.klvC, formData.stundenvolumen?.hw, parseNum]);

  const fteResult = useMemo(() => {
    if (!hydrated || !hasAnyReq) return null;
    try {
      return calcRequiredFteByRole();
    } catch (e) {
      console.error("Fehler bei FTE-Berechnung:", e);
      return { error: true } as const;
    }
  }, [calcRequiredFteByRole, hasAnyReq, hydrated]);

  const renderRequiredFteOutput = () => {
    return (
      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h3 className="text-sm font-semibold text-gray-900">Benötigte FTE (aus Stundenvolumen)</h3>
          {!hydrated || !hasAnyReq || !fteResult || ("error" in fteResult) || fteResult.infeasible ? null : (
            <div className="text-xs font-semibold text-gray-900 bg-blue-50 border border-blue-200 rounded-full px-2 py-1">
              Kosten-optimiert (ohne SRK → SRK → FaGe → Dipl) · Gesamt-FTE:{" "}
              <span className="tabular-nums">{isFinite(fteResult.totalFte) ? fteResult.totalFte.toFixed(2) : "—"}</span>
            </div>
          )}
        </div>

        {!hydrated ? (
          <p className="text-xs text-gray-600">Lade gespeicherte Modell-Daten…</p>
        ) : !hasAnyReq ? (
          <p className="text-xs text-gray-600">
            Bitte im Input zuerst KLV A/B/C und HW Stunden erfassen, dann erscheint hier die benötigte FTE.
          </p>
        ) : fteResult && "error" in fteResult ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            Interner Fehler bei der Berechnung. Bitte Seite neu laden. (Details in der Browser-Konsole.)
          </div>
        ) : (
          <>
            {(() => {
              if (!fteResult || "error" in fteResult) return null
              const {
                required,
                netHoursYear,
                totalFte,
                totalCost,
                infeasible,
                infeasibleReasons,
                inputPeriod,
                periodDemand,
                yearlyDemand,
                costWeights,
              } = fteResult;
              // Leitung-FTE basiert auf verrechenbarem Stundenvolumen (A+B+C+HW):
              // Regel: bei 2000 verrechneten Stunden braucht es 1.0 FTE Leitung.
              // Der Nenner ist via Leitung-Input steuerbar (Default: 2000).
              const leitungHoursPerFteInput = parseNum(
                (formData.leitung as Record<string, string>)?.anzahlStundenProMonat
              );
              const leitungHoursPerFte = leitungHoursPerFteInput > 0 ? leitungHoursPerFteInput : 2000;
              const totalBillableHoursPeriod = periodDemand.A + periodDemand.B + periodDemand.C + periodDemand.HW;
              const totalBillableHoursYear = yearlyDemand.A + yearlyDemand.B + yearlyDemand.C + yearlyDemand.HW;
              // Leitung-FTE in der gleichen Periode wie die Eingabe (Monat/Jahr).
              // Interpretation: "2000 Stunden => 1.0 Leitung-FTE" gilt für den gewählten Zeitraum.
              const leitungFte =
                inputPeriod === "monthly"
                  ? totalBillableHoursPeriod / leitungHoursPerFte
                  : totalBillableHoursYear / leitungHoursPerFte;
              const leitungFteAnnualized =
                inputPeriod === "monthly" ? (totalBillableHoursYear / leitungHoursPerFte) : null;

              return (
                <>
            {infeasible ? (
              <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                <div className="font-semibold">Nicht berechenbar (infeasible)</div>
                <div>
                  Mindestens eine angeforderte Leistungsart hat bei allen Berufsgruppen Kapazität 0 (Anteil=0 oder Ziel-Verrechenbarkeit=0).
                </div>
                {infeasibleReasons.length > 0 && (
                  <div className="mt-1">
                    Betroffen: <span className="font-medium">{infeasibleReasons.join(", ")}</span>
                  </div>
                )}
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <table className="w-full border border-gray-300 border-collapse text-sm text-gray-900">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 p-2 text-left font-semibold">Berufsgruppe</th>
                    <th className="border border-gray-300 p-2 text-right font-semibold">Stellen%</th>
                    <th className="border border-gray-300 p-2 text-right font-semibold">FTE</th>
                    <th className="border border-gray-300 p-2 text-right font-semibold">CHF / Monat</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const rows = [
                      { label: "Dipl", fte: required.dipl, key: "dipl" as const },
                      { label: "BKM", fte: required.bkm, key: "bkm" as const },
                      { label: "FaGe", fte: required.fage, key: "fage" as const },
                      { label: "SRK/AGS", fte: required.srk, key: "srk" as const },
                      { label: "ohne SRK", fte: required.ohneSRK, key: "ohneSRK" as const },
                      { label: "Leitung", fte: leitungFte, key: "leitung" as const },
                    ];

                    const formatChf = (amount: number) =>
                      new Intl.NumberFormat("de-CH", {
                        style: "currency",
                        currency: "CHF",
                        maximumFractionDigits: 0,
                      }).format(amount);

                    const rowAmount = (fte: number, key: keyof FormData["vollkostenProFte"]) => {
                      if (!isFinite(fte)) return null;
                      const rate = parseNum((formData.vollkostenProFte as any)?.[key]); // CHF / Stunde
                      if (!(rate > 0)) return null;
                      return fte * FTE_HOURS_PER_MONTH * rate;
                    };

                    const totalFte = rows.reduce((acc, r) => (isFinite(r.fte) ? acc + r.fte : acc), 0);
                    const amounts = rows.map((r) => rowAmount(r.fte, r.key)).filter((v): v is number => typeof v === "number");
                    const totalChf = amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) : null;

                    return (
                      <>
                        {rows.map((r) => {
                          const amount = rowAmount(r.fte, r.key);
                          return (
                            <tr key={r.label} className={r.label === "Leitung" ? "bg-blue-50" : undefined}>
                              <td className="border border-gray-300 p-2 font-medium">{r.label}</td>
                              <td className="border border-gray-300 p-2 text-right tabular-nums">
                                {isFinite(r.fte) ? `${(r.fte * 100).toFixed(1)}%` : "—"}
                              </td>
                              <td className="border border-gray-300 p-2 text-right tabular-nums font-semibold">
                                {isFinite(r.fte) ? r.fte.toFixed(2) : "—"}
                              </td>
                              <td className="border border-gray-300 p-2 text-right tabular-nums">
                                {amount !== null ? formatChf(amount) : "—"}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-gray-100">
                          <td className="border border-gray-300 p-2 font-semibold">Total</td>
                          <td className="border border-gray-300 p-2 text-right tabular-nums font-semibold">—</td>
                          <td className="border border-gray-300 p-2 text-right tabular-nums font-semibold">
                            {isFinite(totalFte) ? totalFte.toFixed(2) : "—"}
                          </td>
                          <td className="border border-gray-300 p-2 text-right tabular-nums font-semibold">
                            {totalChf !== null ? formatChf(totalChf) : "—"}
                          </td>
                        </tr>
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>

            <div className="mt-2 text-[11px] text-gray-600 space-y-0.5">
              <div>
                Netto SOLL pro Jahr (Total h geleistet): <span className="text-gray-700">{netHoursYear.toFixed(2)} h</span>
              </div>
              <div>
                Nachfrage (auf Jahresbasis, Eingabe:{" "}
                <span className="text-gray-700">{inputPeriod === "monthly" ? "pro Monat" : "pro Jahr"}</span>):{" "}
                <span className="text-gray-700 tabular-nums">
                  A {yearlyDemand.A.toFixed(2)}h, B {yearlyDemand.B.toFixed(2)}h, C {yearlyDemand.C.toFixed(2)}h, HW{" "}
                  {yearlyDemand.HW.toFixed(2)}h
                </span>
              </div>
              {inputPeriod === "monthly" ? (
                <div>
                  Nachfrage (pro Monat):{" "}
                  <span className="text-gray-700 tabular-nums">
                    A {periodDemand.A.toFixed(2)}h, B {periodDemand.B.toFixed(2)}h, C {periodDemand.C.toFixed(2)}h, HW{" "}
                    {periodDemand.HW.toFixed(2)}h
                  </span>{" "}
                  → ×12 = Jahresbasis
                </div>
              ) : null}
              <div>
                Optimierung: <span className="text-gray-700">minimiere Gesamt-FTE</span> unter Nebenbedingungen A/B/C/HW.
              </div>
              <div>
                Ziel: <span className="text-gray-700">minimiere Kosten</span> (Dipl &gt; FaGe &gt; SRK &gt; ohne SRK)
              </div>
              <div>
                Kosten-Gewichte:{" "}
                <span className="text-gray-700 tabular-nums">
                  Dipl {costWeights.dipl}, BKM {costWeights.bkm}, FaGe {costWeights.fage}, SRK/AGS {costWeights.srk}, ohne SRK {costWeights.ohneSRK}
                </span>
              </div>
              <div>
                Gesamt-Kosten (relativ):{" "}
                <span className="text-gray-900 font-semibold tabular-nums">
                  {isFinite(totalCost) ? totalCost.toFixed(2) : "—"}
                </span>
              </div>
              <div>
                Gesamt-FTE:{" "}
                <span className="text-gray-900 font-semibold tabular-nums">
                  {isFinite(totalFte) ? totalFte.toFixed(2) : "—"}
                </span>
              </div>
              <div>
                Leitung-FTE{" "}
                {inputPeriod === "monthly"
                  ? `(Monat ${totalBillableHoursPeriod.toFixed(2)}h ÷ ${leitungHoursPerFte.toFixed(0)}h)`
                  : `(Jahr ${totalBillableHoursYear.toFixed(2)}h ÷ ${leitungHoursPerFte.toFixed(0)}h)`}{" "}
                :{" "}
                <span className="text-gray-900 font-semibold tabular-nums">
                  {isFinite(leitungFte) ? leitungFte.toFixed(2) : "—"}
                </span>
                {inputPeriod === "monthly" && leitungFteAnnualized !== null ? (
                  <span className="text-gray-600 tabular-nums">
                    {" "}
                    (Jahresäquivalent: {isFinite(leitungFteAnnualized) ? leitungFteAnnualized.toFixed(2) : "—"})
                  </span>
                ) : null}
              </div>
            </div>
                </>
              );
            })()}
          </>
        )}
      </div>
    );
  };

  const renderErtraegeOutput = () => {
    const period = formData.stundenvolumen?.period ?? "monthly";
    const hours = {
      A: parseNum(formData.stundenvolumen?.klvA),
      B: parseNum(formData.stundenvolumen?.klvB),
      C: parseNum(formData.stundenvolumen?.klvC),
      HW: parseNum(formData.stundenvolumen?.hw),
    };
    const rates = {
      A: parseNum(formData.tarifeProStunde?.klvA),
      B: parseNum(formData.tarifeProStunde?.klvB),
      C: parseNum(formData.tarifeProStunde?.klvC),
      HW: parseNum(formData.tarifeProStunde?.hw),
    };

    const rows = [
      { key: "A", label: "Erträge aus A‑Leistungen", hours: hours.A, rate: rates.A },
      { key: "B", label: "Erträge aus B‑Leistungen", hours: hours.B, rate: rates.B },
      { key: "C", label: "Erträge aus C‑Leistungen", hours: hours.C, rate: rates.C },
      { key: "HW", label: "Erträge aus HW‑Leistungen", hours: hours.HW, rate: rates.HW },
    ] as const;

    const amounts = rows.map((r) => r.hours * r.rate);
    const total = amounts.reduce((a, b) => a + b, 0);
    const hasAny = rows.some((r) => r.hours > 0 || r.rate > 0);

    const formatChf0 = (n: number) =>
      new Intl.NumberFormat("de-CH", {
        style: "currency",
        currency: "CHF",
        maximumFractionDigits: 0,
      }).format(n);

    const formatChf2 = (n: number) =>
      new Intl.NumberFormat("de-CH", {
        style: "currency",
        currency: "CHF",
        maximumFractionDigits: 2,
      }).format(n);

    return (
      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h3 className="text-sm font-semibold text-gray-900">
            Erträge ({period === "monthly" ? "pro Monat" : "pro Jahr"})
          </h3>
          {hasAny ? (
            <div className="text-xs font-semibold text-gray-900 bg-green-50 border border-green-200 rounded-full px-2 py-1">
              Total: <span className="tabular-nums">{formatChf0(total)}</span>
            </div>
          ) : null}
        </div>

        {!hasAny ? (
          <p className="text-xs text-gray-600">
            Bitte im Input zuerst Stunden (blauer Block) und Tarife/Std erfassen.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border border-gray-300 border-collapse text-sm text-gray-900">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 p-2 text-left font-semibold">Position</th>
                  <th className="border border-gray-300 p-2 text-right font-semibold">Stunden</th>
                  <th className="border border-gray-300 p-2 text-right font-semibold">Tarif/Std</th>
                  <th className="border border-gray-300 p-2 text-right font-semibold">CHF</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={r.key}>
                    <td className="border border-gray-300 p-2 font-medium">{r.label}</td>
                    <td className="border border-gray-300 p-2 text-right tabular-nums">{r.hours.toFixed(2)}</td>
                    <td className="border border-gray-300 p-2 text-right tabular-nums">{formatChf2(r.rate)}</td>
                    <td className="border border-gray-300 p-2 text-right tabular-nums font-semibold">
                      {formatChf0(amounts[idx])}
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-100">
                  <td className="border border-gray-300 p-2 font-semibold">Total</td>
                  <td className="border border-gray-300 p-2 text-right tabular-nums font-semibold">—</td>
                  <td className="border border-gray-300 p-2 text-right tabular-nums font-semibold">—</td>
                  <td className="border border-gray-300 p-2 text-right tabular-nums font-semibold">{formatChf0(total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderVerrechenbarkeitOutput = () => {
    const period = formData.stundenvolumen?.period ?? "monthly";

    // Erträge (im selben Zeitraum wie Input-Stunden)
    const hours = {
      A: parseNum(formData.stundenvolumen?.klvA),
      B: parseNum(formData.stundenvolumen?.klvB),
      C: parseNum(formData.stundenvolumen?.klvC),
      HW: parseNum(formData.stundenvolumen?.hw),
    };
    const rates = {
      A: parseNum(formData.tarifeProStunde?.klvA),
      B: parseNum(formData.tarifeProStunde?.klvB),
      C: parseNum(formData.tarifeProStunde?.klvC),
      HW: parseNum(formData.tarifeProStunde?.hw),
    };
    const revenuePeriod = hours.A * rates.A + hours.B * rates.B + hours.C * rates.C + hours.HW * rates.HW;

    // Kosten aus benötigten FTEs (Basis: CHF/Monat; bei period=yearly wird auf Jahr hochgerechnet)
    const formatChf0 = (n: number) =>
      new Intl.NumberFormat("de-CH", {
        style: "currency",
        currency: "CHF",
        maximumFractionDigits: 0,
      }).format(n);

    const canComputeCosts = hydrated && hasAnyReq && fteResult && !("error" in fteResult) && !fteResult.infeasible;
    let costMonth: number | null = null;
    let costPeriod: number | null = null;

    if (canComputeCosts) {
      const required = fteResult!.required;

      // Leitung-FTE analog zur Tabelle (gleiche Formel wie in renderRequiredFteOutput)
      const leitungHoursPerFteInput = parseNum((formData.leitung as Record<string, string>)?.anzahlStundenProMonat);
      const leitungHoursPerFte = leitungHoursPerFteInput > 0 ? leitungHoursPerFteInput : 2000;
      const totalBillableHoursPeriod = hours.A + hours.B + hours.C + hours.HW;
      const totalBillableHoursYear = totalBillableHoursPeriod * 12;
      const leitungFte =
        period === "monthly"
          ? totalBillableHoursPeriod / leitungHoursPerFte
          : totalBillableHoursYear / leitungHoursPerFte;

      const rowAmountMonth = (fte: number, key: keyof FormData["vollkostenProFte"]) => {
        if (!isFinite(fte)) return null;
        const rate = parseNum((formData.vollkostenProFte as any)?.[key]); // CHF / Stunde
        if (!(rate > 0)) return null;
        return fte * FTE_HOURS_PER_MONTH * rate;
      };

      const amounts = [
        rowAmountMonth(required.dipl, "dipl"),
        rowAmountMonth(required.fage, "fage"),
        rowAmountMonth(required.srk, "srk"),
        rowAmountMonth(required.ohneSRK, "ohneSRK"),
        rowAmountMonth(leitungFte, "leitung"),
      ].filter((v): v is number => typeof v === "number");

      costMonth = amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) : null;
      costPeriod =
        costMonth === null ? null : period === "monthly" ? costMonth : costMonth * 12;
    }

    const hasAnyRevenue = revenuePeriod > 0;
    const ratioPct = hasAnyRevenue && costPeriod !== null ? (costPeriod / revenuePeriod) * 100 : null;
    const diffChf = costPeriod !== null ? revenuePeriod - costPeriod : null;

    return (
      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h3 className="text-sm font-semibold text-gray-900">
            Verrechenbarkeit ({period === "monthly" ? "pro Monat" : "pro Jahr"})
          </h3>
          {ratioPct !== null ? (
            <div className="text-xs font-semibold text-gray-900 bg-purple-50 border border-purple-200 rounded-full px-2 py-1">
              Verhältnis Kosten/Ertrag: <span className="tabular-nums">{ratioPct.toFixed(1)}%</span>
            </div>
          ) : null}
        </div>

        {!hasAnyRevenue ? (
          <p className="text-xs text-gray-600">
            Bitte zuerst Stunden (blauer Block) und Tarife/Std erfassen, damit Erträge & Verrechenbarkeit berechnet werden können.
          </p>
        ) : costPeriod === null ? (
          <p className="text-xs text-gray-600">
            Kosten konnten nicht berechnet werden (bitte FTE‑Berechnung und Sätze CHF/Std prüfen).
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-600 mb-1">Kosten (Total „benötigte FTE’s“)</div>
              <div className="text-lg font-semibold text-gray-900 tabular-nums">{formatChf0(costPeriod)}</div>
            </div>
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-600 mb-1">Erträge (Total)</div>
              <div className="text-lg font-semibold text-gray-900 tabular-nums">{formatChf0(revenuePeriod)}</div>
            </div>
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-600 mb-1">Differenz (Ertrag − Kosten)</div>
              <div className="text-lg font-semibold text-gray-900 tabular-nums">
                {diffChf !== null ? formatChf0(diffChf) : "—"}
              </div>
            </div>
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-600 mb-1">Verhältnis Kosten/Ertrag</div>
              <div className="text-lg font-semibold text-gray-900 tabular-nums">
                {ratioPct !== null ? `${ratioPct.toFixed(1)}%` : "—"}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderSollArbeitszeitProJahr = () => (
    <div className="bg-white rounded-lg shadow-md p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-base font-semibold text-gray-900">SOLL-Arbeitszeit pro Jahr</h2>
        <button
          type="button"
          onClick={() => {
            const defaults = getDefaultFormData();
            setFormData((prev) => ({
              ...prev,
              sollArbeitszeitProJahr: defaults.sollArbeitszeitProJahr,
              sollArbeitszeitProJahrAnnahme: defaults.sollArbeitszeitProJahrAnnahme,
            }));
          }}
          className="bg-gray-700 text-white px-3 py-1.5 text-sm rounded-md hover:bg-gray-800 transition"
        >
          Defaults laden (Tabelle)
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1200px] w-full border border-gray-300 border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 p-2 text-left text-sm font-semibold text-gray-900 w-[220px]">
                &nbsp;
              </th>
              {MONTHS.map((m) => (
                <th key={m} className="border border-gray-300 p-2 text-center text-sm font-semibold text-gray-900">
                  {m}
                </th>
              ))}
              <th className="border border-gray-300 p-2 text-center text-sm font-semibold text-gray-900">
                Durchschnitt pro Monat in h
              </th>
              <th className="border border-gray-300 p-2 text-center text-sm font-semibold text-gray-900">
                Total pro Jahr in h
              </th>
              <th className="border border-gray-300 p-2 text-left text-sm font-semibold text-gray-900 w-[220px]">
                Annahme
              </th>
            </tr>
          </thead>
          <tbody>
            {SOLL_ALL_ROWS.map((row) => (
              <tr key={row}>
                <td className="border border-gray-300 p-2 text-sm font-medium text-gray-900 bg-gray-50 whitespace-nowrap">
                  {row}
                </td>
                {MONTHS.map((m) => (
                  <td key={`${row}-${m}`} className="border border-gray-300 p-1 bg-white">
                    {row === "Total h geleistet" ? (
                      <div className="w-full px-2 py-1 text-sm text-gray-900 bg-gray-50 rounded-md border border-gray-200 text-right">
                        {calcTotalGeleistetMonth(m).toFixed(2)}
                      </div>
                    ) : (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={getSollArbeitszeit(row, m)}
                        onChange={(e) => updateSollArbeitszeit(row, m, e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-gray-200 rounded-md text-gray-900 bg-pink-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right"
                        placeholder="0.00"
                      />
                    )}
                  </td>
                ))}

                <td className="border border-gray-300 p-1 bg-white">
                  <div className="w-full px-2 py-1 text-sm text-gray-900 bg-gray-50 rounded-md border border-gray-200 text-right">
                    {calcRowAvg(row).toFixed(2)}
                  </div>
                </td>
                <td className="border border-gray-300 p-1 bg-white">
                  <div className="w-full px-2 py-1 text-sm text-gray-900 bg-gray-50 rounded-md border border-gray-200 text-right">
                    {calcRowSum(row).toFixed(2)}
                  </div>
                </td>
                <td className="border border-gray-300 p-1 bg-white">
                  {row === "Total h geleistet" ? (
                    <div className="w-full px-2 py-1 text-sm text-gray-500 italic">berechnet</div>
                  ) : (
                    <input
                      type="text"
                      value={getSollArbeitszeitAnnahme(row)}
                      onChange={(e) => updateSollArbeitszeitAnnahme(row, e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-200 rounded-md text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder=""
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      {clientError ? (
        <div className="max-w-7xl mx-auto mt-3 px-4 sm:px-6 lg:px-8">
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <div className="font-semibold mb-1">Client Error (Safari)</div>
            <pre className="whitespace-pre-wrap text-xs text-red-700">{clientError}</pre>
            <button
              type="button"
              onClick={() => setClientError(null)}
              className="mt-2 bg-red-700 text-white px-3 py-1.5 text-xs rounded-md hover:bg-red-800 transition"
            >
              Ausblenden
            </button>
          </div>
        </div>
      ) : null}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-xl font-bold text-red-600 mb-4">Modell</h1>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Input-Fenster */}
            <div className="bg-white rounded-lg shadow-md p-4">
              <h2 className="text-base font-semibold text-gray-900 mb-3">
                Input
              </h2>
              
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {/* Stundenvolumen (ganz oben) */}
                {renderStundenvolumenFields()}

                {/* Tarife */}
                {renderTarifeFields()}

                {/* Dipl */}
                {renderSectionFields("dipl", "Dipl")}

                {/* BKM */}
                {renderSectionFields("bkm", "BKM")}
                
                {/* FaGe */}
                {renderSectionFields("fage", "FaGe")}
                
                {/* SRK */}
                {renderSectionFields("srk", "SRK/AGS")}
                
                {/* ohne SRK */}
                {renderSectionFields("ohneSRK", "ohne SRK")}
                
                {/* Leitung */}
                {renderLeitungFields()}

                {/* Vollkosten */}
                {renderVollkostenFields()}
              </div>

            </div>

            {/* Output-Fenster */}
            <div className="bg-white rounded-lg shadow-md p-4">
              <h2 className="text-base font-semibold text-gray-900 mb-3">
                Output
              </h2>

              {renderRequiredFteOutput()}
              {renderErtraegeOutput()}
              {renderVerrechenbarkeitOutput()}
            </div>
          </div>

          <div className="mt-6">
            {renderSollArbeitszeitProJahr()}
          </div>
        </div>
      </main>
    </div>
  );
}

