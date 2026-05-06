import { Employee } from "@/lib/szs-admin/cockpit/types";
import { dataStore } from "@/lib/szs-admin/cockpit/data/store";

/**
 * Berechnet die Fluktuation für einen Zeitraum
 * Fluktuation = Anzahl ausgeschiedener Mitarbeiter / Durchschnittliche Mitarbeiterzahl * 100
 * 
 * Hinweis: Für eine genaue Fluktuation wären historische Daten (Eintritts-/Austrittsdaten) nötig.
 * Aktuell wird eine vereinfachte Berechnung basierend auf Overhead-Status verwendet.
 */
export function calculateFluctuation(
  startDate: string,
  endDate: string
): number {
  const employees = dataStore.getEmployees();
  
  if (employees.length === 0) return 0;
  
  // Produktive Mitarbeiter (nur diese zählen für Fluktuation)
  const productiveEmployees = employees.filter(
    (e) => e.status === "produktiv"
  );
  
  const totalProductive = productiveEmployees.length;
  
  if (totalProductive === 0) return 0;
  
  // Overhead-Mitarbeiter werden als "ausgeschieden" betrachtet
  // (vereinfachte Annahme für Demo-Zwecke)
  const overheadEmployees = employees.filter(
    (e) => e.status === "overhead"
  ).length;
  
  // Fluktuation = Overhead / (Produktiv + Overhead) * 100
  const totalEmployees = employees.length;
  const fluctuation = (overheadEmployees / totalEmployees) * 100;
  
  return fluctuation;
}

