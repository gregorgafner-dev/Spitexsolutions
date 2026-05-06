"use client";

import { useState, useEffect } from "react";
import { FilterState, TimeRange, TargetLevel } from "@/lib/szs-admin/cockpit/types";
import { dataStore } from "@/lib/szs-admin/cockpit/data/store";
import { BERUFSGRUPPEN } from "@/lib/szs-admin/cockpit/constants/berufsgruppen";

interface FilterBarProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}

export default function FilterBar({ filters, onFiltersChange }: FilterBarProps) {
  const [employees, setEmployees] = useState<any[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setEmployees(dataStore.getEmployees());
  }, []);

  const teams = Array.from(new Set(employees.map((e) => e.team)));
  // Verwende vordefinierte Berufsgruppen
  const berufsgruppen = BERUFSGRUPPEN;

  const handleTimeRangeChange = (timeRange: TimeRange) => {
    const today = new Date();
    let startDate = "";
    let endDate = today.toISOString().split("T")[0];

    switch (timeRange) {
      case "daily":
        startDate = endDate;
        break;
      case "weekly":
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        startDate = weekAgo.toISOString().split("T")[0];
        break;
      case "monthly":
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        startDate = monthAgo.toISOString().split("T")[0];
        break;
      case "yearly":
        const yearAgo = new Date(today);
        yearAgo.setFullYear(yearAgo.getFullYear() - 1);
        startDate = yearAgo.toISOString().split("T")[0];
        break;
      case "multi-year":
        const twoYearsAgo = new Date(today);
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
        startDate = twoYearsAgo.toISOString().split("T")[0];
        break;
      case "custom":
        // Custom bleibt unverändert, Nutzer kann manuell ändern
        break;
    }

    onFiltersChange({
      ...filters,
      timeRange,
      startDate: timeRange !== "custom" ? startDate : filters.startDate,
      endDate: timeRange !== "custom" ? endDate : filters.endDate,
    });
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow mb-6">
      <h3 className="text-lg font-semibold mb-4 text-gray-900">Filter</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Zeitraum
          </label>
          <select
            value={filters.timeRange}
            onChange={(e) => handleTimeRangeChange(e.target.value as TimeRange)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
          >
            <option value="daily">Täglich</option>
            <option value="weekly">Wöchentlich</option>
            <option value="monthly">Monatlich</option>
            <option value="yearly">Jährlich</option>
            <option value="multi-year">Mehrjährig</option>
            <option value="custom">Benutzerdefiniert</option>
          </select>
        </div>

        {filters.timeRange === "custom" && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Von
              </label>
              <input
                type="date"
                value={filters.startDate || ""}
                onChange={(e) =>
                  onFiltersChange({ ...filters, startDate: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bis
              </label>
              <input
                type="date"
                value={filters.endDate || ""}
                onChange={(e) =>
                  onFiltersChange({ ...filters, endDate: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              />
            </div>
          </>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ebene
          </label>
          <select
            value={filters.level}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                level: e.target.value as TargetLevel,
                team: undefined,
                berufsgruppe: undefined,
                employeeId: undefined,
              })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
          >
            <option value="mitarbeiter">Mitarbeiter</option>
            <option value="team">Team</option>
            <option value="berufsgruppe">Berufsgruppe</option>
            <option value="betrieb">Betrieb</option>
          </select>
        </div>

        {filters.level === "team" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Team
            </label>
            <select
              value={filters.team || ""}
              onChange={(e) =>
                onFiltersChange({ ...filters, team: e.target.value })
              }
              disabled={!mounted}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white disabled:bg-gray-100"
            >
              <option value="">Alle Teams</option>
              {mounted && teams.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </div>
        )}

        {filters.level === "berufsgruppe" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Berufsgruppe
            </label>
            <select
              value={filters.berufsgruppe || ""}
              onChange={(e) =>
                onFiltersChange({ ...filters, berufsgruppe: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            >
              <option value="">Alle Berufsgruppen</option>
              {berufsgruppen.map((bg) => (
                <option key={bg} value={bg}>
                  {bg}
                </option>
              ))}
            </select>
          </div>
        )}

        {filters.level === "mitarbeiter" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mitarbeiter
            </label>
            <select
              value={filters.employeeId || ""}
              onChange={(e) =>
                onFiltersChange({ ...filters, employeeId: e.target.value })
              }
              disabled={!mounted}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white disabled:bg-gray-100"
            >
              <option value="">Alle Mitarbeiter</option>
              {mounted && employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

