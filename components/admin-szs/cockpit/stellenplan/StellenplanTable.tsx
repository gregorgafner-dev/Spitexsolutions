"use client";

import { useEffect, useMemo, useState } from "react";

type Person = {
  beschaeftigungsgrad?: string;
  funktion?: string;
  abteilung?: string;
  abtNr?: string;
};

type Stundenbudget = {
  year: number;
  klvA: { total: number; months?: Record<string, number> };
  klvB: { total: number; months?: Record<string, number> };
  klvC: { total: number; months?: Record<string, number> };
  hw: { total: number; months?: Record<string, number> };
};

type StellenplanRow = {
  bereich: string;
  kostenstelle: string;
  funktionsgruppe: string;
  stellenbezeichnung: string;
  // Budget/HR Werte sind noch nicht aus der Personalliste ableitbar → optional/leer
  sollStellen2026: number | null;
  lohnBudget2026: number | null;
  istStellenKum2026: number | null; // IST aus Personalliste (FTA)
  bruttoLohnHR2026: number | null;
  totalHR2026: number | null;
  stellenplan2026: number | null;
  countPersons: number;
  funktionVarianten: string[];
};

function formatNumber(n: number | null) {
  if (n === null) return "—";
  return new Intl.NumberFormat("de-CH", {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function deltaColorClass(d: number | null) {
  if (d === null) return "text-gray-500";
  if (d < 0) return "text-red-700";
  if (d > 0) return "text-emerald-700";
  return "text-gray-500";
}

function parsePensumToFte(raw: unknown): number {
  // Examples: "60%" -> 0.6 ; 60 -> 0.6
  if (typeof raw === "number" && Number.isFinite(raw)) return raw / 100;
  if (typeof raw !== "string") return 0;
  const s = raw.trim();
  if (!s) return 0;
  const m = s.match(/(\d+(?:[\.,]\d+)?)/);
  if (!m) return 0;
  const pct = Number(m[1].replace(",", "."));
  return Number.isFinite(pct) ? pct / 100 : 0;
}

const PERSON_CACHE_KEY = "personaldaten-upload-cache-v1";
const STUNDENBUDGET_CACHE_KEY = "stundenbudget-2026-v1";
const MODELL_STORAGE_KEY = "modell-form-data";

// Netto-SOLL pro Jahr (Total h geleistet) pro 1.0 FTE (Default gem. Modell-Tabellen-Defaults)
const NET_HOURS_PER_FTE_YEAR_DEFAULT = 1831.56;

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

function monthHoursFromSeries(
  series: { months?: Record<string, number> } | undefined,
  month: MonthKey
): number {
  const months = series?.months;
  if (!months) return 0;
  for (const [k, v] of Object.entries(months)) {
    const mk = normalizeMonthKey(k);
    if (mk === month) return Number.isFinite(Number(v)) ? Number(v) : 0;
  }
  return 0;
}

type RoleKey = "dipl" | "bkm" | "fage" | "srk" | "ohneSRK";
type RoleConfig = {
  zielVerrechenbarkeitPct: number;
  anteilA: number;
  anteilB: number;
  anteilC: number;
  anteilHW: number;
};

const DEFAULT_ROLE_CONFIG: Record<RoleKey, RoleConfig> = {
  dipl: { zielVerrechenbarkeitPct: 65, anteilA: 30, anteilB: 40, anteilC: 30, anteilHW: 0 },
  bkm: { zielVerrechenbarkeitPct: 65, anteilA: 70, anteilB: 30, anteilC: 0, anteilHW: 0 },
  fage: { zielVerrechenbarkeitPct: 75, anteilA: 0, anteilB: 70, anteilC: 30, anteilHW: 0 },
  srk: { zielVerrechenbarkeitPct: 85, anteilA: 0, anteilB: 0, anteilC: 70, anteilHW: 30 },
  ohneSRK: { zielVerrechenbarkeitPct: 90, anteilA: 0, anteilB: 0, anteilC: 0, anteilHW: 100 },
};

function loadRoleConfigFromModell(): {
  netHoursPerFteYear: number;
  netHoursPerFteMonth: Record<MonthKey, number>;
  roles: Record<RoleKey, RoleConfig>;
  costWeights: Record<RoleKey, number>;
} {
  try {
    const raw = localStorage.getItem(MODELL_STORAGE_KEY);
    if (!raw)
      return {
        netHoursPerFteYear: NET_HOURS_PER_FTE_YEAR_DEFAULT,
        netHoursPerFteMonth: Object.fromEntries(MONTHS_DE_SHORT.map((m) => [m, NET_HOURS_PER_FTE_YEAR_DEFAULT / 12])) as any,
        roles: DEFAULT_ROLE_CONFIG,
        costWeights: { dipl: 100, bkm: 100, fage: 3, srk: 2, ohneSRK: 1 },
      };
    const parsed = JSON.parse(raw) as any;
    // Ableitung wie im Modell: Total h geleistet = SOLL - Ferien - Krank - Weiterbildung (über alle Monate summiert)
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
          const val = num(soll[m]) - num(ferien?.[m]) - num(krank?.[m]) - num(wb?.[m]);
          if (mk) netHoursPerFteMonth[mk] = val;
          return acc + val;
        }, 0);
      }
    } catch {
      // fallback to default
    }
    const get = (role: RoleKey, key: string) => Number(parsed?.[role]?.[key] ?? NaN);
    const getCost = (key: RoleKey) => {
      const n = Number(parsed?.vollkostenProFte?.[key] ?? NaN);
      return Number.isFinite(n) && n > 0 ? n : null;
    };

    // Normierung (Stellenplan): BKM soll gemäss Vorgabe immer 70/30/0/0 sein.
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
    // Guard (e.g. partially saved modell data)
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
      netHoursPerFteMonth: Object.fromEntries(MONTHS_DE_SHORT.map((m) => [m, NET_HOURS_PER_FTE_YEAR_DEFAULT / 12])) as any,
      roles: DEFAULT_ROLE_CONFIG,
      costWeights: { dipl: 100, bkm: 100, fage: 3, srk: 2, ohneSRK: 1 },
    };
  }
}

function computeSollFteByRoleFromBudget(
  demand: { A: number; B: number; C: number; HW: number },
  netHoursPerFteYear: number,
  roles: Record<RoleKey, RoleConfig>,
  costWeights: Record<RoleKey, number>
): Record<RoleKey, number> | null {
  // Portiert aus Modell (vereinfachte, deterministische LP-Lösung)
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

  // Business rule: HW-Leistungen sollen als eigene Rolle (ohneSRK) geplant werden.
  const hwCapOhne = capPerFte("ohneSRK", "HW");
  const minOhneForHw =
    demand.HW > 0 && hwCapOhne > 0 ? Math.max(0, demand.HW / hwCapOhne) : 0;
  const demandForLp = minOhneForHw > 0 ? { ...demand, HW: 0 } : demand;

  const coeffsByType = (type: "A" | "B" | "C" | "HW") =>
    roleOrder.map((r) => capPerFte(r, type)) as [number, number, number, number, number];

  const demandConstraints = [
    { rhs: demandForLp.A, coeffs: coeffsByType("A") },
    { rhs: demandForLp.B, coeffs: coeffsByType("B") },
    { rhs: demandForLp.C, coeffs: coeffsByType("C") },
    ...(demandForLp.HW > 0 ? [{ rhs: demandForLp.HW, coeffs: coeffsByType("HW") }] : []),
  ].filter((c) => c.rhs > 0);

  if (demandConstraints.length === 0) {
    return minOhneForHw > 0 ? { dipl: 0, bkm: 0, fage: 0, srk: 0, ohneSRK: minOhneForHw } : null;
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
  ]; // [dipl, bkm, fage, srk, ohneSRK]
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

  if (!bestX) {
    return minOhneForHw > 0 ? { dipl: 0, bkm: 0, fage: 0, srk: 0, ohneSRK: minOhneForHw } : null;
  }

  return {
    dipl: bestX[0],
    bkm: bestX[1],
    fage: bestX[2],
    srk: bestX[3],
    ohneSRK: bestX[4] + minOhneForHw,
  };
}

function sollFteForGroup(group: string, required: Record<RoleKey, number> | null): number | null {
  if (!required) return null;
  if (group === "Dipl. Pflege HF") return required.dipl;
  if (group === "BKM") return required.bkm;
  if (group === "FaGe") return required.fage;
  if (group === "SRK/AGS") return required.srk;
  if (group === "Hauswirtschaft") return required.ohneSRK;
  return null;
}

type Domain = "pflege" | "hw" | "betreuung" | "support";

function domainForFunktionsgruppe(group: string): Domain {
  if (
    group === "Dipl. Pflege HF" ||
    group === "BKM" ||
    group === "FaGe" ||
    group === "SRK/AGS" ||
    group === "Pflegeexperte/in" ||
    group === "Teamleitung" ||
    group === "Einsatzplaner/in"
  ) {
    return "pflege";
  }
  if (group === "Hauswirtschaft") return "hw";
  if (group === "Betreuung") return "betreuung";
  return "support";
}

function normalizeFunktionsgruppe(raw: string): string {
  const s = raw.trim();
  const l = s.toLowerCase();
  if (!s) return "(ohne Funktion)";
  if (l.includes("bkm")) return "BKM";
  if (l.includes("fage")) return "FaGe";
  if (l.includes("srk") || l.includes("ags")) return "SRK/AGS";
  if (l.includes("einsatzplan")) return "Einsatzplaner/in";
  if (l.includes("planung")) return "Einsatzplaner/in";
  if (l.includes("pflegeexper")) return "Pflegeexperte/in";
  if (l.includes("teamleitung") || (l.includes("leitung") && l.includes("team"))) return "Teamleitung";
  if (l.includes("leitung")) return "Leitung";
  if (l.includes("hauswirtschaft") || /\bhw\b/.test(l)) return "Hauswirtschaft";
  if (l.includes("betreuung")) return "Betreuung";
  // Diplomiert / HF etc.
  if (l.includes("dipl") || l.includes(" hf") || l.includes("pflege hf")) return "Dipl. Pflege HF";
  return s;
}

export default function StellenplanTable() {
  const [rows, setRows] = useState<StellenplanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceHint, setSourceHint] = useState<string>("");
  const [budget, setBudget] = useState<Stundenbudget | null>(null);
  const [planningYear, setPlanningYear] = useState<number>(2026);
  const [selectedDomains, setSelectedDomains] = useState<Set<Domain>>(
    () => new Set<Domain>(["pflege", "hw", "betreuung", "support"])
  );

  useEffect(() => {
    let alive = true;

    async function loadPeople(): Promise<Person[]> {
      // 1) Upload-Cache aus /personaldaten (Browser)
      try {
        const raw = localStorage.getItem(PERSON_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as { people?: Person[] };
          if (parsed?.people?.length) {
            setSourceHint("Quelle: Personaldaten-Upload (Browser)");
            return parsed.people;
          }
        }
      } catch {
        // ignore
      }

      // 2) Fallback: API (wenn Server Zugriff hat)
      try {
        const res = await fetch("/api/szs-admin/cockpit/personaldaten", { cache: "no-store" });
        const json = await res.json();
        if (json && !json.error && Array.isArray(json.people)) {
          setSourceHint("Quelle: /api/szs-admin/cockpit/personaldaten");
          return json.people as Person[];
        }
      } catch {
        // ignore
      }

      setSourceHint(
        "Keine Personaldaten gefunden – bitte unter /personaldaten die Excel hochladen."
      );
      return [];
    }

    (async () => {
      setLoading(true);
      const people = await loadPeople();
      if (!alive) return;

      const map = new Map<string, { row: StellenplanRow; sumFte: number }>();

      for (const p of people) {
        const funktion = String(p.funktion ?? "").trim() || "(ohne Funktion)";
        const funktionsgruppe = normalizeFunktionsgruppe(funktion);
        const bereich = String(p.abteilung ?? "").trim() || "(ohne Abteilung)";
        const abtNr = String(p.abtNr ?? "").trim();
        const kostenstelle = abtNr ? `${abtNr} ${bereich}` : bereich;
        const fte = parsePensumToFte(p.beschaeftigungsgrad);

        // Konsolidierung: innerhalb eines Bereichs nach Funktionsgruppe zusammenfassen
        const key = `${bereich}||${funktionsgruppe}`;
        const existing = map.get(key);
        if (!existing) {
          map.set(key, {
            row: {
              bereich,
              kostenstelle,
              funktionsgruppe,
              stellenbezeichnung: "Total",
              sollStellen2026: null,
              lohnBudget2026: null,
              istStellenKum2026: null,
              bruttoLohnHR2026: null,
              totalHR2026: null,
              stellenplan2026: null,
              countPersons: 1,
              funktionVarianten: [funktion],
            },
            sumFte: fte,
          });
        } else {
          existing.sumFte += fte;
          existing.row.countPersons += 1;
          if (!existing.row.funktionVarianten.includes(funktion)) {
            existing.row.funktionVarianten.push(funktion);
          }
        }
      }

      const nextRows = Array.from(map.values())
        .map(({ row, sumFte }) => ({
          ...row,
          istStellenKum2026: Math.round(sumFte * 100) / 100,
        }))
        .sort((a, b) => {
          if (a.bereich !== b.bereich) return a.bereich.localeCompare(b.bereich, "de");
          return a.funktionsgruppe.localeCompare(b.funktionsgruppe, "de");
        });

      setRows(nextRows);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STUNDENBUDGET_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Stundenbudget;
      if (parsed?.year) {
        setBudget(parsed);
        // Default: an Budgetjahr koppeln (ohne User-Auswahl zu überschreiben)
        setPlanningYear((prev) => (prev === 2026 ? parsed.year : prev));
      }
    } catch {
      // ignore
    }
  }, []);

  const totalIst = useMemo(() => {
    const sum = rows.reduce((acc, r) => acc + (r.istStellenKum2026 ?? 0), 0);
    return Math.round(sum * 100) / 100;
  }, [rows]);

  const soll = useMemo(() => {
    if (!budget) return null;
    const { netHoursPerFteYear, roles, costWeights } = loadRoleConfigFromModell();
    const yearOffset = (planningYear ?? budget.year) - budget.year;
    const factor = Math.pow(1.1, yearOffset);
    return computeSollFteByRoleFromBudget(
      {
        A: budget.klvA.total * factor,
        B: budget.klvB.total * factor,
        C: budget.klvC.total * factor,
        HW: budget.hw.total * factor,
      },
      netHoursPerFteYear,
      roles,
      costWeights
    );
  }, [budget, planningYear]);

  const sollByMonth = useMemo(() => {
    if (!budget) return null;
    const { netHoursPerFteMonth, roles, costWeights } = loadRoleConfigFromModell();
    const yearOffset = (planningYear ?? budget.year) - budget.year;
    const factor = Math.pow(1.1, yearOffset);
    const out: Record<MonthKey, Record<RoleKey, number> | null> = {} as any;
    for (const m of MONTHS_DE_SHORT) {
      const demand = {
        A: monthHoursFromSeries(budget.klvA, m) * factor,
        B: monthHoursFromSeries(budget.klvB, m) * factor,
        C: monthHoursFromSeries(budget.klvC, m) * factor,
        HW: monthHoursFromSeries(budget.hw, m) * factor,
      };
      out[m] = computeSollFteByRoleFromBudget(demand, netHoursPerFteMonth[m], roles, costWeights);
    }
    return out;
  }, [budget, planningYear]);

  const filteredRows = useMemo(() => {
    if (selectedDomains.size === 0) return [];
    return rows.filter((r) => selectedDomains.has(domainForFunktionsgruppe(r.funktionsgruppe)));
  }, [rows, selectedDomains]);

  const totalIstFiltered = useMemo(() => {
    const sum = filteredRows.reduce((acc, r) => acc + (r.istStellenKum2026 ?? 0), 0);
    return Math.round(sum * 100) / 100;
  }, [filteredRows]);

  const setPresetAll = () => {
    setSelectedDomains(new Set<Domain>(["pflege", "hw", "betreuung", "support"]));
  };

  const setPresetPflegeOnly = () => {
    setSelectedDomains(new Set<Domain>(["pflege"]));
  };

  const toggleDomain = (d: Domain) => {
    setSelectedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  };

  return (
    <div className="overflow-x-auto">
      <div className="px-4 py-3 text-xs text-gray-600 border-b border-gray-200 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{loading ? "Lade IST aus Personalliste…" : sourceHint}</span>
          {!loading && rows.length > 0 ? (
            <span className="text-gray-500">
              · Total IST (FTA): {formatNumber(totalIstFiltered)}
              {filteredRows.length !== rows.length ? (
                <span className="text-gray-400">
                  {" "}
                  (gefiltert aus {formatNumber(totalIst)})
                </span>
              ) : null}
            </span>
          ) : null}
          {budget ? (
            <span className="text-gray-500">
              · Stundenbudget {planningYear} (Basis {budget.year}, +10% p.a.): A{" "}
              {(budget.klvA.total * Math.pow(1.1, (planningYear ?? budget.year) - budget.year)).toLocaleString("de-CH")}h, B{" "}
              {(budget.klvB.total * Math.pow(1.1, (planningYear ?? budget.year) - budget.year)).toLocaleString("de-CH")}h, C{" "}
              {(budget.klvC.total * Math.pow(1.1, (planningYear ?? budget.year) - budget.year)).toLocaleString("de-CH")}h, HW{" "}
              {(budget.hw.total * Math.pow(1.1, (planningYear ?? budget.year) - budget.year)).toLocaleString("de-CH")}h
            </span>
          ) : (
            <span className="text-gray-400">
              · Kein Stundenbudget gefunden (Dateneingabe → Stundenbudget)
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
              <span className="mx-1 text-gray-300">|</span>
            </>
          ) : null}
          <span className="text-gray-500">Ansicht:</span>
          <button
            type="button"
            onClick={setPresetAll}
            className="px-2 py-1 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
          >
            Alle
          </button>
          <button
            type="button"
            onClick={setPresetPflegeOnly}
            className="px-2 py-1 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
          >
            Nur Pflege
          </button>

          <span className="mx-1 text-gray-300">|</span>

          {(
            [
              ["pflege", "Pflege"],
              ["hw", "HW"],
              ["betreuung", "Betreuung"],
              ["support", "Support"],
            ] as const
          ).map(([d, label]) => (
            <label key={d} className="inline-flex items-center gap-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selectedDomains.has(d)}
                onChange={() => toggleDomain(d)}
              />
              <span className="text-gray-700">{label}</span>
            </label>
          ))}

          <span className="text-gray-400 ml-1">
            · Zeilen: {filteredRows.length}
          </span>
        </div>
      </div>

      <table className="min-w-[2200px] w-full border-separate border-spacing-0 text-gray-900">
        <thead>
          <tr>
            {/* Stammdaten */}
            <th
              rowSpan={2}
              className="sticky left-0 z-20 bg-white border-b border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-700"
              style={{ minWidth: 200, width: 200 }}
            >
              Bereich
            </th>
            <th
              rowSpan={2}
              className="sticky left-[200px] z-20 bg-white border-b border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-700"
              style={{ minWidth: 220, width: 220 }}
            >
              Kostenstelle
            </th>
            <th
              rowSpan={2}
              className="sticky left-[420px] z-20 bg-white border-b border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-700"
              style={{ minWidth: 220, width: 220 }}
            >
              Funktionsgruppe
            </th>
            <th
              rowSpan={2}
              className="border-b border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-700"
              style={{ minWidth: 260 }}
            >
              Stellenbezeichnung
            </th>

            {/* Gruppenheader */}
            <th
              colSpan={2}
              className="border-b border-gray-200 px-3 py-2 text-center text-xs font-semibold text-gray-900 bg-emerald-200"
            >
              Budget 2026
            </th>
            <th
              colSpan={3}
              className="border-b border-gray-200 px-3 py-2 text-center text-xs font-semibold text-gray-900 bg-yellow-200"
            >
              HR 2026
            </th>
            <th
              colSpan={1}
              className="border-b border-gray-200 px-3 py-2 text-center text-xs font-semibold text-gray-900 bg-orange-200"
            >
              Stellenplan {planningYear}
            </th>
            <th
              colSpan={14}
              className="border-b border-gray-200 px-3 py-2 text-center text-xs font-semibold text-gray-900 bg-purple-200"
            >
              SOLL (Budgetstunden {planningYear})
            </th>
          </tr>

          <tr>
            <th className="border-b border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-800 bg-emerald-100">
              Soll‑Stellen 2026
            </th>
            <th className="border-b border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-800 bg-emerald-100">
              Lohn Budget 2026
            </th>

            <th className="border-b border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-800 bg-yellow-100">
              Ist‑Stellen (kum.) 2026
            </th>
            <th className="border-b border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-800 bg-yellow-100">
              Brutto‑Lohn HR 2026
            </th>
            <th className="border-b border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-800 bg-yellow-100">
              Total HR
            </th>

            <th className="border-b border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-800 bg-orange-100">
              Stellenplan (SOLL‑FTE) {planningYear}
            </th>
            <th className="border-b border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-800 bg-purple-100">
              SOLL‑FTE {planningYear}
            </th>
            <th className="border-b border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-800 bg-purple-100">
              Delta (IST−SOLL)
            </th>
            {MONTHS_DE_SHORT.map((m) => (
              <th
                key={m}
                className="border-b border-gray-200 px-3 py-2 text-right text-xs font-medium text-gray-800 bg-purple-100"
              >
                {m}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="text-sm">
          {filteredRows.map((row, idx) => {
            const rowBg = idx % 2 === 0 ? "bg-white" : "bg-gray-50";
            return (
              <tr
                key={`${row.bereich}-${row.funktionsgruppe}-${idx}`}
                className={rowBg}
              >
                <td
                  className={`sticky left-0 z-10 ${rowBg} border-b border-gray-100 px-3 py-2 whitespace-nowrap`}
                  style={{ minWidth: 200, width: 200 }}
                >
                  {row.bereich}
                </td>
                <td
                  className={`sticky left-[200px] z-10 ${rowBg} border-b border-gray-100 px-3 py-2 whitespace-nowrap`}
                  style={{ minWidth: 220, width: 220 }}
                >
                  {row.kostenstelle}
                </td>
                <td
                  className={`sticky left-[420px] z-10 ${rowBg} border-b border-gray-100 px-3 py-2 whitespace-nowrap`}
                  style={{ minWidth: 220, width: 220 }}
                  title={`${row.countPersons} Personen${row.funktionVarianten.length > 1 ? ` · Varianten: ${row.funktionVarianten.join(", ")}` : ""}`}
                >
                  {row.funktionsgruppe}
                </td>
                <td className="border-b border-gray-100 px-3 py-2 whitespace-nowrap">
                  {row.stellenbezeichnung}
                </td>

                <td className="border-b border-gray-100 px-3 py-2 text-right bg-emerald-100">
                  {formatNumber(row.sollStellen2026)}
                </td>
                <td className="border-b border-gray-100 px-3 py-2 text-right bg-emerald-100">
                  {formatNumber(row.lohnBudget2026)}
                </td>

                <td className="border-b border-gray-100 px-3 py-2 text-right bg-yellow-100 font-semibold">
                  {formatNumber(row.istStellenKum2026)}
                </td>
                <td className="border-b border-gray-100 px-3 py-2 text-right bg-yellow-100">
                  {formatNumber(row.bruttoLohnHR2026)}
                </td>
                <td className="border-b border-gray-100 px-3 py-2 text-right bg-yellow-100 font-medium">
                  {formatNumber(row.totalHR2026)}
                </td>

                {(() => {
                  const sollFte = sollFteForGroup(row.funktionsgruppe, soll);
                  const istFte = row.istStellenKum2026 ?? null;
                  const delta =
                    sollFte !== null && istFte !== null
                      ? Math.round((istFte - sollFte) * 100) / 100
                      : null;
                  return (
                    <>
                      <td className="border-b border-gray-100 px-3 py-2 text-right bg-orange-100 font-semibold">
                        {formatNumber(sollFte)}
                      </td>
                      <td className="border-b border-gray-100 px-3 py-2 text-right bg-purple-100 font-semibold">
                        {formatNumber(sollFte)}
                      </td>
                      <td className="border-b border-gray-100 px-3 py-2 text-right bg-purple-100">
                        <span className={deltaColorClass(delta)}>{formatNumber(delta)}</span>
                      </td>
                      {MONTHS_DE_SHORT.map((m) => {
                        const mSoll = sollFteForGroup(row.funktionsgruppe, sollByMonth?.[m] ?? null);
                        return (
                          <td
                            key={m}
                            className="border-b border-gray-100 px-3 py-2 text-right bg-purple-100 tabular-nums"
                          >
                            {formatNumber(mSoll)}
                          </td>
                        );
                      })}
                    </>
                  );
                })()}
              </tr>
            );
          })}

          {!loading && rows.length === 0 ? (
            <tr>
              <td className="px-4 py-6 text-sm text-gray-600" colSpan={24}>
                Keine IST-Daten gefunden. Bitte unter{" "}
                <span className="font-medium">Personaldaten</span> die Excel
                hochladen.
              </td>
            </tr>
          ) : null}

          {!loading && rows.length > 0 && filteredRows.length === 0 ? (
            <tr>
              <td className="px-4 py-6 text-sm text-gray-600" colSpan={24}>
                Keine Zeilen für den aktuellen Filter. Bitte oben die Auswahl anpassen.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

