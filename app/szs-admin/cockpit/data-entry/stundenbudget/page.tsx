"use client";

import Navigation from "@/components/admin-szs/cockpit/Navigation";
import * as XLSX from "xlsx";
import { useMemo, useState } from "react";

type BudgetSeries = {
  months: Record<string, number>;
  total: number;
};

type Stundenbudget = {
  year: number;
  sourceFileName: string;
  klvA: BudgetSeries;
  klvB: BudgetSeries;
  klvC: BudgetSeries;
  hw: BudgetSeries;
};

const LS_KEY = "stundenbudget-2026-v1";

function parseNumberCH(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string") return 0;
  const s = raw.trim();
  if (!s) return 0;
  const cleaned = s.replace(/\s+/g, "").replace(/'/g, "").replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function extractBudgetSeriesFromSheet(
  wb: XLSX.WorkBook,
  sheetName: string,
  firstColKeyGuess: string,
  sectionLabelRegex?: RegExp
): BudgetSeries | null {
  const ws = wb.Sheets[sheetName];
  if (!ws) return null;
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "", raw: false });

  const firstKey = Object.keys(rows[0] ?? {})[0] || firstColKeyGuess;
  const headerRowIdx = rows.findIndex((r) => String(r[firstKey] ?? "").trim() === "Jahr");
  const headerRow = headerRowIdx >= 0 ? rows[headerRowIdx] : null;
  const monthKeys = headerRow
    ? Object.keys(headerRow).filter((k) => k !== firstKey && String(headerRow[k] ?? "").trim() !== "" && String(headerRow[k]).trim() !== "Total")
    : [];
  const totalKey = headerRow
    ? Object.keys(headerRow).find((k) => String(headerRow[k] ?? "").trim() === "Total")
    : undefined;

  // Find the "Budget 2026" data row. If sectionLabelRegex provided, pick the first Budget row after section header.
  let budgetRowIdx = rows.findIndex((r) => String(r[firstKey] ?? "").trim() === "Budget 2026");
  if (sectionLabelRegex) {
    const sectionIdx = rows.findIndex((r) => sectionLabelRegex.test(String(r[firstKey] ?? "")));
    if (sectionIdx >= 0) {
      const after = rows.slice(sectionIdx + 1);
      const rel = after.findIndex((r) => String(r[firstKey] ?? "").trim() === "Budget 2026");
      if (rel >= 0) budgetRowIdx = sectionIdx + 1 + rel;
    }
  }

  const budgetRow = budgetRowIdx >= 0 ? rows[budgetRowIdx] : null;
  if (!budgetRow) return null;

  const months: Record<string, number> = {};
  for (const k of monthKeys) {
    const label = String(headerRow?.[k] ?? k).trim();
    months[label] = parseNumberCH(budgetRow[k]);
  }
  const total = totalKey ? parseNumberCH(budgetRow[totalKey]) : 0;
  return { months, total };
}

function extractKlvABC(wb: XLSX.WorkBook) {
  const ws = wb.Sheets["KLV A_B_C"];
  if (!ws) return null;
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "", raw: false });
  const firstKey = Object.keys(rows[0] ?? {})[0] || "KLV-Stunden ";

  // Identify month header row (Jahr + Jan..Dez + Total)
  const headerRowIdx = rows.findIndex((r) => String(r[firstKey] ?? "").trim() === "Jahr");
  const headerRow = headerRowIdx >= 0 ? rows[headerRowIdx] : null;
  if (!headerRow) return null;
  const monthKeys = Object.keys(headerRow).filter((k) => k !== firstKey && String(headerRow[k] ?? "").trim() !== "" && String(headerRow[k]).trim() !== "Total");
  const totalKey = Object.keys(headerRow).find((k) => String(headerRow[k] ?? "").trim() === "Total");

  const parseSection = (labelRegex: RegExp): BudgetSeries | null => {
    const sectionIdx = rows.findIndex((r) => labelRegex.test(String(r[firstKey] ?? "")));
    if (sectionIdx < 0) return null;
    const after = rows.slice(sectionIdx + 1);
    const rel = after.findIndex((r) => String(r[firstKey] ?? "").trim() === "Budget 2026");
    if (rel < 0) return null;
    const budgetRow = after[rel];
    const months: Record<string, number> = {};
    for (const k of monthKeys) {
      const label = String(headerRow[k] ?? k).trim();
      months[label] = parseNumberCH(budgetRow[k]);
    }
    const total = totalKey ? parseNumberCH(budgetRow[totalKey]) : 0;
    return { months, total };
  };

  const a = parseSection(/KLV A/i);
  const b = parseSection(/KLV B/i);
  const c = parseSection(/KLV C/i);
  return { a, b, c };
}

export default function StundenbudgetPage() {
  const [budget, setBudget] = useState<Stundenbudget | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });

      const abc = extractKlvABC(wb);
      const hw = extractBudgetSeriesFromSheet(wb, "HW-Std.", "Hauswirtschafts-Stunden ");

      if (!abc?.a || !abc?.b || !abc?.c || !hw) {
        throw new Error("Konnte Budget 2026 nicht zuverlässig aus der Datei lesen (Sheets/Struktur prüfen).");
      }

      const next: Stundenbudget = {
        year: 2026,
        sourceFileName: file.name,
        klvA: abc.a,
        klvB: abc.b,
        klvC: abc.c,
        hw,
      };
      setBudget(next);
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  };

  const summary = useMemo(() => {
    if (!budget) return null;
    const totalKlv = budget.klvA.total + budget.klvB.total + budget.klvC.total;
    const totalAll = totalKlv + budget.hw.total;
    return { totalKlv, totalAll };
  }, [budget]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Stundenbudget</h1>
              <p className="text-sm text-gray-600 mt-1">
                Budgetierte Stunden (KLV A/B/C, HW) für SOLL‑FTE (Budget 2026).
              </p>
            </div>

            <label className="inline-flex items-center gap-2 text-sm">
              <span className="px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition cursor-pointer">
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

          {error ? (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <div className="font-semibold">Fehler beim Einlesen</div>
              <div className="mt-1 text-xs font-mono">{error}</div>
            </div>
          ) : null}

          <div className="bg-white rounded-lg shadow border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              {budget ? (
                <div className="text-sm text-gray-700">
                  <span className="font-medium">Quelle:</span>{" "}
                  <span className="font-mono">{budget.sourceFileName}</span>
                  {summary ? (
                    <span className="text-gray-500">
                      {" "}
                      · Total KLV: {summary.totalKlv.toLocaleString("de-CH")} h · Total inkl. HW:{" "}
                      {summary.totalAll.toLocaleString("de-CH")} h
                    </span>
                  ) : null}
                </div>
              ) : (
                <div className="text-sm text-gray-600">
                  Bitte die Datei <span className="font-mono">KLV_HW_Betr_Std.xlsx</span> hochladen.
                </div>
              )}
            </div>

            {budget ? (
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {(
                  [
                    ["KLV A", budget.klvA.total],
                    ["KLV B", budget.klvB.total],
                    ["KLV C", budget.klvC.total],
                    ["HW", budget.hw.total],
                  ] as const
                ).map(([label, val]) => (
                  <div key={label} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div className="text-xs text-gray-500 mb-1">{label} (Total 2026)</div>
                    <div className="text-2xl font-semibold text-gray-900 tabular-nums">
                      {val.toLocaleString("de-CH")} h
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}

