import { OverheadRatio } from "@/lib/szs-admin/cockpit/types";
import { dataStore } from "@/lib/szs-admin/cockpit/data/store";

/**
 * Berechnet das Verhältnis von Overhead zu produktiven Mitarbeitern
 */
export function calculateOverheadRatio(
  startDate: string,
  endDate: string
): OverheadRatio {
  const employees = dataStore.getEmployees();

  const overheadEmployees = employees.filter(
    (e) => e.status === "overhead"
  );
  const productiveEmployees = employees.filter(
    (e) => e.status === "produktiv"
  );

  const overheadFTA = overheadEmployees.reduce(
    (sum, e) => sum + e.fta,
    0
  );
  const productiveFTA = productiveEmployees.reduce(
    (sum, e) => sum + e.fta,
    0
  );

  const ratio =
    productiveFTA > 0 ? (overheadFTA / productiveFTA) * 100 : 0;

  return {
    overheadFTA,
    productiveFTA,
    ratio,
  };
}

/**
 * Berechnet Overhead-Verhältnis-Trends über einen Zeitraum
 */
export function calculateOverheadRatioTrends(
  startDate: string,
  endDate: string,
  interval: "daily" | "weekly" | "monthly" | "yearly"
): Array<{ date: string; ratio: OverheadRatio }> {
  const results: Array<{ date: string; ratio: OverheadRatio }> = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  let current = new Date(start);

  while (current <= end) {
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

    // Für Overhead-Verhältnis nehmen wir die aktuellen Mitarbeiter-Daten
    // (da sich FTA-Werte normalerweise nicht täglich ändern)
    const ratio = calculateOverheadRatio(
      current.toISOString().split("T")[0],
      intervalEnd.toISOString().split("T")[0]
    );

    results.push({
      date: current.toISOString().split("T")[0],
      ratio,
    });

    // IMPORTANT: advance at least one day to avoid stalling when intervalEnd is clamped to endDate
    current = new Date(intervalEnd);
    current.setDate(current.getDate() + 1);
  }

  return results;
}












