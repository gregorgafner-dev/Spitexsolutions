"use client";

import { useRef, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Navigation from "@/components/admin-szs/cockpit/Navigation";
import FilterBar from "@/components/admin-szs/cockpit/filters/FilterBar";
import KPICard from "@/components/admin-szs/cockpit/dashboard/KPICard";
import { FilterState } from "@/lib/szs-admin/cockpit/types";
import {
  calculateProductivity,
  calculateProductivityTrends,
  calculateOverheadRatio,
  calculateOverheadRatioTrends,
  calculatePersonalmix,
  calculatePersonalmixTrends,
  calculateFluctuation,
  calculateHoursToPersonalmixRatio,
} from "@/lib/szs-admin/cockpit/calculations";
import { dataStore } from "@/lib/szs-admin/cockpit/data/store";

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

const ProductivityChart = dynamic(
  () => import("@/components/admin-szs/cockpit/charts/ProductivityChart"),
  { ssr: false }
);
const OverheadRatioChart = dynamic(
  () => import("@/components/admin-szs/cockpit/charts/OverheadRatioChart"),
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

export default function DashboardPage() {
  const renderCount = useRef(0);
  renderCount.current += 1;
  if (renderCount.current <= 5) {
    dbg("D1", "app/dashboard/page.tsx:render", "dashboard render", {
      renderCount: renderCount.current,
      href: typeof window !== "undefined" ? window.location.href : null,
    });
  }

  const today = new Date();
  const defaultEndDate = today.toISOString().split("T")[0];
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const defaultStartDate = weekAgo.toISOString().split("T")[0];

  const [filters, setFilters] = useState<FilterState>({
    timeRange: "weekly",
    startDate: defaultStartDate,
    endDate: defaultEndDate,
    level: "betrieb",
  });

  const [productivity, setProductivity] = useState<number | null>(null);
  const [overheadRatio, setOverheadRatio] = useState<number | null>(null);
  const [overheadRatioData, setOverheadRatioData] = useState<any>(null);
  const [personalmixData, setPersonalmixData] = useState<any>(null);
  const [productivityTrends, setProductivityTrends] = useState<any[]>([]);
  const [personalmixTrends, setPersonalmixTrends] = useState<any[]>([]);
  const [fluctuation, setFluctuation] = useState<number | null>(null);
  const [hoursToPersonalmixRatio, setHoursToPersonalmixRatio] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !filters.startDate || !filters.endDate) return;

    // Berechne Produktivität
    let identifier = "betrieb";
    if (filters.level === "team" && filters.team) {
      identifier = filters.team;
    } else if (filters.level === "berufsgruppe" && filters.berufsgruppe) {
      identifier = filters.berufsgruppe;
    } else if (filters.level === "mitarbeiter" && filters.employeeId) {
      identifier = filters.employeeId;
    }

    dbg("D1", "app/dashboard/page.tsx:effect", "dashboard calc effect start", {
      timeRange: filters.timeRange,
      startDate: filters.startDate,
      endDate: filters.endDate,
      level: filters.level,
      hasTeam: Boolean(filters.team),
      hasBerufsgruppe: Boolean(filters.berufsgruppe),
      hasEmployeeId: Boolean(filters.employeeId),
    });

    const prodResult = calculateProductivity(
      filters.level,
      identifier,
      filters.startDate,
      filters.endDate
    );
    setProductivity(prodResult?.productivity || null);

    // Berechne Produktivitäts-Trends
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

    // Berechne Overhead-Verhältnis
    const overhead = calculateOverheadRatio(filters.startDate, filters.endDate);
    setOverheadRatio(overhead.ratio);
    setOverheadRatioData(overhead);

    // Berechne Personalmix
    const pm = calculatePersonalmix(filters.endDate);
    setPersonalmixData(pm);

    // Berechne Personalmix-Trends
    const pmTrends = calculatePersonalmixTrends(
      filters.startDate,
      filters.endDate,
      interval
    );
    setPersonalmixTrends(pmTrends);

    // Berechne Fluktuation
    const fluct = calculateFluctuation(filters.startDate, filters.endDate);
    setFluctuation(fluct);

    // Berechne Verhältnis ABC-Stunden zu Personalmix
    const hoursToPMRatio = calculateHoursToPersonalmixRatio(filters.endDate);
    setHoursToPersonalmixRatio(hoursToPMRatio);
  }, [filters, mounted]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Dashboard</h1>

          <FilterBar filters={filters} onFiltersChange={setFilters} />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <KPICard
              title="Produktivität"
              value={productivity !== null ? productivity : 0}
              subtitle={`${filters.level === "betrieb" ? "Gesamter Betrieb" : filters.level}`}
              color={productivity !== null && productivity >= 100 ? "green" : "blue"}
            />
            <KPICard
              title="Overhead-Verhältnis"
              value={overheadRatio !== null ? overheadRatio : 0}
              subtitle="% zu produktiven Mitarbeitern"
              color={overheadRatio !== null && overheadRatio <= 30 ? "green" : "yellow"}
            />
            <KPICard
              title="Fluktuation"
              value={fluctuation !== null ? fluctuation : 0}
              subtitle="%"
              color={fluctuation !== null && fluctuation <= 10 ? "green" : fluctuation !== null && fluctuation <= 20 ? "yellow" : "red"}
            />
            {hoursToPersonalmixRatio && (
              <>
                <KPICard
                  title="ABC-Stunden / Dipls"
                  value={hoursToPersonalmixRatio.diplomiert.toFixed(1)}
                  subtitle="Stunden pro FTA"
                  color="blue"
                />
              </>
            )}
          </div>

          {hoursToPersonalmixRatio && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 mb-8">
              <KPICard
                title="ABC-Stunden / FaGe"
                value={hoursToPersonalmixRatio.fachangestellt.toFixed(1)}
                subtitle="Stunden pro FTA"
                color="blue"
              />
              <KPICard
                title="ABC-Stunden / SRK"
                value={hoursToPersonalmixRatio.srk.toFixed(1)}
                subtitle="Stunden pro FTA"
                color="blue"
              />
            </div>
          )}

          <div className="space-y-6">
            {mounted && productivityTrends.length > 0 && (
              <ProductivityChart
                data={productivityTrends}
                title="Produktivitäts-Trend"
              />
            )}

            {mounted && overheadRatioData && (
              <OverheadRatioChart
                data={overheadRatioData}
                title="Overhead-Verhältnis"
              />
            )}

            {mounted && personalmixTrends.length > 0 && (
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
          </div>
        </div>
      </main>
    </div>
  );
}

