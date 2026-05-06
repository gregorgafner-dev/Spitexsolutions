import {
  Employee,
  TimeEntry,
  TargetValue,
  ProductivityResult,
  TargetLevel,
} from "@/lib/szs-admin/cockpit/types";
import { dataStore } from "@/lib/szs-admin/cockpit/data/store";

const DBG_ENDPOINT =
  "http://127.0.0.1:7243/ingest/9f83cdbc-7a2c-49ee-9246-0ca0a646dfe1";
const DBG_SESSION = "debug-session";

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

function dbg(hypothesisId: string, location: string, message: string, data: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  // #region agent log (ndjson)
  fetch(DBG_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: DBG_SESSION,
      runId: getRunId(),
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion agent log (ndjson)
}

/**
 * Berechnet die Produktivität für einen einzelnen Mitarbeiter
 */
export function calculateEmployeeProductivity(
  employeeId: string,
  startDate: string,
  endDate: string
): ProductivityResult | null {
  const employee = dataStore.getEmployee(employeeId);
  if (!employee) return null;

  const timeEntries = dataStore
    .getTimeEntriesByDateRange(startDate, endDate)
    .filter((te) => te.employeeId === employeeId);

  const actualHours =
    timeEntries.reduce((sum, te) => sum + te.aStunden + te.bStunden + te.cStunden + te.hwStunden, 0);

  const target = dataStore.getTargetValue("mitarbeiter", employeeId, startDate);
  const targetHours = target?.targetHours || 0;

  const productivity = targetHours > 0 ? (actualHours / targetHours) * 100 : 0;

  return {
    level: "mitarbeiter",
    identifier: employeeId,
    actualHours,
    targetHours,
    productivity,
  };
}

/**
 * Berechnet die Produktivität für ein Team
 */
export function calculateTeamProductivity(
  teamName: string,
  startDate: string,
  endDate: string
): ProductivityResult | null {
  const employees = dataStore
    .getEmployees()
    .filter((e) => e.team === teamName);

  if (employees.length === 0) return null;

  const timeEntries = dataStore.getTimeEntriesByDateRange(startDate, endDate);
  const teamTimeEntries = timeEntries.filter((te) =>
    employees.some((e) => e.id === te.employeeId)
  );

  const actualHours = teamTimeEntries.reduce(
    (sum, te) => sum + te.aStunden + te.bStunden + te.cStunden + te.hwStunden,
    0
  );

  const target = dataStore.getTargetValue("team", teamName, startDate);
  const targetHours = target?.targetHours || 0;

  const productivity = targetHours > 0 ? (actualHours / targetHours) * 100 : 0;

  return {
    level: "team",
    identifier: teamName,
    actualHours,
    targetHours,
    productivity,
  };
}

/**
 * Berechnet die Produktivität für eine Berufsgruppe
 */
export function calculateBerufsgruppeProductivity(
  berufsgruppe: string,
  startDate: string,
  endDate: string
): ProductivityResult | null {
  const employees = dataStore
    .getEmployees()
    .filter((e) => e.berufsgruppe === berufsgruppe);

  if (employees.length === 0) return null;

  const timeEntries = dataStore.getTimeEntriesByDateRange(startDate, endDate);
  const bgTimeEntries = timeEntries.filter((te) =>
    employees.some((e) => e.id === te.employeeId)
  );

  const actualHours = bgTimeEntries.reduce(
    (sum, te) => sum + te.aStunden + te.bStunden + te.cStunden + te.hwStunden,
    0
  );

  const target = dataStore.getTargetValue("berufsgruppe", berufsgruppe, startDate);
  const targetHours = target?.targetHours || 0;

  const productivity = targetHours > 0 ? (actualHours / targetHours) * 100 : 0;

  return {
    level: "berufsgruppe",
    identifier: berufsgruppe,
    actualHours,
    targetHours,
    productivity,
  };
}

/**
 * Berechnet die Produktivität für den gesamten Betrieb
 */
export function calculateBetriebProductivity(
  startDate: string,
  endDate: string
): ProductivityResult {
  const timeEntries = dataStore.getTimeEntriesByDateRange(startDate, endDate);

  const actualHours = timeEntries.reduce(
    (sum, te) => sum + te.aStunden + te.bStunden + te.cStunden + te.hwStunden,
    0
  );

  const target = dataStore.getTargetValue("betrieb", "betrieb", startDate);
  const targetHours = target?.targetHours || 0;

  const productivity = targetHours > 0 ? (actualHours / targetHours) * 100 : 0;

  return {
    level: "betrieb",
    identifier: "betrieb",
    actualHours,
    targetHours,
    productivity,
  };
}

/**
 * Berechnet die Produktivität basierend auf Level und Identifier
 */
export function calculateProductivity(
  level: TargetLevel,
  identifier: string,
  startDate: string,
  endDate: string
): ProductivityResult | null {
  switch (level) {
    case "mitarbeiter":
      return calculateEmployeeProductivity(identifier, startDate, endDate);
    case "team":
      return calculateTeamProductivity(identifier, startDate, endDate);
    case "berufsgruppe":
      return calculateBerufsgruppeProductivity(identifier, startDate, endDate);
    case "betrieb":
      return calculateBetriebProductivity(startDate, endDate);
    default:
      return null;
  }
}

/**
 * Berechnet Produktivitäts-Trends über einen Zeitraum
 */
export function calculateProductivityTrends(
  level: TargetLevel,
  identifier: string,
  startDate: string,
  endDate: string,
  interval: "daily" | "weekly" | "monthly" | "yearly"
): ProductivityResult[] {
  dbg("D2", "lib/calculations/productivity.ts:calculateProductivityTrends:entry", "trend calc entry", {
    level,
    interval,
    startDate,
    endDate,
    identifierLen: String(identifier ?? "").length,
  });
  const results: ProductivityResult[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  let current = new Date(start);
  let warnedStuck = false;
  let iter = 0;

  while (current <= end) {
    iter++;
    let intervalEnd = new Date(current);

    switch (interval) {
      case "daily":
        intervalEnd.setDate(intervalEnd.getDate() + 1);
        break;
      case "weekly":
        intervalEnd.setDate(intervalEnd.getDate() + 7);
        break;
      case "monthly":
        intervalEnd.setMonth(intervalEnd.getMonth() + 1);
        break;
      case "yearly":
        intervalEnd.setFullYear(intervalEnd.getFullYear() + 1);
        break;
    }

    if (intervalEnd > end) {
      intervalEnd = new Date(end);
    }

    if (!warnedStuck && intervalEnd.getTime() === current.getTime()) {
      warnedStuck = true;
      dbg(
        "D2",
        "lib/calculations/productivity.ts:calculateProductivityTrends:stuck",
        "trend loop would stall (intervalEnd == current)",
        {
          iter,
          interval,
          current: current.toISOString().split("T")[0],
          end: end.toISOString().split("T")[0],
        }
      );
    }

    const result = calculateProductivity(
      level,
      identifier,
      current.toISOString().split("T")[0],
      intervalEnd.toISOString().split("T")[0]
    );

    if (result) {
      results.push(result);
    }

    // IMPORTANT: advance at least one day to avoid stalling when intervalEnd is clamped to endDate
    current = new Date(intervalEnd);
    current.setDate(current.getDate() + 1);
  }

  return results;
}












