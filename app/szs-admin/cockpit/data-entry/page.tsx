"use client";

import Link from "next/link";
import Navigation from "@/components/admin-szs/cockpit/Navigation";

export default function DataEntryPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Dateneingabe</h1>
            <p className="text-sm text-gray-600 mt-1">
              Bitte wähle einen Bereich. (Weitere Button-Fenster folgen.)
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <Link
              href="/szs-admin/cockpit/data-entry/lohntabellen"
              className="group bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition p-5"
            >
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold text-gray-900">
                  Lohntabellen
                </div>
                <div className="text-xs font-semibold px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Neu
                </div>
              </div>
              <p className="mt-2 text-sm text-gray-600">
                Pflege der Lohn-/Satz-Tabellen als Basis für IST-Berechnungen.
              </p>
              <div className="mt-4 text-sm font-medium text-indigo-700 group-hover:text-indigo-800">
                Öffnen →
              </div>
            </Link>

            <Link
              href="/szs-admin/cockpit/data-entry/stundenbudget"
              className="group bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition p-5"
            >
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold text-gray-900">
                  Stundenbudget
                </div>
                <div className="text-xs font-semibold px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  Budget 2026
                </div>
              </div>
              <p className="mt-2 text-sm text-gray-600">
                Budgetierte Stunden (KLV A/B/C, HW) hinterlegen als Basis für SOLL‑FTE.
              </p>
              <div className="mt-4 text-sm font-medium text-blue-700 group-hover:text-blue-800">
                Öffnen →
              </div>
            </Link>

            <Link
              href="/szs-admin/cockpit/data-entry/import"
              className="group bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition p-5"
            >
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold text-gray-900">
                  Excel-Import
                </div>
                <div className="text-xs font-semibold px-2 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
                  Import
                </div>
              </div>
              <p className="mt-2 text-sm text-gray-600">
                Bestehende Daten aus Excel laden und ins Tool übernehmen.
              </p>
              <div className="mt-4 text-sm font-medium text-green-700 group-hover:text-green-800">
                Öffnen →
              </div>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

