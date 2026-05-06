import { Employee, TimeEntry, TargetValue, Personalmix } from "@/lib/szs-admin/cockpit/types";

// Einfache In-Memory Datenspeicherung mit localStorage-Persistierung
// In einer echten App würde dies durch eine Datenbank ersetzt

const STORAGE_KEY = "cockpit-data";
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

function dbg(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>
) {
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

class DataStore {
  private employees: Employee[] = [];
  private timeEntries: TimeEntry[] = [];
  private targetValues: TargetValue[] = [];
  private personalmix: Personalmix[] = [];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (typeof window === "undefined") return;
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        this.employees = data.employees || [];
        this.timeEntries = data.timeEntries || [];
        this.targetValues = data.targetValues || [];
        this.personalmix = data.personalmix || [];
      }
    } catch (error) {
      dbg("H5", "lib/data/store.ts:loadFromStorage", "localStorage read failed", {
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      console.error("Fehler beim Laden der Daten aus localStorage:", error);
    }
  }

  private saveToStorage(): void {
    if (typeof window === "undefined") return;
    
    try {
      const data = {
        employees: this.employees,
        timeEntries: this.timeEntries,
        targetValues: this.targetValues,
        personalmix: this.personalmix,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      dbg("H5", "lib/data/store.ts:saveToStorage", "localStorage write failed", {
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      console.error("Fehler beim Speichern der Daten in localStorage:", error);
    }
  }

  // Employee Methods
  getEmployees(): Employee[] {
    return this.employees;
  }

  getEmployee(id: string): Employee | undefined {
    return this.employees.find((e) => e.id === id);
  }

  addEmployee(employee: Employee): void {
    this.employees.push(employee);
    this.saveToStorage();
  }

  updateEmployee(id: string, updates: Partial<Employee>): void {
    const index = this.employees.findIndex((e) => e.id === id);
    if (index !== -1) {
      this.employees[index] = { ...this.employees[index], ...updates };
      this.saveToStorage();
    }
  }

  deleteEmployee(id: string): void {
    this.employees = this.employees.filter((e) => e.id !== id);
    this.saveToStorage();
  }

  // TimeEntry Methods
  getTimeEntries(): TimeEntry[] {
    return this.timeEntries;
  }

  getTimeEntriesByEmployee(employeeId: string): TimeEntry[] {
    return this.timeEntries.filter((te) => te.employeeId === employeeId);
  }

  getTimeEntriesByDateRange(startDate: string, endDate: string): TimeEntry[] {
    return this.timeEntries.filter(
      (te) => te.date >= startDate && te.date <= endDate
    );
  }

  addTimeEntry(entry: TimeEntry): void {
    this.timeEntries.push(entry);
    this.saveToStorage();
  }

  updateTimeEntry(id: string, updates: Partial<TimeEntry>): void {
    const index = this.timeEntries.findIndex((te) => te.id === id);
    if (index !== -1) {
      this.timeEntries[index] = { ...this.timeEntries[index], ...updates };
      this.saveToStorage();
    }
  }

  deleteTimeEntry(id: string): void {
    this.timeEntries = this.timeEntries.filter((te) => te.id !== id);
    this.saveToStorage();
  }

  // TargetValue Methods
  getTargetValues(): TargetValue[] {
    return this.targetValues;
  }

  getTargetValue(
    level: string,
    identifier: string,
    date: string
  ): TargetValue | undefined {
    return this.targetValues.find(
      (tv) =>
        tv.level === level &&
        tv.identifier === identifier &&
        tv.startDate <= date &&
        tv.endDate >= date
    );
  }

  addTargetValue(target: TargetValue): void {
    this.targetValues.push(target);
    this.saveToStorage();
  }

  updateTargetValue(id: string, updates: Partial<TargetValue>): void {
    const index = this.targetValues.findIndex((tv) => tv.id === id);
    if (index !== -1) {
      this.targetValues[index] = { ...this.targetValues[index], ...updates };
      this.saveToStorage();
    }
  }

  deleteTargetValue(id: string): void {
    this.targetValues = this.targetValues.filter((tv) => tv.id !== id);
    this.saveToStorage();
  }

  // Personalmix Methods
  getPersonalmix(): Personalmix[] {
    return this.personalmix;
  }

  getPersonalmixByDateRange(
    startDate: string,
    endDate: string
  ): Personalmix[] {
    return this.personalmix.filter(
      (p) => p.date >= startDate && p.date <= endDate
    );
  }

  addPersonalmix(pm: Personalmix): void {
    this.personalmix.push(pm);
    this.saveToStorage();
  }

  updatePersonalmix(id: string, updates: Partial<Personalmix>): void {
    const index = this.personalmix.findIndex((p) => p.id === id);
    if (index !== -1) {
      this.personalmix[index] = { ...this.personalmix[index], ...updates };
      this.saveToStorage();
    }
  }

  deletePersonalmix(id: string): void {
    this.personalmix = this.personalmix.filter((p) => p.id !== id);
    this.saveToStorage();
  }

  // Export/Import für lokale Speicherung
  exportData() {
    return {
      employees: this.employees,
      timeEntries: this.timeEntries,
      targetValues: this.targetValues,
      personalmix: this.personalmix,
    };
  }

  importData(data: {
    employees: Employee[];
    timeEntries: TimeEntry[];
    targetValues: TargetValue[];
    personalmix: Personalmix[];
  }) {
    this.employees = data.employees || [];
    this.timeEntries = data.timeEntries || [];
    this.targetValues = data.targetValues || [];
    this.personalmix = data.personalmix || [];
    this.saveToStorage();
  }
}

// Singleton-Instanz mit Lazy-Initialisierung
let dataStoreInstance: DataStore | null = null;

function getDataStore(): DataStore {
  if (typeof window === "undefined") {
    // Server-Side: Erstelle eine temporäre Instanz ohne localStorage
    // Diese wird nur für Type-Checking verwendet, nicht für tatsächliche Operationen
    if (!dataStoreInstance) {
      dataStoreInstance = new DataStore();
    }
    return dataStoreInstance;
  }
  
  // Client-Side: Initialisiere nur einmal
  if (!dataStoreInstance) {
    dataStoreInstance = new DataStore();
  }
  
  return dataStoreInstance;
}

// Export - einfache Funktion statt Proxy
export const dataStore = {
  getEmployees: () => getDataStore().getEmployees(),
  getEmployee: (id: string) => getDataStore().getEmployee(id),
  addEmployee: (employee: Employee) => getDataStore().addEmployee(employee),
  updateEmployee: (id: string, updates: Partial<Employee>) => getDataStore().updateEmployee(id, updates),
  deleteEmployee: (id: string) => getDataStore().deleteEmployee(id),
  getTimeEntries: () => getDataStore().getTimeEntries(),
  getTimeEntriesByEmployee: (employeeId: string) => getDataStore().getTimeEntriesByEmployee(employeeId),
  getTimeEntriesByDateRange: (startDate: string, endDate: string) => getDataStore().getTimeEntriesByDateRange(startDate, endDate),
  addTimeEntry: (entry: TimeEntry) => getDataStore().addTimeEntry(entry),
  updateTimeEntry: (id: string, updates: Partial<TimeEntry>) => getDataStore().updateTimeEntry(id, updates),
  deleteTimeEntry: (id: string) => getDataStore().deleteTimeEntry(id),
  getTargetValues: () => getDataStore().getTargetValues(),
  getTargetValue: (level: string, identifier: string, date: string) => getDataStore().getTargetValue(level, identifier, date),
  addTargetValue: (target: TargetValue) => getDataStore().addTargetValue(target),
  updateTargetValue: (id: string, updates: Partial<TargetValue>) => getDataStore().updateTargetValue(id, updates),
  deleteTargetValue: (id: string) => getDataStore().deleteTargetValue(id),
  getPersonalmix: () => getDataStore().getPersonalmix(),
  getPersonalmixByDateRange: (startDate: string, endDate: string) => getDataStore().getPersonalmixByDateRange(startDate, endDate),
  addPersonalmix: (pm: Personalmix) => getDataStore().addPersonalmix(pm),
  updatePersonalmix: (id: string, updates: Partial<Personalmix>) => getDataStore().updatePersonalmix(id, updates),
  deletePersonalmix: (id: string) => getDataStore().deletePersonalmix(id),
  exportData: () => getDataStore().exportData(),
  importData: (data: { employees: Employee[]; timeEntries: TimeEntry[]; targetValues: TargetValue[]; personalmix: Personalmix[] }) => getDataStore().importData(data),
};

