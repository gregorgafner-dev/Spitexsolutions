import { dataStore } from "@/lib/szs-admin/cockpit/data/store";

/**
 * Berechnet das Verhältnis von ABC-Stunden zu Personalmix für verschiedene Kategorien
 */
export interface HoursToPersonalmixRatio {
  diplomiert: number; // ABC-Stunden pro FTA für Diplomiert
  fachangestellt: number; // ABC-Stunden pro FTA für Fachangestellte
  srk: number; // ABC-Stunden pro FTA für SRK (Pflegehilfe)
}

/**
 * Berechnet das Verhältnis von ABC-Stunden zu Personalmix
 * ABC-Stunden = A-Stunden + B-Stunden + C-Stunden
 */
export function calculateHoursToPersonalmixRatio(
  date: string
): HoursToPersonalmixRatio {
  const employees = dataStore.getEmployees();
  const timeEntries = dataStore.getTimeEntriesByDateRange(date, date);
  
  // Gruppiere Stunden nach Kategorie
  const hoursByCategory = {
    diplomiert: 0,
    fachangestellt: 0,
    srk: 0, // Pflegehilfe = pflegehelfend
  };
  
  const ftaByCategory = {
    diplomiert: 0,
    fachangestellt: 0,
    srk: 0,
  };
  
  // Erstelle Map von Employee-ID zu Kategorie
  const employeeCategoryMap = new Map<string, string>();
  employees.forEach((emp) => {
    employeeCategoryMap.set(emp.id, emp.category);
    
    // Summiere FTA pro Kategorie
    if (emp.category === "diplomiert") {
      ftaByCategory.diplomiert += emp.fta;
    } else if (emp.category === "fachangestellt") {
      ftaByCategory.fachangestellt += emp.fta;
    } else if (emp.category === "pflegehelfend") {
      ftaByCategory.srk += emp.fta;
    }
  });
  
  // Summiere ABC-Stunden pro Kategorie
  timeEntries.forEach((te) => {
    const category = employeeCategoryMap.get(te.employeeId);
    const abcHours = te.aStunden + te.bStunden + te.cStunden;
    
    if (category === "diplomiert") {
      hoursByCategory.diplomiert += abcHours;
    } else if (category === "fachangestellt") {
      hoursByCategory.fachangestellt += abcHours;
    } else if (category === "pflegehelfend") {
      hoursByCategory.srk += abcHours;
    }
  });
  
  // Berechne Verhältnis: ABC-Stunden pro FTA
  const diplomiert =
    ftaByCategory.diplomiert > 0
      ? hoursByCategory.diplomiert / ftaByCategory.diplomiert
      : 0;
  
  const fachangestellt =
    ftaByCategory.fachangestellt > 0
      ? hoursByCategory.fachangestellt / ftaByCategory.fachangestellt
      : 0;
  
  const srk =
    ftaByCategory.srk > 0
      ? hoursByCategory.srk / ftaByCategory.srk
      : 0;
  
  return {
    diplomiert,
    fachangestellt,
    srk,
  };
}

