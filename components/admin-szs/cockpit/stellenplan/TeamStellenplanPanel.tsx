"use client";

import * as XLSX from "xlsx";
import { useEffect, useMemo, useState } from "react";

type TeamKey = "A" | "B" | "C";
type RoleKey = "dipl" | "bkm" | "fage" | "srk" | "ohneSRK";

const MONTHS_DE_SHORT = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sept",
  "Okt",
  "Nov",
  "Dez",
] as const;
type MonthKey = (typeof MONTHS_DE_SHORT)[number];

type RoleConfig = {
  zielVerrechenbarkeitPct: number;
  anteilA: number;
  anteilB: number;
  anteilC: number;
  anteilHW: number;
};

type TeamPlan = {
  sourceFileName: string;
  extractedAt: string;
  teams: Record<TeamKey, { name: string }>;
  staffIstFte: Record<TeamKey, { dipl: number; fage: number; ags: number; leitung: number; bkm: number }>;
  staffIstFteByMonth: Record<
    TeamKey,
    {
      dipl: Record<MonthKey, number>;
      fage: Record<MonthKey, number>;
      ags: Record<MonthKey, number>;
      leitung: Record<MonthKey, number>;
      bkm: Record<MonthKey, number>;
    }
  >;
  staffSollFte: Record<TeamKey, { bkm: number }>;
  staffSollFteByMonth: Record<TeamKey, { bkm: Record<MonthKey, number> }>;
  clients: Record<TeamKey, number>;
  klvHours: Record<TeamKey, { A: number; B: number; C: number }>;
};

const LS_KEY = "team-stellenplan-szs-v1";
const MODELL_STORAGE_KEY = "modell-form-data";
const STUNDENBUDGET_CACHE_KEY = "stundenbudget-2026-v1";

const NET_HOURS_PER_FTE_YEAR_DEFAULT = 1831.56;
const MIN_DIPL_FTE_PER_TEAM = 1.4; // Tagesverantwortung

const DEFAULT_ROLE_CONFIG: Record<RoleKey, RoleConfig> = {
  dipl: { zielVerrechenbarkeitPct: 65, anteilA: 30, anteilB: 40, anteilC: 30, anteilHW: 0 },
  bkm: { zielVerrechenbarkeitPct: 65, anteilA: 70, anteilB: 30, anteilC: 0, anteilHW: 0 },
  fage: { zielVerrechenbarkeitPct: 75, anteilA: 0, anteilB: 70, anteilC: 30, anteilHW: 0 },
  srk: { zielVerrechenbarkeitPct: 85, anteilA: 0, anteilB: 0, anteilC: 70, anteilHW: 30 },
  ohneSRK: { zielVerrechenbarkeitPct: 90, anteilA: 0, anteilB: 0, anteilC: 0, anteilHW: 100 },
};

function parsePercentToFte(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw / 100;
  const s = String(raw ?? "").trim();
  if (!s) return 0;
  const m = s.match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return 0;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n / 100 : 0;
}

function parseNumberCH(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw ?? "").trim();
  if (!s) return 0;
  const cleaned = s.replace(/\s+/g, "").replace(/'/g, "").replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

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

function emptyMonthMap(): Record<MonthKey, number> {
  return Object.fromEntries(MONTHS_DE_SHORT.map((m) => [m, 0])) as any;
}

type Stundenbudget = {
  year: number;
  klvA: { total: number; months?: Record<string, number> };
  klvB: { total: number; months?: Record<string, number> };
  klvC: { total: number; months?: Record<string, number> };
  hw: { total: number; months?: Record<string, number> };
};

function monthHoursFromSeries(series: { months?: Record<string, number> } | undefined, month: MonthKey): number {
  const months = series?.months;
  if (!months) return 0;
  for (const [k, v] of Object.entries(months)) {
    const mk = normalizeMonthKey(k);
    if (mk === month) return Number.isFinite(Number(v)) ? Number(v) : 0;
  }
  return 0;
}

function loadModell(): {
  netHoursPerFteYear: number;
  netHoursPerFteMonth: Record<MonthKey, number>;
  roles: Record<RoleKey, RoleConfig>;
  costWeights: Record<RoleKey, number>;
} {
  try {
    const raw = localStorage.getItem(MODELL_STORAGE_KEY);
    if (!raw) throw new Error("no modell");
    const parsed = JSON.parse(raw) as any;

    // net hours/year as in Modell (sum months of SOLL - Ferien - Krank - Weiterbildung)
    let netHours = NET_HOURS_PER_FTE_YEAR_DEFAULT;
    const netHoursPerFteMonth: Record<MonthKey, number> = Object.fromEntries(
      MONTHS_DE_SHORT.map((m) => [m, NET_HOURS_PER_FTE_YEAR_DEFAULT / 12])
    ) as any;
    try {
      const soll = parsed?.sollArbeitszeitProJahr?.["SOLL h in ZH"];
      const ferien = parsed?.sollArbeitszeitProJahr?.["Ferien"];
      const krank = parsed?.sollArbeitszeitProJahr?.["Krank"];
      const wb = parsed?.sollArbeitszeitProJahr?.["Weiterbildung"];
      const months = soll ? Object.keys(soll) : [];
      if (months.length) {
        const num = (v: unknown) => {
          const s = String(v ?? "").replace(",", ".").trim();
          const n = Number(s);
          return Number.isFinite(n) ? n : 0;
        };
        netHours = months.reduce((acc: number, m: string) => {
          const mk = normalizeMonthKey(m);
          const v = num(soll[m]) - num(ferien?.[m]) - num(krank?.[m]) - num(wb?.[m]);
          if (mk) netHoursPerFteMonth[mk] = v;
          return acc + v;
        }, 0);
      }
    } catch {
      // fallback
    }

    const get = (role: RoleKey, key: string) => Number(parsed?.[role]?.[key] ?? NaN);
    const getCost = (key: RoleKey) => {
      const n = Number(parsed?.vollkostenProFte?.[key] ?? NaN);
      return Number.isFinite(n) && n > 0 ? n : null;
    };

    // Normierung (Team-Stellenplan): BKM soll gemäss Vorgabe immer 70/30/0/0 sein.
    const normalizeBkm = true;
    const roles: Record<RoleKey, RoleConfig> = {
      dipl: {
        zielVerrechenbarkeitPct: get("dipl", "zielVerrechenbarkeit") || DEFAULT_ROLE_CONFIG.dipl.zielVerrechenbarkeitPct,
        anteilA: get("dipl", "anteilKLV_A") || DEFAULT_ROLE_CONFIG.dipl.anteilA,
        anteilB: get("dipl", "anteilKLV_B") || DEFAULT_ROLE_CONFIG.dipl.anteilB,
        anteilC: get("dipl", "anteilKLV_C") || DEFAULT_ROLE_CONFIG.dipl.anteilC,
        anteilHW: get("dipl", "anteilHauswirtschaft") || DEFAULT_ROLE_CONFIG.dipl.anteilHW,
      },
      bkm: {
        zielVerrechenbarkeitPct: get("bkm", "zielVerrechenbarkeit") || DEFAULT_ROLE_CONFIG.bkm.zielVerrechenbarkeitPct,
        anteilA: normalizeBkm ? 70 : (get("bkm", "anteilKLV_A") || DEFAULT_ROLE_CONFIG.bkm.anteilA),
        anteilB: normalizeBkm ? 30 : (get("bkm", "anteilKLV_B") || DEFAULT_ROLE_CONFIG.bkm.anteilB),
        anteilC: normalizeBkm ? 0 : (get("bkm", "anteilKLV_C") || DEFAULT_ROLE_CONFIG.bkm.anteilC),
        anteilHW: normalizeBkm ? 0 : (get("bkm", "anteilHauswirtschaft") || DEFAULT_ROLE_CONFIG.bkm.anteilHW),
      },
      fage: {
        zielVerrechenbarkeitPct: get("fage", "zielVerrechenbarkeit") || DEFAULT_ROLE_CONFIG.fage.zielVerrechenbarkeitPct,
        anteilA: get("fage", "anteilKLV_A") || DEFAULT_ROLE_CONFIG.fage.anteilA,
        anteilB: get("fage", "anteilKLV_B") || DEFAULT_ROLE_CONFIG.fage.anteilB,
        anteilC: get("fage", "anteilKLV_C") || DEFAULT_ROLE_CONFIG.fage.anteilC,
        anteilHW: get("fage", "anteilHauswirtschaft") || DEFAULT_ROLE_CONFIG.fage.anteilHW,
      },
      srk: {
        zielVerrechenbarkeitPct: get("srk", "zielVerrechenbarkeit") || DEFAULT_ROLE_CONFIG.srk.zielVerrechenbarkeitPct,
        anteilA: get("srk", "anteilKLV_A") || DEFAULT_ROLE_CONFIG.srk.anteilA,
        anteilB: get("srk", "anteilKLV_B") || DEFAULT_ROLE_CONFIG.srk.anteilB,
        anteilC: get("srk", "anteilKLV_C") || DEFAULT_ROLE_CONFIG.srk.anteilC,
        anteilHW: get("srk", "anteilHauswirtschaft") || DEFAULT_ROLE_CONFIG.srk.anteilHW,
      },
      ohneSRK: {
        zielVerrechenbarkeitPct: get("ohneSRK", "zielVerrechenbarkeit") || DEFAULT_ROLE_CONFIG.ohneSRK.zielVerrechenbarkeitPct,
        anteilA: get("ohneSRK", "anteilKLV_A") || DEFAULT_ROLE_CONFIG.ohneSRK.anteilA,
        anteilB: get("ohneSRK", "anteilKLV_B") || DEFAULT_ROLE_CONFIG.ohneSRK.anteilB,
        anteilC: get("ohneSRK", "anteilKLV_C") || DEFAULT_ROLE_CONFIG.ohneSRK.anteilC,
        anteilHW: get("ohneSRK", "anteilHauswirtschaft") || DEFAULT_ROLE_CONFIG.ohneSRK.anteilHW,
      },
    };

    for (const m of MONTHS_DE_SHORT) {
      if (!netHoursPerFteMonth[m] || netHoursPerFteMonth[m] < 1) netHoursPerFteMonth[m] = netHours / 12;
    }

    const diplCost = getCost("dipl") ?? 100;
    const costWeights: Record<RoleKey, number> = {
      dipl: diplCost,
      bkm: getCost("bkm") ?? diplCost,
      fage: getCost("fage") ?? 3,
      srk: getCost("srk") ?? 2,
      ohneSRK: getCost("ohneSRK") ?? 1,
    };

    return { netHoursPerFteYear: netHours, netHoursPerFteMonth, roles, costWeights };
  } catch {
    return {
      netHoursPerFteYear: NET_HOURS_PER_FTE_YEAR_DEFAULT,
      netHoursPerFteMonth: Object.fromEntries(
        MONTHS_DE_SHORT.map((m) => [m, NET_HOURS_PER_FTE_YEAR_DEFAULT / 12])
      ) as any,
      roles: DEFAULT_ROLE_CONFIG,
      costWeights: { dipl: 100, bkm: 100, fage: 3, srk: 2, ohneSRK: 1 },
    };
  }
}

function solveRequiredFteByRole(
  demand: { A: number; B: number; C: number; HW: number },
  netHoursPerFteYear: number,
  roles: Record<RoleKey, RoleConfig>,
  minBkmFte: number,
  minDiplFte: number,
  costWeights: Record<RoleKey, number>
): Record<RoleKey, number> | null {
  const roleOrder: RoleKey[] = ["dipl", "bkm", "fage", "srk", "ohneSRK"];

  const capPerFte = (role: RoleKey, type: "A" | "B" | "C" | "HW") => {
    const r = roles[role];
    const bill = (r.zielVerrechenbarkeitPct || 0) / 100;
    // Business rule: nur Dipl und BKM dürfen KLV A erbringen
    if (type === "A" && !(role === "dipl" || role === "bkm")) return 0;
    const share =
      type === "A" ? (r.anteilA || 0) / 100 :
      type === "B" ? (r.anteilB || 0) / 100 :
      type === "C" ? (r.anteilC || 0) / 100 :
      (r.anteilHW || 0) / 100;
    return netHoursPerFteYear * bill * share;
  };

  const minBkm = Math.max(0, minBkmFte || 0);
  const demandAfterMinBkm = {
    A: Math.max(0, demand.A - minBkm * capPerFte("bkm", "A")),
    B: Math.max(0, demand.B - minBkm * capPerFte("bkm", "B")),
    C: Math.max(0, demand.C - minBkm * capPerFte("bkm", "C")),
    HW: Math.max(0, demand.HW - minBkm * capPerFte("bkm", "HW")),
  };

  const minDipl = Math.max(0, minDiplFte || 0);
  const demandAfterMinFixed = {
    A: Math.max(0, demandAfterMinBkm.A - minDipl * capPerFte("dipl", "A")),
    B: Math.max(0, demandAfterMinBkm.B - minDipl * capPerFte("dipl", "B")),
    C: Math.max(0, demandAfterMinBkm.C - minDipl * capPerFte("dipl", "C")),
    HW: Math.max(0, demandAfterMinBkm.HW - minDipl * capPerFte("dipl", "HW")),
  };

  // HW explizit über ohneSRK planen (wie im Stellenplan)
  const hwCapOhne = capPerFte("ohneSRK", "HW");
  const minOhneForHw =
    demandAfterMinFixed.HW > 0 && hwCapOhne > 0 ? Math.max(0, demandAfterMinFixed.HW / hwCapOhne) : 0;
  const demandForLp = minOhneForHw > 0 ? { ...demandAfterMinFixed, HW: 0 } : demandAfterMinFixed;

  const coeffsByType = (type: "A" | "B" | "C" | "HW") =>
    roleOrder.map((r) => capPerFte(r, type)) as [number, number, number, number, number];

  const demandConstraints = [
    { rhs: demandForLp.A, coeffs: coeffsByType("A") },
    { rhs: demandForLp.B, coeffs: coeffsByType("B") },
    { rhs: demandForLp.C, coeffs: coeffsByType("C") },
    ...(demandForLp.HW > 0 ? [{ rhs: demandForLp.HW, coeffs: coeffsByType("HW") }] : []),
  ].filter((c) => c.rhs > 0);

  if (demandConstraints.length === 0) {
    return minOhneForHw > 0 || minBkm > 0 || minDipl > 0
      ? { dipl: minDipl, bkm: minBkm, fage: 0, srk: 0, ohneSRK: minOhneForHw }
      : null;
  }

  type Constraint =
    | { kind: "demand"; coeffs: [number, number, number, number, number]; rhs: number }
    | { kind: "nonneg"; varIdx: 0 | 1 | 2 | 3 | 4 };

  const constraints: Constraint[] = [
    ...demandConstraints.map((c) => ({ kind: "demand" as const, coeffs: c.coeffs, rhs: c.rhs })),
    { kind: "nonneg" as const, varIdx: 0 },
    { kind: "nonneg" as const, varIdx: 1 },
    { kind: "nonneg" as const, varIdx: 2 },
    { kind: "nonneg" as const, varIdx: 3 },
    { kind: "nonneg" as const, varIdx: 4 },
  ];

  const eps = 1e-7;
  const solve5 = (A: number[][], b: number[]) => {
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
    if (x.some((v) => v < -1e-6)) return false;
    for (const c of demandConstraints) {
      if (dot(c.coeffs, x) + 1e-6 < c.rhs) return false;
    }
    return true;
  };

  const MODE_WEIGHTS: [number, number, number, number, number] = [
    costWeights.dipl,
    costWeights.bkm,
    costWeights.fage,
    costWeights.srk,
    costWeights.ohneSRK,
  ];
  const scalarObjective = (x: [number, number, number, number, number]) =>
    MODE_WEIGHTS[0] * x[0] + MODE_WEIGHTS[1] * x[1] + MODE_WEIGHTS[2] * x[2] + MODE_WEIGHTS[3] * x[3] + MODE_WEIGHTS[4] * x[4];
  const lexKey = (x: [number, number, number, number, number]) => [
    scalarObjective(x),
    x[0], // Dipl
    x[1], // BKM
    -x[2], // FaGe
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

  let bestX: [number, number, number, number, number] | null = null;
  let bestKey: number[] | null = null;

  const n = constraints.length;
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

  if (!bestX) return { dipl: minDipl, bkm: minBkm, fage: 0, srk: 0, ohneSRK: minOhneForHw };
  return {
    dipl: bestX[0] + minDipl,
    bkm: bestX[1] + minBkm,
    fage: bestX[2],
    srk: bestX[3],
    ohneSRK: bestX[4] + minOhneForHw,
  };
}

function extractTeamPlanFromWorkbook(wb: XLSX.WorkBook, sourceFileName: string): TeamPlan | null {
  const ws = wb.Sheets["Gesamtübersicht"];
  if (!ws) return null;
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "", raw: false });

  const teams: TeamPlan["teams"] = {
    A: { name: "Team A" },
    B: { name: "Team B" },
    C: { name: "Team C" },
  };

  // header row contains team names in __EMPTY_1..__EMPTY_3
  const header = rows[0] ?? {};
  const tA = String(header.__EMPTY_1 ?? "").trim();
  const tB = String(header.__EMPTY_2 ?? "").trim();
  const tC = String(header.__EMPTY_3 ?? "").trim();
  if (tA) teams.A.name = tA;
  if (tB) teams.B.name = tB;
  if (tC) teams.C.name = tC;

  const staffIstFte: TeamPlan["staffIstFte"] = {
    A: { dipl: 0, fage: 0, ags: 0, leitung: 0, bkm: 0 },
    B: { dipl: 0, fage: 0, ags: 0, leitung: 0, bkm: 0 },
    C: { dipl: 0, fage: 0, ags: 0, leitung: 0, bkm: 0 },
  };

  const staffIstFteByMonth: TeamPlan["staffIstFteByMonth"] = {
    A: { dipl: emptyMonthMap(), fage: emptyMonthMap(), ags: emptyMonthMap(), leitung: emptyMonthMap(), bkm: emptyMonthMap() },
    B: { dipl: emptyMonthMap(), fage: emptyMonthMap(), ags: emptyMonthMap(), leitung: emptyMonthMap(), bkm: emptyMonthMap() },
    C: { dipl: emptyMonthMap(), fage: emptyMonthMap(), ags: emptyMonthMap(), leitung: emptyMonthMap(), bkm: emptyMonthMap() },
  };

  const staffSollFte: TeamPlan["staffSollFte"] = {
    A: { bkm: 0 },
    B: { bkm: 0 },
    C: { bkm: 0 },
  };

  const staffSollFteByMonth: TeamPlan["staffSollFteByMonth"] = {
    A: { bkm: emptyMonthMap() },
    B: { bkm: emptyMonthMap() },
    C: { bkm: emptyMonthMap() },
  };

  const clients: TeamPlan["clients"] = { A: 0, B: 0, C: 0 };

  const klvHours: TeamPlan["klvHours"] = {
    A: { A: 0, B: 0, C: 0 },
    B: { A: 0, B: 0, C: 0 },
    C: { A: 0, B: 0, C: 0 },
  };

  const putStaff = (role: keyof TeamPlan["staffIstFte"]["A"], r: any) => {
    staffIstFte.A[role] = parsePercentToFte(r.__EMPTY_1);
    staffIstFte.B[role] = parsePercentToFte(r.__EMPTY_2);
    staffIstFte.C[role] = parsePercentToFte(r.__EMPTY_3);
  };

  for (const r of rows) {
    const label = String(r.__EMPTY ?? "").trim();
    if (label === "Total Leitung Ist") putStaff("leitung", r);
    if (label === "Total BKM Ist") putStaff("bkm", r);
    if (label === "Total Dipl Ist") putStaff("dipl", r);
    if (label === "Total FaGe Ist") putStaff("fage", r);
    if (label === "Total AGS Ist") putStaff("ags", r);

    if (label === "Total BKM Soll") {
      staffSollFte.A.bkm = parsePercentToFte(r.__EMPTY_1);
      staffSollFte.B.bkm = parsePercentToFte(r.__EMPTY_2);
      staffSollFte.C.bkm = parsePercentToFte(r.__EMPTY_3);
    }

    if (label === "KLV A") {
      klvHours.A.A = parseNumberCH(r.__EMPTY_1);
      klvHours.B.A = parseNumberCH(r.__EMPTY_2);
      klvHours.C.A = parseNumberCH(r.__EMPTY_3);
    }
    if (label === "KLV B") {
      klvHours.A.B = parseNumberCH(r.__EMPTY_1);
      klvHours.B.B = parseNumberCH(r.__EMPTY_2);
      klvHours.C.B = parseNumberCH(r.__EMPTY_3);
    }
    if (label === "KLV C") {
      klvHours.A.C = parseNumberCH(r.__EMPTY_1);
      klvHours.B.C = parseNumberCH(r.__EMPTY_2);
      klvHours.C.C = parseNumberCH(r.__EMPTY_3);
    }

    if (label === "Anzahl Klienten") {
      clients.A = parseNumberCH(r.__EMPTY_1);
      clients.B = parseNumberCH(r.__EMPTY_2);
      clients.C = parseNumberCH(r.__EMPTY_3);
    }
  }

  const parseTeamSheetMonthlyTotals = (team: TeamKey, sheetName: string) => {
    const ws = wb.Sheets[sheetName];
    if (!ws) return;
    const rs = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "", raw: false });

    const headerRow = rs.find((r) => Object.values(r).some((v) => String(v ?? "").includes("Jan-26")));
    if (!headerRow) return;

    // Map MonthKey -> column key (__EMPTY_5..__EMPTY_16)
    const monthCol: Partial<Record<MonthKey, string>> = {};
    for (const [k, v] of Object.entries(headerRow)) {
      const mk = normalizeMonthKey(String(v ?? "").split("-")[0] ?? "");
      if (mk) monthCol[mk] = k;
    }

    const fillFromTotalRow = (label: string, target: keyof TeamPlan["staffIstFteByMonth"]["A"]) => {
      const row = rs.find((r) => String(r.__EMPTY ?? "").trim() === label);
      if (!row) return;
      for (const m of MONTHS_DE_SHORT) {
        const col = monthCol[m];
        if (!col) continue;
        staffIstFteByMonth[team][target][m] = parsePercentToFte(row[col]);
      }
    };

    fillFromTotalRow("Total Dipl Ist", "dipl");
    fillFromTotalRow("Total FaGe Ist", "fage");
    fillFromTotalRow("Total AGS Ist", "ags");
    fillFromTotalRow("Total Leitung Ist", "leitung");
    fillFromTotalRow("Total BKM Ist", "bkm");

    const rowBkmSoll = rs.find((r) => String(r.__EMPTY ?? "").trim() === "Total BKM Soll");
    if (rowBkmSoll) {
      for (const m of MONTHS_DE_SHORT) {
        const col = monthCol[m];
        if (!col) continue;
        staffSollFteByMonth[team].bkm[m] = parsePercentToFte(rowBkmSoll[col]);
      }
    }
  };

  // Try to parse monthly totals from Team sheets (for tabs)
  for (const s of wb.SheetNames) {
    if (s.startsWith("Team A")) parseTeamSheetMonthlyTotals("A", s);
    if (s.startsWith("Team B")) parseTeamSheetMonthlyTotals("B", s);
    if (s.startsWith("Team C")) parseTeamSheetMonthlyTotals("C", s);
  }

  return {
    sourceFileName,
    extractedAt: new Date().toISOString(),
    teams,
    staffIstFte,
    staffIstFteByMonth,
    staffSollFte,
    staffSollFteByMonth,
    clients,
    klvHours,
  };
}

function ensureTeamPlanSchema(maybe: any): TeamPlan | null {
  if (!maybe || typeof maybe !== "object") return null;
  const teams: TeamPlan["teams"] = maybe.teams ?? {
    A: { name: "Team A" },
    B: { name: "Team B" },
    C: { name: "Team C" },
  };
  const staffIstFte: TeamPlan["staffIstFte"] = maybe.staffIstFte ?? {
    A: { dipl: 0, fage: 0, ags: 0, leitung: 0, bkm: 0 },
    B: { dipl: 0, fage: 0, ags: 0, leitung: 0, bkm: 0 },
    C: { dipl: 0, fage: 0, ags: 0, leitung: 0, bkm: 0 },
  };
  const klvHours: TeamPlan["klvHours"] = maybe.klvHours ?? {
    A: { A: 0, B: 0, C: 0 },
    B: { A: 0, B: 0, C: 0 },
    C: { A: 0, B: 0, C: 0 },
  };

  const staffSollFte: TeamPlan["staffSollFte"] = maybe.staffSollFte ?? {
    A: { bkm: 0 },
    B: { bkm: 0 },
    C: { bkm: 0 },
  };

  let staffSollFteByMonth: TeamPlan["staffSollFteByMonth"] | undefined = maybe.staffSollFteByMonth;
  if (!staffSollFteByMonth) {
    const fillConst = (team: TeamKey) => {
      const m = emptyMonthMap();
      for (const mm of MONTHS_DE_SHORT) m[mm] = staffSollFte[team].bkm ?? 0;
      return m;
    };
    staffSollFteByMonth = {
      A: { bkm: fillConst("A") },
      B: { bkm: fillConst("B") },
      C: { bkm: fillConst("C") },
    };
  }

  let staffIstFteByMonth: TeamPlan["staffIstFteByMonth"] | undefined = maybe.staffIstFteByMonth;
  if (!staffIstFteByMonth) {
    // Backward compatibility: older cached plans had only yearly totals → assume constant across months.
    const fillConst = (team: TeamKey, key: keyof TeamPlan["staffIstFte"]["A"]) => {
      const m = emptyMonthMap();
      for (const mm of MONTHS_DE_SHORT) m[mm] = staffIstFte[team][key] ?? 0;
      return m;
    };
    staffIstFteByMonth = {
      A: {
        dipl: fillConst("A", "dipl"),
        fage: fillConst("A", "fage"),
        ags: fillConst("A", "ags"),
        leitung: fillConst("A", "leitung"),
        bkm: fillConst("A", "bkm"),
      },
      B: {
        dipl: fillConst("B", "dipl"),
        fage: fillConst("B", "fage"),
        ags: fillConst("B", "ags"),
        leitung: fillConst("B", "leitung"),
        bkm: fillConst("B", "bkm"),
      },
      C: {
        dipl: fillConst("C", "dipl"),
        fage: fillConst("C", "fage"),
        ags: fillConst("C", "ags"),
        leitung: fillConst("C", "leitung"),
        bkm: fillConst("C", "bkm"),
      },
    };
  }

  return {
    sourceFileName: String(maybe.sourceFileName ?? "teamplan.xlsx"),
    extractedAt: String(maybe.extractedAt ?? new Date().toISOString()),
    teams,
    staffIstFte,
    staffIstFteByMonth,
    staffSollFte,
    staffSollFteByMonth,
    clients: maybe.clients ?? { A: 0, B: 0, C: 0 },
    klvHours,
  };
}

export default function TeamStellenplanPanel() {
  const [plan, setPlan] = useState<TeamPlan | null>(null);
  const [activeTeam, setActiveTeam] = useState<TeamKey>("A");
  const [budget, setBudget] = useState<Stundenbudget | null>(null);
  const [planningYear, setPlanningYear] = useState<number>(2026);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const normalized = ensureTeamPlanSchema(parsed);
        if (normalized) setPlan(normalized);
      }
    } catch {
      // ignore
    }
    try {
      const raw = localStorage.getItem(STUNDENBUDGET_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Stundenbudget;
        setBudget(parsed);
        if (parsed?.year) setPlanningYear((prev) => (prev === 2026 ? parsed.year : prev));
      }
    } catch {
      // ignore
    }
  }, []);

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const extracted = extractTeamPlanFromWorkbook(wb, file.name);
    if (!extracted) return;
    setPlan(extracted);
    localStorage.setItem(LS_KEY, JSON.stringify(extracted));
  };

  const modellSoll = useMemo(() => {
    if (!plan) return null;
    const { netHoursPerFteYear, roles, costWeights } = loadModell();
    const baseYear = budget?.year ?? 2026;
    const factor = Math.pow(1.1, planningYear - baseYear);
    const byTeam: Record<TeamKey, Record<RoleKey, number> | null> = {
      A: solveRequiredFteByRole(
        { A: plan.klvHours.A.A * factor, B: plan.klvHours.A.B * factor, C: plan.klvHours.A.C * factor, HW: 0 },
        netHoursPerFteYear,
        roles,
        ((plan.clients.A || 0) * factor) / 30,
        MIN_DIPL_FTE_PER_TEAM,
        costWeights
      ),
      B: solveRequiredFteByRole(
        { A: plan.klvHours.B.A * factor, B: plan.klvHours.B.B * factor, C: plan.klvHours.B.C * factor, HW: 0 },
        netHoursPerFteYear,
        roles,
        ((plan.clients.B || 0) * factor) / 30,
        MIN_DIPL_FTE_PER_TEAM,
        costWeights
      ),
      C: solveRequiredFteByRole(
        { A: plan.klvHours.C.A * factor, B: plan.klvHours.C.B * factor, C: plan.klvHours.C.C * factor, HW: 0 },
        netHoursPerFteYear,
        roles,
        ((plan.clients.C || 0) * factor) / 30,
        MIN_DIPL_FTE_PER_TEAM,
        costWeights
      ),
    };
    return byTeam;
  }, [plan, budget?.year, planningYear]);

  const modellSollByMonth = useMemo(() => {
    if (!plan) return null;
    const { netHoursPerFteMonth, roles, costWeights } = loadModell();
    const baseYear = budget?.year ?? 2026;
    const factor = Math.pow(1.1, planningYear - baseYear);

    const totals = {
      A: { A: plan.klvHours.A.A, B: plan.klvHours.A.B, C: plan.klvHours.A.C },
      B: { A: plan.klvHours.B.A, B: plan.klvHours.B.B, C: plan.klvHours.B.C },
      C: { A: plan.klvHours.C.A, B: plan.klvHours.C.B, C: plan.klvHours.C.C },
    };
    const sumTeams = {
      A: totals.A.A + totals.B.A + totals.C.A,
      B: totals.A.B + totals.B.B + totals.C.B,
      C: totals.A.C + totals.B.C + totals.C.C,
    };

    const out: Record<TeamKey, Record<MonthKey, Record<RoleKey, number> | null>> = {
      A: {} as any,
      B: {} as any,
      C: {} as any,
    };

    for (const m of MONTHS_DE_SHORT) {
      const globalA = budget ? monthHoursFromSeries(budget.klvA, m) * factor : 0;
      const globalB = budget ? monthHoursFromSeries(budget.klvB, m) * factor : 0;
      const globalC = budget ? monthHoursFromSeries(budget.klvC, m) * factor : 0;
      const useGlobal = budget && (globalA + globalB + globalC) > 0;

      for (const t of ["A", "B", "C"] as const) {
        const shareA = sumTeams.A > 0 ? totals[t].A / sumTeams.A : 0;
        const shareB = sumTeams.B > 0 ? totals[t].B / sumTeams.B : 0;
        const shareC = sumTeams.C > 0 ? totals[t].C / sumTeams.C : 0;
        const demand = {
          A: useGlobal ? globalA * shareA : (totals[t].A * factor) / 12,
          B: useGlobal ? globalB * shareB : (totals[t].B * factor) / 12,
          C: useGlobal ? globalC * shareC : (totals[t].C * factor) / 12,
          HW: 0,
        };
        out[t][m] = solveRequiredFteByRole(
          demand,
          netHoursPerFteMonth[m],
          roles,
          ((plan.clients[t] || 0) * factor) / 30,
          MIN_DIPL_FTE_PER_TEAM,
          costWeights
        );
      }
    }

    return out;
  }, [plan, budget, planningYear]);

  const fmt = (n: number) =>
    new Intl.NumberFormat("de-CH", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
  const fmtSigned = (n: number) => {
    const sign = n > 0 ? "+" : "";
    return `${sign}${fmt(n)}`;
  };
  const deltaColor = (d: number | null) => {
    if (d === null) return "text-gray-500";
    if (d < 0) return "text-red-700";
    if (d > 0) return "text-emerald-700";
    return "text-gray-500";
  };

  return (
    <div className="p-4 border-b border-gray-200">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">Team‑Stellenplan (SZS)</div>
          <div className="text-xs text-gray-600 mt-1">
            Import aus <span className="font-mono">SM_Einteilung_Teams_SZS…xlsx</span> (Gesamtübersicht)
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

      {!plan ? (
        <div className="mt-3 text-sm text-gray-600">Noch kein Team‑Stellenplan importiert.</div>
      ) : (
        <div className="mt-4">
          <div className="text-xs text-gray-500 mb-2">
            Quelle: <span className="font-mono">{plan.sourceFileName}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full border-separate border-spacing-0 text-sm text-gray-900">
              <thead>
                <tr>
                  <th className="border-b border-gray-200 px-3 py-2 text-left text-xs font-semibold bg-gray-50">
                    Berufsgruppe
                  </th>
                  {(["A", "B", "C"] as const).map((t) => (
                    <th
                      key={t}
                      colSpan={3}
                      className="border-b border-gray-200 px-3 py-2 text-center text-xs font-semibold bg-gray-50"
                    >
                      {plan.teams[t].name}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="border-b border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-700 bg-gray-50">
                    &nbsp;
                  </th>
                  {(["A", "B", "C"] as const).flatMap((t) => [
                    <th key={`${t}-ist`} className="border-b border-gray-200 px-3 py-2 text-right text-xs font-medium text-gray-700 bg-gray-50">
                      IST (FTE)
                    </th>,
                    <th key={`${t}-soll`} className="border-b border-gray-200 px-3 py-2 text-right text-xs font-medium text-gray-700 bg-gray-50">
                      SOLL (Modell {planningYear})
                    </th>,
                    <th key={`${t}-delta`} className="border-b border-gray-200 px-3 py-2 text-right text-xs font-medium text-gray-700 bg-gray-50">
                      Δ
                    </th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    { label: "Dipl (ohne Fallführung)", istKey: "dipl" as const, sollKey: "dipl" as const },
                    { label: "FaGe", istKey: "fage" as const, sollKey: "fage" as const },
                    { label: "SRK/AGS", istKey: "ags" as const, sollKey: "srk" as const },
                    { label: "Leitung", istKey: "leitung" as const, sollKey: null },
                    { label: "BKM", istKey: "bkm" as const, sollKey: "bkm" as const },
                  ] as const
                ).map((row, idx) => {
                  const bg = idx % 2 === 0 ? "bg-white" : "bg-gray-50";
                  return (
                    <tr key={row.label} className={bg}>
                      <td className="border-b border-gray-100 px-3 py-2 text-sm font-medium">
                        {row.label}
                      </td>
                      {(["A", "B", "C"] as const).flatMap((t) => {
                        const ist = plan.staffIstFte[t][row.istKey];
                        const soll =
                          row.sollKey ? (modellSoll?.[t]?.[row.sollKey] ?? 0) : null;
                        const delta = soll === null ? null : ist - soll;
                        return [
                          <td key={`${row.label}-${t}-ist`} className="border-b border-gray-100 px-3 py-2 text-right tabular-nums">
                            {fmt(ist)}
                          </td>,
                          <td key={`${row.label}-${t}-soll`} className="border-b border-gray-100 px-3 py-2 text-right tabular-nums">
                            {soll === null ? "—" : fmt(soll)}
                          </td>,
                          <td key={`${row.label}-${t}-delta`} className="border-b border-gray-100 px-3 py-2 text-right tabular-nums">
                            <span className={deltaColor(delta)}>{delta === null ? "—" : fmt(delta)}</span>
                          </td>,
                        ];
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-gray-500">
            Hinweis: SOLL (Modell {planningYear}) wird hier pro Team aus den KLV‑Stunden (A/B/C) der Gesamtübersicht berechnet (HW=0, da im File nicht enthalten) · +10% p.a. (inkl. Klientenwachstum → BKM‑Mindestbedarf) · Mindest‑Dipl pro Team: {MIN_DIPL_FTE_PER_TEAM.toFixed(1)} FTE.
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-gray-900">Teams (Monatsansicht)</div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                {budget ? (
                  <>
                    <span className="text-gray-500">Planjahr:</span>
                    <select
                      className="px-2 py-1 rounded-md border border-gray-200 bg-white text-gray-700"
                      value={planningYear}
                      onChange={(e) => setPlanningYear(Number(e.target.value))}
                    >
                      {Array.from({ length: 6 }, (_, i) => budget.year + i).map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </>
                ) : null}
                {budget ? (
                  <span>
                    Monats‑SOLL basiert auf Stundenbudget‑Monatswerten × Team‑Anteil (aus KLV A/B/C in Excel) · +10% p.a.
                  </span>
                ) : (
                  <span>
                    Kein Stundenbudget gefunden → Monats‑SOLL wird aus Team‑Jahrestotalen gleichmässig auf 12 Monate verteilt · +10% p.a.
                  </span>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {(["A", "B", "C"] as const).map((t) => {
                const active = activeTeam === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setActiveTeam(t)}
                    className={`px-3 py-2 rounded-md text-sm border transition ${
                      active
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {plan.teams[t].name}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="min-w-[1200px] w-full border-separate border-spacing-0 text-sm text-gray-900">
                <thead>
                  <tr>
                    <th className="border-b border-gray-200 px-3 py-2 text-left text-xs font-semibold bg-gray-50">
                      Monat
                    </th>
                    <th
                      colSpan={5}
                      className="border-b border-gray-200 px-3 py-2 text-center text-xs font-semibold bg-emerald-50 text-emerald-900"
                    >
                      IST (FTE)
                    </th>
                    <th
                      colSpan={5}
                      className="border-b border-gray-200 px-3 py-2 text-center text-xs font-semibold bg-purple-50 text-purple-900"
                    >
                      SOLL (Modell‑FTE)
                    </th>
                    <th className="border-b border-gray-200 px-3 py-2 text-right text-xs font-semibold bg-gray-50">
                      Δ Total
                    </th>
                  </tr>
                  <tr>
                    <th className="border-b border-gray-200 px-3 py-2 text-left text-xs font-medium bg-gray-50 text-gray-700">
                      &nbsp;
                    </th>
                    <th className="border-b border-gray-200 px-3 py-2 text-right text-xs font-medium bg-emerald-50 text-emerald-900">
                      Dipl
                    </th>
                    <th className="border-b border-gray-200 px-3 py-2 text-right text-xs font-medium bg-emerald-50 text-emerald-900">
                      FaGe
                    </th>
                    <th className="border-b border-gray-200 px-3 py-2 text-right text-xs font-medium bg-emerald-50 text-emerald-900">
                      SRK/AGS
                    </th>
                    <th className="border-b border-gray-200 px-3 py-2 text-right text-xs font-medium bg-emerald-50 text-emerald-900">
                      BKM
                    </th>
                    <th className="border-b border-gray-200 px-3 py-2 text-right text-xs font-medium bg-emerald-50 text-emerald-900">
                      Total
                    </th>

                    <th className="border-b border-gray-200 px-3 py-2 text-right text-xs font-medium bg-purple-50 text-purple-900">
                      Dipl
                    </th>
                    <th className="border-b border-gray-200 px-3 py-2 text-right text-xs font-medium bg-purple-50 text-purple-900">
                      FaGe
                    </th>
                    <th className="border-b border-gray-200 px-3 py-2 text-right text-xs font-medium bg-purple-50 text-purple-900">
                      SRK/AGS
                    </th>
                    <th className="border-b border-gray-200 px-3 py-2 text-right text-xs font-medium bg-purple-50 text-purple-900">
                      BKM
                    </th>
                    <th className="border-b border-gray-200 px-3 py-2 text-right text-xs font-medium bg-purple-50 text-purple-900">
                      Total
                    </th>

                    <th className="border-b border-gray-200 px-3 py-2 text-right text-xs font-medium bg-gray-50 text-gray-700">
                      IST−SOLL
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {MONTHS_DE_SHORT.map((m, idx) => {
                    const bg = idx % 2 === 0 ? "bg-white" : "bg-gray-50";
                    const istDipl = plan.staffIstFteByMonth[activeTeam].dipl[m] ?? 0;
                    const istFage = plan.staffIstFteByMonth[activeTeam].fage[m] ?? 0;
                    const istAgs = plan.staffIstFteByMonth[activeTeam].ags[m] ?? 0;
                    const istBkm = plan.staffIstFteByMonth[activeTeam].bkm[m] ?? 0;
                    const istTotal = istDipl + istFage + istAgs + istBkm;

                    const sollRow = modellSollByMonth?.[activeTeam]?.[m] ?? null;
                    const sollDipl = sollRow?.dipl ?? null;
                    const sollFage = sollRow?.fage ?? null;
                    const sollSrk = sollRow?.srk ?? null;
                    const sollBkm = sollRow?.bkm ?? null;
                    const deltaDipl = sollDipl === null ? null : Math.round((istDipl - sollDipl) * 100) / 100;
                    const deltaFage = sollFage === null ? null : Math.round((istFage - sollFage) * 100) / 100;
                    const deltaSrk = sollSrk === null ? null : Math.round((istAgs - sollSrk) * 100) / 100;
                    const deltaBkm = sollBkm === null ? null : Math.round((istBkm - sollBkm) * 100) / 100;
                    const sollTotal =
                      sollRow === null
                        ? null
                        : (sollDipl ?? 0) +
                          (sollFage ?? 0) +
                          (sollSrk ?? 0) +
                          (sollRow.ohneSRK ?? 0) +
                          (sollBkm ?? 0);
                    const deltaTotal =
                      sollTotal === null ? null : Math.round((istTotal - sollTotal) * 100) / 100;

                    return (
                      <tr key={m} className={bg}>
                        <td className="border-b border-gray-100 px-3 py-2 text-sm font-medium">{m}</td>

                        <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums bg-emerald-50">
                          {fmt(istDipl)}
                        </td>
                        <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums bg-emerald-50">
                          {fmt(istFage)}
                        </td>
                        <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums bg-emerald-50">
                          {fmt(istAgs)}
                        </td>
                        <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums font-semibold bg-emerald-50">
                          {fmt(istBkm)}
                        </td>
                        <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums font-semibold bg-emerald-50">
                          {fmt(istTotal)}
                        </td>

                        <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums bg-purple-50">
                          {sollDipl === null ? (
                            "—"
                          ) : (
                            <span className="whitespace-nowrap">
                              {fmt(sollDipl)}{" "}
                              <span className={deltaColor(deltaDipl)}>
                                ({deltaDipl === null ? "—" : fmtSigned(deltaDipl)})
                              </span>
                            </span>
                          )}
                        </td>
                        <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums bg-purple-50">
                          {sollFage === null ? (
                            "—"
                          ) : (
                            <span className="whitespace-nowrap">
                              {fmt(sollFage)}{" "}
                              <span className={deltaColor(deltaFage)}>
                                ({deltaFage === null ? "—" : fmtSigned(deltaFage)})
                              </span>
                            </span>
                          )}
                        </td>
                        <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums bg-purple-50">
                          {sollSrk === null ? (
                            "—"
                          ) : (
                            <span className="whitespace-nowrap">
                              {fmt(sollSrk)}{" "}
                              <span className={deltaColor(deltaSrk)}>
                                ({deltaSrk === null ? "—" : fmtSigned(deltaSrk)})
                              </span>
                            </span>
                          )}
                        </td>
                        <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums bg-purple-50">
                          <span className="whitespace-nowrap">
                            {fmt(sollBkm)}{" "}
                            <span className={deltaColor(deltaBkm)}>({fmtSigned(deltaBkm)})</span>
                          </span>
                        </td>
                        <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums font-semibold bg-purple-50">
                          {sollTotal === null ? "—" : fmt(sollTotal)}
                        </td>

                        <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums font-semibold">
                          <span className={deltaColor(deltaTotal)}>
                            {deltaTotal === null ? "—" : fmt(deltaTotal)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

