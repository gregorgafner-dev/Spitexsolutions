// Mitarbeiter-Typen
export type EmployeeStatus = "produktiv" | "overhead";

export type EmployeeCategory =
  | "diplomiert"
  | "fachangestellt"
  | "pflegehelfend"
  | "ohne_ausbildung"
  | "overhead";

export interface Employee {
  id: string;
  name: string;
  team: string;
  berufsgruppe: string;
  status: EmployeeStatus;
  category: EmployeeCategory;
  fta: number; // Full Time Equivalent
}

// Zeiterfassung
export interface TimeEntry {
  id: string;
  employeeId: string;
  date: string; // ISO date string
  aStunden: number; // A-Stunden
  bStunden: number; // B-Stunden
  cStunden: number; // C-Stunden
  hwStunden: number; // HW-Stunden
}

// Zielwerte
export type TargetLevel = "mitarbeiter" | "team" | "berufsgruppe" | "betrieb";

export interface TargetValue {
  id: string;
  level: TargetLevel;
  identifier: string; // Mitarbeiter-ID, Team-Name, Berufsgruppe-Name oder "betrieb"
  startDate: string; // ISO date string
  endDate: string; // ISO date string
  targetHours: number; // Zielstunden
}

// Personalmix
export interface Personalmix {
  id: string;
  date: string; // ISO date string
  diplomiert: number; // FTA
  fachangestellt: number; // FTA
  pflegehelfend: number; // FTA
  ohneAusbildung: number; // FTA
  overhead: number; // FTA
}

// Filter-Typen
export type TimeRange = "daily" | "weekly" | "monthly" | "yearly" | "multi-year" | "custom";

export interface FilterState {
  timeRange: TimeRange;
  startDate?: string;
  endDate?: string;
  level: TargetLevel;
  team?: string;
  berufsgruppe?: string;
  employeeId?: string;
}

// Berechnungs-Ergebnisse
export interface ProductivityResult {
  level: TargetLevel;
  identifier: string;
  actualHours: number;
  targetHours: number;
  productivity: number; // Prozent
}

export interface OverheadRatio {
  overheadFTA: number;
  productiveFTA: number;
  ratio: number; // Prozent
}

export interface PersonalmixAnalysis {
  date: string;
  categories: {
    diplomiert: number;
    fachangestellt: number;
    pflegehelfend: number;
    ohneAusbildung: number;
    overhead: number;
  };
  totalFTA: number;
  hours: {
    aStunden: number;
    bStunden: number;
    cStunden: number;
    hwStunden: number;
  };
  ratioToHours: {
    diplomiert: number;
    fachangestellt: number;
    pflegehelfend: number;
    ohneAusbildung: number;
    overhead: number;
  };
}












