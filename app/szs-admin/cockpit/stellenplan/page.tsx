"use client";

import Navigation from "@/components/admin-szs/cockpit/Navigation";
import StellenplanTable from "@/components/admin-szs/cockpit/stellenplan/StellenplanTable";
import TeamStellenplanPanel from "@/components/admin-szs/cockpit/stellenplan/TeamStellenplanPanel";

export default function StellenplanPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="flex items-end justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Stellenplan</h1>
              <p className="text-sm text-gray-600 mt-1">
                Gerüstansicht analog zum Printscreen (Budget/HR-Blöcke, Timeline/Spaltenstruktur).
              </p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow border border-gray-200">
            <TeamStellenplanPanel />
            <StellenplanTable />
          </div>
        </div>
      </main>
    </div>
  );
}

