"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navigation from "@/components/admin-szs/cockpit/Navigation";
import { parseExcelFile } from "@/lib/szs-admin/cockpit/excel/parser";
import { dataStore } from "@/lib/szs-admin/cockpit/data/store";

export default function ImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    employees: number;
    timeEntries: number;
    targetValues: number;
    errors: string[];
  } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setLoading(true);
    try {
      const importResult = await parseExcelFile(file);

      // Importiere Daten in den Store
      importResult.employees.forEach((emp) => {
        dataStore.addEmployee(emp);
      });
      importResult.timeEntries.forEach((te) => {
        dataStore.addTimeEntry(te);
      });
      importResult.targetValues.forEach((tv) => {
        dataStore.addTargetValue(tv);
      });

      setResult({
        employees: importResult.employees.length,
        timeEntries: importResult.timeEntries.length,
        targetValues: importResult.targetValues.length,
        errors: importResult.errors,
      });
    } catch (error) {
      setResult({
        employees: 0,
        timeEntries: 0,
        targetValues: 0,
        errors: [`Fehler beim Import: ${error}`],
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6">
            <Link
              href="/szs-admin/cockpit/data-entry"
              className="inline-flex items-center text-blue-600 hover:text-blue-700 text-sm font-medium mb-4"
            >
              ← Zurück zur Dateneingabe
            </Link>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-6">
            Excel-Import
          </h1>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-2">
                Excel-Datei hochladen
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                Die Excel-Datei sollte folgende Sheets enthalten:
              </p>
              <ul className="list-disc list-inside text-sm text-gray-600 mb-4 space-y-1">
                <li>
                  <strong>Mitarbeiter</strong>: Spalten: ID, Name, Team,
                  Berufsgruppe, Status, Kategorie, FTA
                </li>
                <li>
                  <strong>Zeiterfassung</strong>: Spalten: ID, MitarbeiterID,
                  Datum, A-Stunden, B-Stunden, C-Stunden, HW-Stunden
                </li>
                <li>
                  <strong>Zielwerte</strong>: Spalten: ID, Ebene, Identifier,
                  Startdatum, Enddatum, Zielstunden
                </li>
              </ul>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Datei auswählen
              </label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>

            <button
              onClick={handleImport}
              disabled={!file || loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? "Importiere..." : "Importieren"}
            </button>

            {result && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-4">Import-Ergebnis</h3>
                <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-4">
                  <p className="text-sm text-green-800">
                    <strong>Erfolgreich importiert:</strong>
                  </p>
                  <ul className="list-disc list-inside text-sm text-green-700 mt-2 space-y-1">
                    <li>{result.employees} Mitarbeiter</li>
                    <li>{result.timeEntries} Zeiterfassungen</li>
                    <li>{result.targetValues} Zielwerte</li>
                  </ul>
                </div>

                {result.errors.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-4">
                    <p className="text-sm text-red-800 font-semibold mb-2">
                      Fehler ({result.errors.length}):
                    </p>
                    <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                      {result.errors.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-4 flex space-x-4">
                  <Link
                    href="/szs-admin/cockpit/data-entry"
                    className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition text-sm font-medium"
                  >
                    Zurück zur Dateneingabe
                  </Link>
                  <Link
                    href="/szs-admin/cockpit/dashboard"
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition text-sm font-medium"
                  >
                    Zum Dashboard
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

