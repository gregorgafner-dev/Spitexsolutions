"use client";

import { useMemo, useState } from "react";
import Navigation from "@/components/admin-szs/cockpit/Navigation";

export default function KleidungPage() {
  const [anzahlMitarbeitende, setAnzahlMitarbeitende] = useState<string>("0");
  const [anteilMaennerPct, setAnteilMaennerPct] = useState<string>("0");
  const [anschaffungspreisProSatz, setAnschaffungspreisProSatz] = useState<string>("0");
  const [saetzeProMitarbeitenden, setSaetzeProMitarbeitenden] = useState<string>("2");
  const [amortisationJahre, setAmortisationJahre] = useState<string>("3");
  const [reinigungskostenProSetProReinigung, setReinigungskostenProSetProReinigung] = useState<string>("0");
  const [anzahlReinigungenProSetProJahr, setAnzahlReinigungenProSetProJahr] = useState<string>("0");

  const parseNum = (raw: string) => {
    const s = String(raw ?? "").trim().replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };

  const result = useMemo(() => {
    const headcount = Math.max(0, Math.floor(parseNum(anzahlMitarbeitende)));
    const menPct = Math.min(100, Math.max(0, parseNum(anteilMaennerPct)));
    const womenPct = 100 - menPct;
    const men = Math.round((headcount * menPct) / 100);
    const women = Math.max(0, headcount - men);
    const setsPerEmployee = Math.max(0, Math.floor(parseNum(saetzeProMitarbeitenden)));
    const amortYears = Math.max(0, parseNum(amortisationJahre));
    const acquisitionPrice = Math.max(0, parseNum(anschaffungspreisProSatz));
    const cleaningCostPerSetPerCleaning = Math.max(0, parseNum(reinigungskostenProSetProReinigung));
    const cleaningsPerSetPerYear = Math.max(0, Math.floor(parseNum(anzahlReinigungenProSetProJahr)));
    const totalSets = headcount * setsPerEmployee;
    const totalInvestment = totalSets * acquisitionPrice;
    const annualAmortizationCost = amortYears > 0 ? totalInvestment / amortYears : 0;
    const annualCleaningCost = totalSets * cleaningCostPerSetPerCleaning * cleaningsPerSetPerYear;
    const annualTotalCost = annualAmortizationCost + annualCleaningCost;
    return {
      headcount,
      menPct,
      womenPct,
      men,
      women,
      setsPerEmployee,
      amortYears,
      totalSets,
      acquisitionPrice,
      totalInvestment,
      cleaningCostPerSetPerCleaning,
      cleaningsPerSetPerYear,
      annualAmortizationCost,
      annualCleaningCost,
      annualTotalCost,
    };
  }, [
    anzahlMitarbeitende,
    anteilMaennerPct,
    saetzeProMitarbeitenden,
    amortisationJahre,
    anschaffungspreisProSatz,
    reinigungskostenProSetProReinigung,
    anzahlReinigungenProSetProJahr,
  ]);

  const fmtNumber = (n: number) =>
    new Intl.NumberFormat("de-CH", { maximumFractionDigits: 2 }).format(n);
  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: "CHF",
      maximumFractionDigits: 2,
    }).format(n);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
            <div className="text-sm font-semibold text-gray-900">Kleidung</div>
            <div className="mt-2 text-sm text-gray-600">
              Eingabemaske für die Basis‑Parameter (Mitarbeitende, Geschlechterverhältnis,
              Anschaffungspreis, Amortisation, Reinigung, Anzahl Sätze pro Mitarbeitenden).
            </div>

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4 items-start">
                  <label className="block">
                    <div className="text-xs font-medium text-gray-700 min-h-[52px] flex items-end leading-4">
                      Anzahl Mitarbeitende
                    </div>
                    <input
                      inputMode="numeric"
                      value={anzahlMitarbeitende}
                      onChange={(e) => setAnzahlMitarbeitende(e.target.value)}
                      className="mt-1 w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-200"
                      placeholder="z.B. 120"
                    />
                    <div className="mt-1 text-[11px] text-gray-500 min-h-[14px]">&nbsp;</div>
                  </label>

                  <label className="block">
                    <div className="text-xs font-medium text-gray-700 min-h-[52px] flex items-end leading-4">
                      Verhältnis Männer (%)
                    </div>
                    <input
                      inputMode="decimal"
                      value={anteilMaennerPct}
                      onChange={(e) => setAnteilMaennerPct(e.target.value)}
                      className="mt-1 w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-200"
                      placeholder="z.B. 25"
                    />
                    <div className="mt-1 text-[11px] text-gray-500 min-h-[14px]">
                      Frauen = {fmtNumber(result.womenPct)}%
                    </div>
                  </label>

                  <label className="block">
                    <div className="text-xs font-medium text-gray-700 min-h-[52px] flex items-end leading-4">
                      Sätze pro Mitarbeitenden
                    </div>
                    <input
                      inputMode="numeric"
                      value={saetzeProMitarbeitenden}
                      onChange={(e) => setSaetzeProMitarbeitenden(e.target.value)}
                      className="mt-1 w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-200"
                      placeholder="z.B. 2"
                    />
                    <div className="mt-1 text-[11px] text-gray-500 min-h-[14px]">&nbsp;</div>
                  </label>

                  <label className="block">
                    <div className="text-xs font-medium text-gray-700 min-h-[52px] flex items-end leading-4">
                      Anschaffungspreis pro Satz (Hose + Shirt) (CHF)
                    </div>
                    <input
                      inputMode="decimal"
                      value={anschaffungspreisProSatz}
                      onChange={(e) => setAnschaffungspreisProSatz(e.target.value)}
                      className="mt-1 w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-200"
                      placeholder="z.B. 120"
                    />
                    <div className="mt-1 text-[11px] text-gray-500 min-h-[14px]">&nbsp;</div>
                  </label>

                  <label className="block">
                    <div className="text-xs font-medium text-gray-700 min-h-[52px] flex items-end leading-4">
                      Amortisation (Jahre)
                    </div>
                    <input
                      inputMode="numeric"
                      value={amortisationJahre}
                      onChange={(e) => setAmortisationJahre(e.target.value)}
                      className="mt-1 w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-200"
                      placeholder="z.B. 3"
                    />
                    <div className="mt-1 text-[11px] text-gray-500 min-h-[14px]">&nbsp;</div>
                  </label>

                  <label className="block">
                    <div className="text-xs font-medium text-gray-700 min-h-[52px] flex items-end leading-4">
                      Kosten pro Kleidungsset pro Reinigung (CHF)
                    </div>
                    <input
                      inputMode="decimal"
                      value={reinigungskostenProSetProReinigung}
                      onChange={(e) => setReinigungskostenProSetProReinigung(e.target.value)}
                      className="mt-1 w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-200"
                      placeholder="z.B. 6.50"
                    />
                    <div className="mt-1 text-[11px] text-gray-500 min-h-[14px]">&nbsp;</div>
                  </label>

                  <label className="block">
                    <div className="text-xs font-medium text-gray-700 min-h-[52px] flex items-end leading-4">
                      Anzahl Reinigungen pro Set pro Jahr
                    </div>
                    <input
                      inputMode="numeric"
                      value={anzahlReinigungenProSetProJahr}
                      onChange={(e) => setAnzahlReinigungenProSetProJahr(e.target.value)}
                      className="mt-1 w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-200"
                      placeholder="z.B. 20"
                    />
                    <div className="mt-1 text-[11px] text-gray-500 min-h-[14px]">&nbsp;</div>
                  </label>
                </div>
              </div>

              <div className="lg:col-span-1">
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <div className="text-xs font-semibold text-rose-900">Ergebnis</div>
                  <div className="mt-3">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                      <div className="text-gray-600">Mitarbeitende</div>
                      <div className="text-right font-medium tabular-nums text-gray-900 whitespace-nowrap">
                        {fmtNumber(result.headcount)}
                      </div>

                      <div className="text-gray-600">Männer / Frauen</div>
                      <div className="text-right font-medium tabular-nums text-gray-900 whitespace-nowrap">
                        {fmtNumber(result.men)} / {fmtNumber(result.women)}
                      </div>

                      <div className="text-gray-600">Sätze / MA</div>
                      <div className="text-right font-medium tabular-nums text-gray-900 whitespace-nowrap">
                        {fmtNumber(result.setsPerEmployee)}
                      </div>

                      <div className="text-gray-600">Total Sätze</div>
                      <div className="text-right font-medium tabular-nums text-gray-900 whitespace-nowrap">
                        {fmtNumber(result.totalSets)}
                      </div>

                      <div className="text-gray-600">Anschaffungspreis / Satz</div>
                      <div className="text-right font-medium tabular-nums text-gray-900 whitespace-nowrap">
                        {fmtMoney(result.acquisitionPrice)}
                      </div>

                      <div className="text-gray-600">Amortisation</div>
                      <div className="text-right font-medium tabular-nums text-gray-900 whitespace-nowrap">
                        {result.amortYears > 0 ? `${fmtNumber(result.amortYears)} J` : "—"}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-rose-200">
                      <div className="text-xs font-semibold text-rose-900">Kostenaufstellung</div>
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                        <div className="text-gray-700">Anschaffung (einmalig)</div>
                        <div className="text-right font-semibold tabular-nums text-gray-900 whitespace-nowrap">
                          {fmtMoney(result.totalInvestment)}
                        </div>

                        <div className="text-gray-700">Amortisation / Jahr</div>
                        <div className="text-right font-medium tabular-nums text-gray-900 whitespace-nowrap">
                          {fmtMoney(result.annualAmortizationCost)}
                        </div>

                        <div className="text-gray-700">Reinigung / Jahr</div>
                        <div className="text-right font-medium tabular-nums text-gray-900 whitespace-nowrap">
                          {fmtMoney(result.annualCleaningCost)}
                        </div>

                        <div className="text-gray-700 font-semibold">Total Kosten / Jahr</div>
                        <div className="text-right font-semibold tabular-nums text-gray-900 whitespace-nowrap">
                          {fmtMoney(result.annualTotalCost)}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 text-[11px] text-rose-900/70">
                    Hinweis: Total Investition = Mitarbeitende × Sätze/MA × Anschaffungspreis pro Satz.
                    Reinigung/Jahr = Total Sätze × Kosten/Set/Reinigung × Reinigungen/Set/Jahr.
                    Total Kosten/Jahr = (Total Investition ÷ Amortisation) + Reinigung/Jahr.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

