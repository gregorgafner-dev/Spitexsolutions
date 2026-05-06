import {
  PersonalmixAnalysis,
  Employee,
  TimeEntry,
} from "@/lib/szs-admin/cockpit/types";
import { dataStore } from "@/lib/szs-admin/cockpit/data/store";

/**
 * Berechnet den Personalmix für einen bestimmten Zeitpunkt
 */
export function calculatePersonalmix(
  date: string
): PersonalmixAnalysis {
  const employees = dataStore.getEmployees();
  const timeEntries = dataStore
    .getTimeEntriesByDateRange(date, date);

  // Gruppiere Mitarbeiter nach Kategorie
  const categories = {
    diplomiert: 0,
    fachangestellt: 0,
    pflegehelfend: 0,
    ohneAusbildung: 0,
    overhead: 0,
  };

  employees.forEach((employee) => {
    switch (employee.category) {
      case "diplomiert":
        categories.diplomiert += employee.fta;
        break;
      case "fachangestellt":
        categories.fachangestellt += employee.fta;
        break;
      case "pflegehelfend":
        categories.pflegehelfend += employee.fta;
        break;
      case "ohne_ausbildung":
        categories.ohneAusbildung += employee.fta;
        break;
      case "overhead":
        categories.overhead += employee.fta;
        break;
    }
  });

  const totalFTA = Object.values(categories).reduce((sum, val) => sum + val, 0);

  // Berechne geleistete Stunden
  const hours = {
    aStunden: timeEntries.reduce((sum, te) => sum + te.aStunden, 0),
    bStunden: timeEntries.reduce((sum, te) => sum + te.bStunden, 0),
    cStunden: timeEntries.reduce((sum, te) => sum + te.cStunden, 0),
    hwStunden: timeEntries.reduce((sum, te) => sum + te.hwStunden, 0),
  };

  const totalHours =
    hours.aStunden + hours.bStunden + hours.cStunden + hours.hwStunden;

  // Berechne Verhältnis FTA zu Stunden
  const ratioToHours = {
    diplomiert:
      totalHours > 0
        ? (categories.diplomiert / totalFTA) * (totalHours / totalFTA)
        : 0,
    fachangestellt:
      totalHours > 0
        ? (categories.fachangestellt / totalFTA) * (totalHours / totalFTA)
        : 0,
    pflegehelfend:
      totalHours > 0
        ? (categories.pflegehelfend / totalFTA) * (totalHours / totalFTA)
        : 0,
    ohneAusbildung:
      totalHours > 0
        ? (categories.ohneAusbildung / totalFTA) * (totalHours / totalFTA)
        : 0,
    overhead:
      totalHours > 0
        ? (categories.overhead / totalFTA) * (totalHours / totalFTA)
        : 0,
  };

  return {
    date,
    categories,
    totalFTA,
    hours,
    ratioToHours,
  };
}

/**
 * Berechnet Personalmix-Trends über einen Zeitraum
 */
export function calculatePersonalmixTrends(
  startDate: string,
  endDate: string,
  interval: "daily" | "weekly" | "monthly" | "yearly"
): PersonalmixAnalysis[] {
  const results: PersonalmixAnalysis[] = [];
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

    // Berechne Personalmix für den Zeitraum
    const analysis = calculatePersonalmixForRange(
      current.toISOString().split("T")[0],
      intervalEnd.toISOString().split("T")[0]
    );

    results.push(analysis);

    // IMPORTANT: advance at least one day to avoid stalling when intervalEnd is clamped to endDate
    current = new Date(intervalEnd);
    current.setDate(current.getDate() + 1);
  }

  return results;
}

/**
 * Berechnet den Personalmix für einen Zeitraum (aggregiert)
 */
function calculatePersonalmixForRange(
  startDate: string,
  endDate: string
): PersonalmixAnalysis {
  const employees = dataStore.getEmployees();
  const timeEntries = dataStore.getTimeEntriesByDateRange(startDate, endDate);

  // Gruppiere Mitarbeiter nach Kategorie
  const categories = {
    diplomiert: 0,
    fachangestellt: 0,
    pflegehelfend: 0,
    ohneAusbildung: 0,
    overhead: 0,
  };

  employees.forEach((employee) => {
    switch (employee.category) {
      case "diplomiert":
        categories.diplomiert += employee.fta;
        break;
      case "fachangestellt":
        categories.fachangestellt += employee.fta;
        break;
      case "pflegehelfend":
        categories.pflegehelfend += employee.fta;
        break;
      case "ohne_ausbildung":
        categories.ohneAusbildung += employee.fta;
        break;
      case "overhead":
        categories.overhead += employee.fta;
        break;
    }
  });

  const totalFTA = Object.values(categories).reduce((sum, val) => sum + val, 0);

  // Berechne geleistete Stunden für den Zeitraum
  const hours = {
    aStunden: timeEntries.reduce((sum, te) => sum + te.aStunden, 0),
    bStunden: timeEntries.reduce((sum, te) => sum + te.bStunden, 0),
    cStunden: timeEntries.reduce((sum, te) => sum + te.cStunden, 0),
    hwStunden: timeEntries.reduce((sum, te) => sum + te.hwStunden, 0),
  };

  const totalHours =
    hours.aStunden + hours.bStunden + hours.cStunden + hours.hwStunden;

  // Berechne Verhältnis FTA zu Stunden
  const ratioToHours = {
    diplomiert:
      totalFTA > 0 && totalHours > 0
        ? (categories.diplomiert / totalFTA) * (totalHours / totalFTA)
        : 0,
    fachangestellt:
      totalFTA > 0 && totalHours > 0
        ? (categories.fachangestellt / totalFTA) * (totalHours / totalFTA)
        : 0,
    pflegehelfend:
      totalFTA > 0 && totalHours > 0
        ? (categories.pflegehelfend / totalFTA) * (totalHours / totalFTA)
        : 0,
    ohneAusbildung:
      totalFTA > 0 && totalHours > 0
        ? (categories.ohneAusbildung / totalFTA) * (totalHours / totalFTA)
        : 0,
    overhead:
      totalFTA > 0 && totalHours > 0
        ? (categories.overhead / totalFTA) * (totalHours / totalFTA)
        : 0,
  };

  return {
    date: `${startDate} - ${endDate}`,
    categories,
    totalFTA,
    hours,
    ratioToHours,
  };
}












