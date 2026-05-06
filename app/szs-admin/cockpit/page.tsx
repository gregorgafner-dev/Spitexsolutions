"use client";

import Link from "next/link";
import Navigation from "@/components/admin-szs/cockpit/Navigation";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Willkommen beim Cockpit Reporting Tool
            </h2>
            <p className="text-lg text-gray-600 mb-8">
              Analysieren Sie Produktivität, Overhead-Verhältnisse und Personalmix
            </p>
            <div className="flex justify-center space-x-4">
              <Link
                href="/szs-admin/cockpit/dashboard"
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
              >
                Zum Dashboard
              </Link>
              <Link
                href="/szs-admin/cockpit/lohnrechner"
                className="bg-teal-600 text-white px-6 py-3 rounded-lg hover:bg-teal-700 transition"
              >
                Lohnrechner
              </Link>
              <Link
                href="/szs-admin/cockpit/stellenplan"
                className="bg-orange-600 text-white px-6 py-3 rounded-lg hover:bg-orange-700 transition"
              >
                Stellenplan
              </Link>
              <Link
                href="/szs-admin/cockpit/kleidung"
                className="bg-rose-600 text-white px-6 py-3 rounded-lg hover:bg-rose-700 transition"
              >
                Kleidung
              </Link>
              <Link
                href="/szs-admin/cockpit/weiterbildungsrechner"
                className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition"
              >
                Weiterbildungsrechner
              </Link>
              <Link
                href="/szs-admin/cockpit/fahrzeuge"
                className="bg-slate-600 text-white px-6 py-3 rounded-lg hover:bg-slate-700 transition"
              >
                Fahrzeuge
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

