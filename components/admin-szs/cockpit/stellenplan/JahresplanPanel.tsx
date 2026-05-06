"use client";

import * as XLSX from "xlsx";
import { useEffect, useMemo, useState } from "react";

type CalendarRow = Record<string, string>;

type JahresplanState = {
  sourceFileName: string;
  sheetName: string;
  rows: CalendarRow[];
};

const LS_JAHRESPLAN_KEY = "jahresplan-2026-monate-wochentage-v1";
const LS_STUNDENBUDGET_KEY = "stundenbudget-2026-v1";
const LS_MODELL_KEY = "modell-form-data";

type BudgetSeries = { months?: Record<string, number>; total?: number } | { total: number };
type Stundenbudget = {
  year: number;
  sourceFileName?: string;
  klvA: BudgetSeries;
  klvB: BudgetSeries;
  klvC: BudgetSeries;
  hw: BudgetSeries;
};

type RoleKey = "dipl" | "fage" | "srk" | "ohneSRK";
type RoleConfig = {
  zielVerrechenbarkeitPct: number;
  anteilA: number;
  anteilB: number;
  anteilC: number;
  anteilHW: number;
};

const DEFAULT_ROLE_CONFIG: Record<RoleKey, RoleConfig> = {
  dipl: { zielVerrechenbarkeitPct: 65, anteilA: 30, anteilB: 40, anteilC: 30, anteilHW: 0 },
  fage: { zielVerrechenbarkeitPct: 75, anteilA: 0, anteilB: 70, anteilC: 30, anteilHW: 0 },
  srk: { zielVerrechenbarkeitPct: 85, anteilA: 0, anteilB: 0, anteilC: 70, anteilHW: 30 },
  ohneSRK: { zielVerrechenbarkeitPct: 90, anteilA: 0, anteilB: 0, anteilC: 0, anteilHW: 100 },
};

const MONTHS_DE_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sept", "Okt", "Nov", "Dez"] as const;
type MonthKey = (typeof MONTHS_DE_SHORT)[number];

function normalizeMonthKey(raw: string): MonthKey | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith("jan")) return "Jan";
  if (s.startsWith("feb")) return "Feb";
  if (s.startsWith("mär") || s.startsWith("mar")) return "Mär";
  if (s.startsWith("apr")) return "Apr";
  if (s.startsWith("mai") || s.startsWith("may")) return "Mai";
  if (s.startsWith("jun") || s.startsWith("juni")) return "Jun";
  if (s.startsWith("jul") || s.startsWith("juli")) return "Jul";
  if (s.startsWith("aug")) return "Aug";
  if (s.startsWith("sep") || s.startsWith("sept")) return "Sept";
  if (s.startsWith("okt") || s.startsWith("oct")) return "Okt";
  if (s.startsWith("nov")) return "Nov";
  if (s.startsWith("dez") || s.startsWith("dec")) return "Dez";
  return null;
}

function safeNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v ?? "").replace(/\s+/g, "").replace("'", "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function seriesMonthValue(series: BudgetSeries, month: MonthKey): number {
  const months = (series as any)?.months as Record<string, number> | undefined;
  if (!months) return 0;
  for (const [k, v] of Object.entries(months)) {
    const mk = normalizeMonthKey(k);
    if (mk === month) return safeNum(v);
  }
  return 0;
}

function loadModell(): {
  roles: Record<RoleKey, RoleConfig>;
  netHoursPerMonth: Record<MonthKey, number>;
} {
  const roles = { ...DEFAULT_ROLE_CONFIG };
  const netHoursPerMonth: Record<MonthKey, number> = Object.fromEntries(
    MONTHS_DE_SHORT.map((m) => [m, 0])
  ) as any;

  try {
    const raw = localStorage.getItem(LS_MODELL_KEY);
    if (!raw) throw new Error("no modell");
    const parsed = JSON.parse(raw) as any;

    const get = (role: RoleKey, key: string) => safeNum(parsed?.[role]?.[key]);
    for (const role of ["dipl", "fage", "srk", "ohneSRK"] as const) {
      roles[role] = {
        zielVerrechenbarkeitPct: get(role, "zielVerrechenbarkeit") || DEFAULT_ROLE_CONFIG[role].zielVerrechenbarkeitPct,
        anteilA: get(role, "anteilKLV_A") || DEFAULT_ROLE_CONFIG[role].anteilA,
        anteilB: get(role, "anteilKLV_B") || DEFAULT_ROLE_CONFIG[role].anteilB,
        anteilC: get(role, "anteilKLV_C") || DEFAULT_ROLE_CONFIG[role].anteilC,
        anteilHW: get(role, "anteilHauswirtschaft") || DEFAULT_ROLE_CONFIG[role].anteilHW,
      };
    }

    const soll = parsed?.sollArbeitszeitProJahr?.["SOLL h in ZH"] ?? {};
    const ferien = parsed?.sollArbeitszeitProJahr?.["Ferien"] ?? {};
    const krank = parsed?.sollArbeitszeitProJahr?.["Krank"] ?? {};
    const wb = parsed?.sollArbeitszeitProJahr?.["Weiterbildung"] ?? {};
    for (const k of Object.keys(soll)) {
      const mk = normalizeMonthKey(k);
      if (!mk) continue;
      netHoursPerMonth[mk] = safeNum(soll[k]) - safeNum(ferien[k]) - safeNum(krank[k]) - safeNum(wb[k]);
    }
  } catch {
    // fallback: approx. 1831.56 / 12
    for (const m of MONTHS_DE_SHORT) netHoursPerMonth[m] = 1831.56 / 12;
  }

  // guard against zeros (e.g. only partial modell data saved)
  for (const m of MONTHS_DE_SHORT) {
    if (!netHoursPerMonth[m] || netHoursPerMonth[m] < 1) netHoursPerMonth[m] = 1831.56 / 12;
  }

  return { roles, netHoursPerMonth };
}

function solveRequiredFteByRoleMonth(
  demand: { A: number; B: number; C: number; HW: number },
  netHoursPerFteMonth: number,
  roles: Record<RoleKey, RoleConfig>
): Record<RoleKey, number> {
  const roleOrder: RoleKey[] = ["dipl", "fage", "srk", "ohneSRK"];

  const capPerFte = (role: RoleKey, type: "A" | "B" | "C" | "HW") => {
    const r = roles[role];
    const bill = (r.zielVerrechenbarkeitPct || 0) / 100;
    const share =
      type === "A" ? (r.anteilA || 0) / 100 :
      type === "B" ? (r.anteilB || 0) / 100 :
      type === "C" ? (r.anteilC || 0) / 100 :
      (r.anteilHW || 0) / 100;
    return netHoursPerFteMonth * bill * share;
  };

  // HW explizit als ohneSRK planen (wie im StellenplanTable)
  const hwCapOhne = capPerFte("ohneSRK", "HW");
  const minOhneForHw = demand.HW > 0 && hwCapOhne > 0 ? Math.max(0, demand.HW / hwCapOhne) : 0;
  const demandForLp = minOhneForHw > 0 ? { ...demand, HW: 0 } : demand;

  const coeffsByType = (type: "A" | "B" | "C" | "HW") =>
    roleOrder.map((r) => capPerFte(r, type)) as [number, number, number, number];

  const demandConstraints = [
    { rhs: demandForLp.A, coeffs: coeffsByType("A") },
    { rhs: demandForLp.B, coeffs: coeffsByType("B") },
    { rhs: demandForLp.C, coeffs: coeffsByType("C") },
    ...(demandForLp.HW > 0 ? [{ rhs: demandForLp.HW, coeffs: coeffsByType("HW") }] : []),
  ].filter((c) => c.rhs > 0);

  // If there is no KLV demand, only HW-minimum matters
  if (demandConstraints.length === 0) {
    return { dipl: 0, fage: 0, srk: 0, ohneSRK: minOhneForHw };
  }

  type Constraint =
    | { kind: "demand"; coeffs: [number, number, number, number]; rhs: number }
    | { kind: "nonneg"; varIdx: 0 | 1 | 2 | 3 };

  const constraints: Constraint[] = [
    ...demandConstraints.map((c) => ({ kind: "demand" as const, coeffs: c.coeffs, rhs: c.rhs })),
    { kind: "nonneg" as const, varIdx: 0 },
    { kind: "nonneg" as const, varIdx: 1 },
    { kind: "nonneg" as const, varIdx: 2 },
    { kind: "nonneg" as const, varIdx: 3 },
  ];

  const eps = 1e-7;
  const solve4 = (A: number[][], b: number[]) => {
    const M = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < 4; col++) {
      let pivot = col;
      for (let r = col + 1; r < 4; r++) {
        if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
      }
      if (Math.abs(M[pivot][col]) < eps) return null;
      if (pivot !== col) [M[col], M[pivot]] = [M[pivot], M[col]];
      const div = M[col][col];
      for (let c = col; c < 5; c++) M[col][c] /= div;
      for (let r = 0; r < 4; r++) {
        if (r === col) continue;
        const factor = M[r][col];
        if (Math.abs(factor) < eps) continue;
        for (let c = col; c < 5; c++) M[r][c] -= factor * M[col][c];
      }
    }
    return [M[0][4], M[1][4], M[2][4], M[3][4]] as [number, number, number, number];
  };

  const dot = (a: [number, number, number, number], x: [number, number, number, number]) =>
    a[0] * x[0] + a[1] * x[1] + a[2] * x[2] + a[3] * x[3];

  const isFeasible = (x: [number, number, number, number]) => {
    if (x.some((v) => v < -1e-6)) return false;
    for (const c of demandConstraints) {
      if (dot(c.coeffs, x) + 1e-6 < c.rhs) return false;
    }
    return true;
  };

  // Kosten-Priorität wie im Modell
  const MODE_WEIGHTS: [number, number, number, number] = [100, 3, 2, 1];
  const scalarObjective = (x: [number, number, number, number]) =>
    MODE_WEIGHTS[0] * x[0] + MODE_WEIGHTS[1] * x[1] + MODE_WEIGHTS[2] * x[2] + MODE_WEIGHTS[3] * x[3];
  const lexKey = (x: [number, number, number, number]) => [
    scalarObjective(x),
    x[0],
    -x[1],
    x[2],
    x[3],
  ];
  const lexLess = (a: number[], b: number[], tol = 1e-9) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const d = a[i] - b[i];
      if (Math.abs(d) <= tol) continue;
      return d < 0;
    }
    return false;
  };

  let bestX: [number, number, number, number] | null = null;
  let bestKey: number[] | null = null;

  const n = constraints.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        for (let l = k + 1; l < n; l++) {
          const active = [constraints[i], constraints[j], constraints[k], constraints[l]];
          const A: number[][] = [];
          const b: number[] = [];
          for (const c of active) {
            if (c.kind === "demand") {
              A.push([...c.coeffs]);
              b.push(c.rhs);
            } else {
              const row = [0, 0, 0, 0];
              row[c.varIdx] = 1;
              A.push(row);
              b.push(0);
            }
          }
          const x = solve4(A, b);
          if (!x) continue;
          const xClean: [number, number, number, number] = [
            Math.max(0, x[0]),
            Math.max(0, x[1]),
            Math.max(0, x[2]),
            Math.max(0, x[3]),
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

  if (!bestX) return { dipl: 0, fage: 0, srk: 0, ohneSRK: minOhneForHw };
  return { dipl: bestX[0], fage: bestX[1], srk: bestX[2], ohneSRK: bestX[3] + minOhneForHw };
}

function isWeekendCell(cell: string): boolean {
  const s = cell.trim().toLowerCase();
  return s.endsWith(" sa") || s.endsWith(" so") || /\bsa\b/.test(s) || /\bso\b/.test(s);
}

export default function JahresplanPanel() {
  const [calendar, setCalendar] = useState<JahresplanState | null>(null);
  const [budget, setBudget] = useState<Stundenbudget | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_JAHRESPLAN_KEY);
      if (raw) setCalendar(JSON.parse(raw));
    } catch {
      // ignore
    }
    try {
      const raw = localStorage.getItem(LS_STUNDENBUDGET_KEY);
      if (raw) setBudget(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const sheetName = wb.SheetNames[0] ?? "";
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "", raw: false })
      .map((r) => {
        const out: CalendarRow = {};
        for (const [k, v] of Object.entries(r)) out[k] = String(v ?? "");
        return out;
      });
    const next: JahresplanState = { sourceFileName: file.name, sheetName, rows };
    setCalendar(next);
    localStorage.setItem(LS_JAHRESPLAN_KEY, JSON.stringify(next));
  };

  const monthSolls = useMemo(() => {
    if (!budget) return null;
    const { roles, netHoursPerMonth } = loadModell();
    const byMonth: Record<MonthKey, Record<RoleKey, number>> = {} as any;
    for (const m of MONTHS_DE_SHORT) {
      const demand = {
        A: seriesMonthValue(budget.klvA, m),
        B: seriesMonthValue(budget.klvB, m),
        C: seriesMonthValue(budget.klvC, m),
        HW: seriesMonthValue(budget.hw, m),
      };
      byMonth[m] = solveRequiredFteByRoleMonth(demand, netHoursPerMonth[m], roles);
    }
    return byMonth;
  }, [budget]);

  const fmt = (n: number) =>
    new Intl.NumberFormat("de-CH", { maximumFractionDigits: 2 }).format(n);

  return (
    <div className="p-4 border-b border-gray-200">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">Jahresplan 2026 (Monate / Wochentage)</div>
          <div className="text-xs text-gray-600 mt-1">
            Import aus <span className="font-mono">Jahresplan_2026_Monate_Wochentage.xlsx</span>
          </div>
        </div>

        <label className="inline-flex items-center gap-2 text-sm">
          <span className="px-3 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition cursor-pointer">
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

      {!calendar ? (
        <div className="mt-3 text-sm text-gray-600">
          Noch kein Jahresplan importiert. Bitte die Excel hochladen.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <div className="text-xs text-gray-500 mb-2">
            Quelle: <span className="font-mono">{calendar.sourceFileName}</span> · Sheet:{" "}
            <span className="font-mono">{calendar.sheetName}</span>
          </div>
          <table className="min-w-[900px] w-full border-separate border-spacing-0 text-xs text-gray-900">
            <thead>
              <tr>
                {Object.keys(calendar.rows[0] ?? {}).map((m) => (
                  <th
                    key={m}
                    className="border-b border-gray-200 px-2 py-2 text-left font-semibold bg-gray-50"
                    style={{ minWidth: 110 }}
                  >
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calendar.rows.map((r, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  {Object.keys(calendar.rows[0] ?? {}).map((m) => {
                    const cell = r[m] ?? "";
                    const weekend = isWeekendCell(cell);
                    return (
                      <td
                        key={m}
                        className={`border-b border-gray-100 px-2 py-1 whitespace-nowrap ${weekend ? "bg-amber-50" : ""}`}
                      >
                        {cell || "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6">
        <div className="text-sm font-semibold text-gray-900">SOLL pro Monat (Modellberechnung)</div>
        <div className="text-xs text-gray-600 mt-1">
          Basis: Stundenbudget (Monatswerte) + Modell (Verrechenbarkeit & Monats‑Nettoarbeitszeit).
        </div>

        {!budget ? (
          <div className="mt-2 text-sm text-gray-600">
            Kein Stundenbudget gefunden. Bitte zuerst unter <span className="font-medium">Dateneingabe → Stundenbudget</span> hochladen.
          </div>
        ) : !monthSolls ? (
          <div className="mt-2 text-sm text-gray-600">Berechne…</div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-[800px] w-full border-separate border-spacing-0 text-sm text-gray-900">
              <thead>
                <tr>
                  <th className="border-b border-gray-200 px-3 py-2 text-left text-xs font-semibold bg-gray-50">
                    Monat
                  </th>
                  <th className="border-b border-gray-200 px-3 py-2 text-right text-xs font-semibold bg-gray-50">
                    Dipl
                  </th>
                  <th className="border-b border-gray-200 px-3 py-2 text-right text-xs font-semibold bg-gray-50">
                    FaGe
                  </th>
                  <th className="border-b border-gray-200 px-3 py-2 text-right text-xs font-semibold bg-gray-50">
                    SRK/AGS
                  </th>
                  <th className="border-b border-gray-200 px-3 py-2 text-right text-xs font-semibold bg-gray-50">
                    HW (ohneSRK)
                  </th>
                  <th className="border-b border-gray-200 px-3 py-2 text-right text-xs font-semibold bg-gray-50">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {MONTHS_DE_SHORT.map((m, idx) => {
                  const r = monthSolls[m];
                  const total = r.dipl + r.fage + r.srk + r.ohneSRK;
                  const rowBg = idx % 2 === 0 ? "bg-white" : "bg-gray-50";
                  return (
                    <tr key={m} className={rowBg}>
                      <td className="border-b border-gray-100 px-3 py-2 text-sm font-medium">{m}</td>
                      <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums">{fmt(r.dipl)}</td>
                      <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums">{fmt(r.fage)}</td>
                      <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums">{fmt(r.srk)}</td>
                      <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums">{fmt(r.ohneSRK)}</td>
                      <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums font-semibold">{fmt(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

