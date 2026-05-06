"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Navigation from "@/components/admin-szs/cockpit/Navigation";
import FilterBar from "@/components/admin-szs/cockpit/filters/FilterBar";
import { FilterState } from "@/lib/szs-admin/cockpit/types";
import {
  calculateProductivityTrends,
  calculatePersonalmixTrends,
} from "@/lib/szs-admin/cockpit/calculations";
import { dataStore } from "@/lib/szs-admin/cockpit/data/store";
import * as XLSX from "xlsx";

const ProductivityChart = dynamic(
  () => import("@/components/admin-szs/cockpit/charts/ProductivityChart"),
  { ssr: false }
);
const PersonalmixChart = dynamic(
  () => import("@/components/admin-szs/cockpit/charts/PersonalmixChart"),
  { ssr: false }
);
const HoursDistributionChart = dynamic(
  () => import("@/components/admin-szs/cockpit/charts/HoursDistributionChart"),
  { ssr: false }
);

export default function ReportsPage() {
  const today = new Date();
  const defaultEndDate = today.toISOString().split("T")[0];
  const monthAgo = new Date(today);
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  const defaultStartDate = monthAgo.toISOString().split("T")[0];

  const [filters, setFilters] = useState<FilterState>({
    timeRange: "monthly",
    startDate: defaultStartDate,
    endDate: defaultEndDate,
    level: "betrieb",
  });

  const [productivityTrends, setProductivityTrends] = useState<any[]>([]);
  const [personalmixTrends, setPersonalmixTrends] = useState<any[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !filters.startDate || !filters.endDate) return;

    let identifier = "betrieb";
    if (filters.level === "team" && filters.team) {
      identifier = filters.team;
    } else if (filters.level === "berufsgruppe" && filters.berufsgruppe) {
      identifier = filters.berufsgruppe;
    } else if (filters.level === "mitarbeiter" && filters.employeeId) {
      identifier = filters.employeeId;
    }

    const interval =
      filters.timeRange === "daily"
        ? "daily"
        : filters.timeRange === "weekly"
        ? "weekly"
        : filters.timeRange === "monthly"
        ? "monthly"
        : "yearly";

    const trends = calculateProductivityTrends(
      filters.level,
      identifier,
      filters.startDate,
      filters.endDate,
      interval
    );
    setProductivityTrends(trends);

    const pmTrends = calculatePersonalmixTrends(
      filters.startDate,
      filters.endDate,
      interval
    );
    setPersonalmixTrends(pmTrends);
  }, [filters, mounted]);

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    // Produktivitäts-Report
    const productivityData = productivityTrends.map((item) => ({
      Ebene: item.level,
      Identifier: item.identifier,
      "Ist-Stunden": item.actualHours,
      "Ziel-Stunden": item.targetHours,
      Produktivität: `${item.productivity.toFixed(2)}%`,
    }));
    const ws1 = XLSX.utils.json_to_sheet(productivityData);
    XLSX.utils.book_append_sheet(wb, ws1, "Produktivität");

    // Personalmix-Report
    const personalmixData = personalmixTrends.flatMap((item) => [
      {
        Datum: item.date,
        "Diplomiert (FTA)": item.categories.diplomiert,
        "Fachangestellt (FTA)": item.categories.fachangestellt,
        "Pflegehelfend (FTA)": item.categories.pflegehelfend,
        "Ohne Ausbildung (FTA)": item.categories.ohneAusbildung,
        "Overhead (FTA)": item.categories.overhead,
        "Gesamt FTA": item.totalFTA,
        "A-Stunden": item.hours.aStunden,
        "B-Stunden": item.hours.bStunden,
        "C-Stunden": item.hours.cStunden,
        "HW-Stunden": item.hours.hwStunden,
      },
    ]);
    const ws2 = XLSX.utils.json_to_sheet(personalmixData);
    XLSX.utils.book_append_sheet(wb, ws2, "Personalmix");

    // Export
    const fileName = `Report_${filters.startDate}_${filters.endDate}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const exportToPDF = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
            <div className="flex space-x-3">
              <button
                onClick={exportToExcel}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition"
              >
                Als Excel exportieren
              </button>
              <button
                onClick={exportToPDF}
                className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition"
              >
                Als PDF exportieren
              </button>
            </div>
          </div>

          <FilterBar filters={filters} onFiltersChange={setFilters} />

          <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-2xl font-semibold mb-4">
                Produktivitäts-Report
              </h2>
              {productivityTrends.length > 0 ? (
                <>
                  {mounted && (
                    <ProductivityChart
                      data={productivityTrends}
                      title="Produktivitäts-Trend"
                    />
                  )}
                  <div className="mt-6 overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Ebene
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Identifier
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Ist-Stunden
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Ziel-Stunden
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Produktivität
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {productivityTrends.map((item, index) => (
                          <tr key={index}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {item.level}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {item.identifier}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {item.actualHours.toFixed(1)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {item.targetHours.toFixed(1)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <span
                                className={
                                  item.productivity >= 100
                                    ? "text-green-600"
                                    : "text-red-600"
                                }
                              >
                                {item.productivity.toFixed(2)}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="text-gray-600">
                  Keine Daten für den ausgewählten Zeitraum verfügbar.
                </p>
              )}
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-2xl font-semibold mb-4">
                Personalmix-Report
              </h2>
              {personalmixTrends.length > 0 ? (
                <>
                  {mounted && (
                    <>
                      <PersonalmixChart
                        data={personalmixTrends}
                        title="Personalmix-Verteilung (FTA)"
                      />
                      <HoursDistributionChart
                        data={personalmixTrends}
                        title="Stunden-Verteilung"
                      />
                    </>
                  )}
                  <div className="mt-6 overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Datum
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Diplomiert
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Fachangestellt
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Pflegehelfend
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Ohne Ausbildung
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Overhead
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Gesamt FTA
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            A-Stunden
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            B-Stunden
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            C-Stunden
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            HW-Stunden
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {personalmixTrends.map((item, index) => (
                          <tr key={index}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {item.date.length > 20
                                ? item.date.substring(0, 10)
                                : item.date}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {item.categories.diplomiert.toFixed(2)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {item.categories.fachangestellt.toFixed(2)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {item.categories.pflegehelfend.toFixed(2)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {item.categories.ohneAusbildung.toFixed(2)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {item.categories.overhead.toFixed(2)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {item.totalFTA.toFixed(2)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {item.hours.aStunden.toFixed(1)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {item.hours.bStunden.toFixed(1)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {item.hours.cStunden.toFixed(1)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {item.hours.hwStunden.toFixed(1)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="text-gray-600">
                  Keine Daten für den ausgewählten Zeitraum verfügbar.
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

