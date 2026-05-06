import * as XLSX from "xlsx";
import { Employee, TimeEntry, TargetValue } from "@/lib/szs-admin/cockpit/types";

export interface ExcelImportResult {
  employees: Employee[];
  timeEntries: TimeEntry[];
  targetValues: TargetValue[];
  errors: string[];
}

/**
 * Parst eine Excel-Datei und extrahiert Mitarbeiter, Zeiterfassungen und Zielwerte
 */
export function parseExcelFile(file: File): Promise<ExcelImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const errors: string[] = [];

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });

        const employees: Employee[] = [];
        const timeEntries: TimeEntry[] = [];
        const targetValues: TargetValue[] = [];

        // Parse Mitarbeiter (Sheet "Mitarbeiter" oder erste Spalte)
        if (workbook.SheetNames.includes("Mitarbeiter")) {
          const sheet = workbook.Sheets["Mitarbeiter"];
          const jsonData = XLSX.utils.sheet_to_json(sheet);
          jsonData.forEach((row: any, index: number) => {
            try {
              const employee: Employee = {
                id: row.ID || `emp-${Date.now()}-${index}`,
                name: row.Name || row.name || "",
                team: row.Team || row.team || "",
                berufsgruppe: row.Berufsgruppe || row.berufsgruppe || "",
                status: (row.Status || row.status || "produktiv") as "produktiv" | "overhead",
                category: (row.Kategorie || row.category || "diplomiert") as any,
                fta: parseFloat(row.FTA || row.fta || "1"),
              };

              if (employee.name) {
                employees.push(employee);
              }
            } catch (error) {
              errors.push(`Fehler beim Parsen von Mitarbeiter Zeile ${index + 2}: ${error}`);
            }
          });
        }

        // Parse Zeiterfassung (Sheet "Zeiterfassung")
        if (workbook.SheetNames.includes("Zeiterfassung")) {
          const sheet = workbook.Sheets["Zeiterfassung"];
          const jsonData = XLSX.utils.sheet_to_json(sheet);
          jsonData.forEach((row: any, index: number) => {
            try {
              const date = row.Datum || row.datum || row.Date || row.date;
              if (!date) {
                errors.push(`Zeiterfassung Zeile ${index + 2}: Kein Datum gefunden`);
                return;
              }

              const timeEntry: TimeEntry = {
                id: row.ID || `te-${Date.now()}-${index}`,
                employeeId: row.MitarbeiterID || row.employeeId || row["Mitarbeiter-ID"] || "",
                date: formatDate(date),
                aStunden: parseFloat(row["A-Stunden"] || row.aStunden || row["A Stunden"] || "0"),
                bStunden: parseFloat(row["B-Stunden"] || row.bStunden || row["B Stunden"] || "0"),
                cStunden: parseFloat(row["C-Stunden"] || row.cStunden || row["C Stunden"] || "0"),
                hwStunden: parseFloat(row["HW-Stunden"] || row.hwStunden || row["HW Stunden"] || "0"),
              };

              if (timeEntry.employeeId) {
                timeEntries.push(timeEntry);
              }
            } catch (error) {
              errors.push(`Fehler beim Parsen von Zeiterfassung Zeile ${index + 2}: ${error}`);
            }
          });
        }

        // Parse Zielwerte (Sheet "Zielwerte")
        if (workbook.SheetNames.includes("Zielwerte")) {
          const sheet = workbook.Sheets["Zielwerte"];
          const jsonData = XLSX.utils.sheet_to_json(sheet);
          jsonData.forEach((row: any, index: number) => {
            try {
              const targetValue: TargetValue = {
                id: row.ID || `tv-${Date.now()}-${index}`,
                level: (row.Ebene || row.level || "betrieb") as any,
                identifier: row.Identifier || row.identifier || "betrieb",
                startDate: formatDate(row.Startdatum || row.startDate || row["Start-Datum"]),
                endDate: formatDate(row.Enddatum || row.endDate || row["End-Datum"]),
                targetHours: parseFloat(row.Zielstunden || row.targetHours || row["Ziel-Stunden"] || "0"),
              };

              if (targetValue.identifier && targetValue.startDate && targetValue.endDate) {
                targetValues.push(targetValue);
              }
            } catch (error) {
              errors.push(`Fehler beim Parsen von Zielwert Zeile ${index + 2}: ${error}`);
            }
          });
        }

        resolve({
          employees,
          timeEntries,
          targetValues,
          errors,
        });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error("Fehler beim Lesen der Datei"));
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Formatiert ein Datum in ISO-Format (YYYY-MM-DD)
 */
function formatDate(date: any): string {
  if (typeof date === "string") {
    // Versuche verschiedene Datumsformate zu parsen
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split("T")[0];
    }
    return date;
  }
  if (date instanceof Date) {
    return date.toISOString().split("T")[0];
  }
  // Excel-Datum (Tage seit 1900)
  if (typeof date === "number") {
    const excelEpoch = new Date(1899, 11, 30);
    const jsDate = new Date(excelEpoch.getTime() + date * 24 * 60 * 60 * 1000);
    return jsDate.toISOString().split("T")[0];
  }
  return new Date().toISOString().split("T")[0];
}












