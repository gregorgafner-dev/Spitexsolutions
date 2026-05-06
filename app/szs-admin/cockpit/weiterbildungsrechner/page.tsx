"use client";

import Navigation from "@/components/admin-szs/cockpit/Navigation";
import { useMemo, useState } from "react";

export default function WeiterbildungsrechnerPage() {
  type Nutzen =
    | "angeordnet"
    | "hoch"
    | "mittel"
    | "gering";

  type RueckzahlungEvent =
    | "keine"
    | "abbruch"
    | "kuendigung_ma"
    | "kuendigung_ag_verschulden";

  const [unbefristetUndUngekuendigt, setUnbefristetUndUngekuendigt] = useState(true);
  const [probezeitAbgeschlossen, setProbezeitAbgeschlossen] = useState(true);

  const [nutzen, setNutzen] = useState<Nutzen>("mittel");
  const [geringerPct, setGeringerPct] = useState<0 | 25>(25);

  const [pensumPct, setPensumPct] = useState<number>(80);
  const [kursArbeitstage, setKursArbeitstage] = useState<number>(10);
  const [bereitsBezogeneWeiterbildungstageJahr, setBereitsBezogeneWeiterbildungstageJahr] =
    useState<number>(0);
  const [bereitsBezogeneWeiterbildungstageQuartal, setBereitsBezogeneWeiterbildungstageQuartal] =
    useState<number>(0);

  const [kurskostenChf, setKurskostenChf] = useState<number>(3000);
  const [spesenSchulmaterialChf, setSpesenSchulmaterialChf] = useState<number>(0);

  const [bruttojahreslohnInkl13, setBruttojahreslohnInkl13] = useState<number>(90000);
  const [arbeitstageProJahr, setArbeitstageProJahr] = useState<number>(260);

  const [rueckzahlungEvent, setRueckzahlungEvent] = useState<RueckzahlungEvent>("keine");
  const [monateSeitAbschluss, setMonateSeitAbschluss] = useState<number>(0);
  const [ausnahmeKeinRueckzahlung, setAusnahmeKeinRueckzahlung] = useState<boolean>(false);

  const fmtChf = (n: number) =>
    new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(n);
  const fmt = (n: number) =>
    new Intl.NumberFormat("de-CH", { maximumFractionDigits: 2 }).format(n);

  const results = useMemo(() => {
    const eligible = unbefristetUndUngekuendigt;

    const pctBase =
      nutzen === "angeordnet"
        ? 100
        : nutzen === "hoch"
          ? 75
          : nutzen === "mittel"
            ? 50
            : geringerPct; // 0–25% laut Weisung, hier als Auswahl 0/25

    const pctAllowedByProbezeit =
      (nutzen === "mittel" || nutzen === "gering") && !probezeitAbgeschlossen ? 0 : pctBase;

    // Weiterbildungstage: PDF sagt max 40 Tage/Jahr bei 100%.
    // Die Tabelle im PDF ist in der PDF-Textkonvertierung uneindeutig; wir rechnen daher proportional zum Pensum.
    const maxTageJahr = Math.round((40 * Math.max(0, Math.min(100, pensumPct))) / 100);
    const maxTageProQuartal = maxTageJahr / 2;

    const plannedTage = Math.max(0, kursArbeitstage);
    const totalTageJahr = bereitsBezogeneWeiterbildungstageJahr + plannedTage;
    const totalTageQuartal = bereitsBezogeneWeiterbildungstageQuartal + plannedTage;

    const exceedsYear = totalTageJahr > maxTageJahr + 1e-9;
    const exceedsQuarter = totalTageQuartal > maxTageProQuartal + 1e-9;

    // Bezahlte Weiterbildungstage: Weisung §5: bei 80% Pensum übernimmt das Unternehmen 80% der Hälfte der Tage.
    // Verallgemeinert: paidDays = 0.5 * Tage * Pensum%
    const paidDays = plannedTage * 0.5 * (Math.max(0, Math.min(100, pensumPct)) / 100);

    const dayRate =
      arbeitstageProJahr > 0 ? Math.max(0, bruttojahreslohnInkl13) / arbeitstageProJahr : 0;
    const paidDaysChf = paidDays * dayRate;

    const totalKursKosten = Math.max(0, kurskostenChf) + Math.max(0, spesenSchulmaterialChf);
    const employerKostenBeteiligungChf = eligible ? (totalKursKosten * pctAllowedByProbezeit) / 100 : 0;
    const employeeKostenChf = Math.max(0, totalKursKosten - employerKostenBeteiligungChf);

    const employerTotalInvestment = employerKostenBeteiligungChf + (eligible ? paidDaysChf : 0);

    const repayBand =
      employerTotalInvestment <= 2000
        ? { months: 0, monthlyReduction: 0 }
        : employerTotalInvestment <= 5000
          ? { months: 12, monthlyReduction: 1 / 12 }
          : employerTotalInvestment <= 10000
            ? { months: 24, monthlyReduction: 1 / 24 }
            : { months: 36, monthlyReduction: 1 / 36 };

    let repayable = 0;
    let repayReason: string | null = null;

    if (!eligible) {
      repayable = 0;
      repayReason = null;
    } else if (ausnahmeKeinRueckzahlung) {
      repayable = 0;
      repayReason =
        "Spezialfall (z.B. Krankheit/Unfall/Mutterschaft) – Rückzahlung kann ganz/teilweise entfallen.";
    } else if (repayBand.months === 0) {
      repayable = 0;
      repayReason = "Beiträge ≤ CHF 2’000 – gemäss Weisung keine Rückzahlungsverpflichtung.";
    } else if (rueckzahlungEvent === "abbruch") {
      repayable = employerTotalInvestment;
      repayReason = "Abbruch der Aus-/Weiterbildung → Rückzahlung der vergüteten Kosten + bezahlter Urlaub.";
    } else if (
      rueckzahlungEvent === "kuendigung_ma" ||
      rueckzahlungEvent === "kuendigung_ag_verschulden"
    ) {
      const m = Math.max(0, Math.min(repayBand.months, Math.floor(monateSeitAbschluss)));
      const remaining = Math.max(0, repayBand.months - m);
      repayable = (employerTotalInvestment * remaining) / repayBand.months;
      repayReason =
        "Kündigung (MA oder AG wegen Verschulden) innerhalb Verpflichtungsdauer → linearer Abbau pro Monat.";
    }

    return {
      eligible,
      pctAllowedByProbezeit,
      maxTageJahr,
      maxTageProQuartal,
      exceedsYear,
      exceedsQuarter,
      paidDays,
      paidDaysChf,
      totalKursKosten,
      employerKostenBeteiligungChf,
      employeeKostenChf,
      employerTotalInvestment,
      repayBand,
      repayable,
      repayReason,
    };
  }, [
    unbefristetUndUngekuendigt,
    probezeitAbgeschlossen,
    nutzen,
    geringerPct,
    pensumPct,
    kursArbeitstage,
    bereitsBezogeneWeiterbildungstageJahr,
    bereitsBezogeneWeiterbildungstageQuartal,
    kurskostenChf,
    spesenSchulmaterialChf,
    bruttojahreslohnInkl13,
    arbeitstageProJahr,
    rueckzahlungEvent,
    monateSeitAbschluss,
    ausnahmeKeinRueckzahlung,
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-gray-900">Weiterbildungsrechner</h1>
          <p className="text-sm text-gray-600 mt-1">
            Abfragemaske gemäss „C04_RL Weisung Aus- und Weiterbildung“ (01.07.2017).
          </p>

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
              <div className="text-sm font-semibold text-gray-900 mb-3">Eingaben</div>

              <div className="space-y-5">
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-2">Voraussetzungen</div>
                  <label className="flex items-center gap-2 text-sm text-gray-800">
                    <input
                      type="checkbox"
                      checked={unbefristetUndUngekuendigt}
                      onChange={(e) => setUnbefristetUndUngekuendigt(e.target.checked)}
                    />
                    Unbefristet & ungekündigt (Pflicht)
                  </label>
                  <label className="mt-2 flex items-center gap-2 text-sm text-gray-800">
                    <input
                      type="checkbox"
                      checked={probezeitAbgeschlossen}
                      onChange={(e) => setProbezeitAbgeschlossen(e.target.checked)}
                    />
                    Probezeit erfolgreich abgeschlossen (Bedingung für 50% / 0–25%)
                  </label>
                </div>

                <div>
                  <div className="text-xs font-medium text-gray-600 mb-2">Kostenbeteiligung Arbeitgeber (Nutzen)</div>
                  <select
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    value={nutzen}
                    onChange={(e) => setNutzen(e.target.value as Nutzen)}
                  >
                    <option value="angeordnet">Angeordnet (100%)</option>
                    <option value="hoch">Hoher Nutzen (75%)</option>
                    <option value="mittel">Mittlerer Nutzen (50%)</option>
                    <option value="gering">Geringer Nutzen (0–25%)</option>
                  </select>
                  {nutzen === "gering" ? (
                    <div className="mt-2 flex items-center gap-3 text-sm">
                      <span className="text-gray-600">Auswahl (0–25%):</span>
                      <label className="inline-flex items-center gap-1">
                        <input
                          type="radio"
                          name="geringPct"
                          checked={geringerPct === 0}
                          onChange={() => setGeringerPct(0)}
                        />
                        0%
                      </label>
                      <label className="inline-flex items-center gap-1">
                        <input
                          type="radio"
                          name="geringPct"
                          checked={geringerPct === 25}
                          onChange={() => setGeringerPct(25)}
                        />
                        25%
                      </label>
                    </div>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-medium text-gray-600 mb-1">Pensum (%)</div>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={pensumPct}
                      onChange={(e) => setPensumPct(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-600 mb-1">Kurszeit (Arbeitstage)</div>
                    <input
                      type="number"
                      min={0}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={kursArbeitstage}
                      onChange={(e) => setKursArbeitstage(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-medium text-gray-600 mb-1">Bereits bezogene Weiterbildungstage (Jahr)</div>
                    <input
                      type="number"
                      min={0}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={bereitsBezogeneWeiterbildungstageJahr}
                      onChange={(e) => setBereitsBezogeneWeiterbildungstageJahr(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-600 mb-1">Bereits bezogene Weiterbildungstage (Quartal)</div>
                    <input
                      type="number"
                      min={0}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={bereitsBezogeneWeiterbildungstageQuartal}
                      onChange={(e) => setBereitsBezogeneWeiterbildungstageQuartal(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-medium text-gray-600 mb-1">Kurskosten (CHF)</div>
                    <input
                      type="number"
                      min={0}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={kurskostenChf}
                      onChange={(e) => setKurskostenChf(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-600 mb-1">Spesen Schulmaterial (CHF)</div>
                    <input
                      type="number"
                      min={0}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={spesenSchulmaterialChf}
                      onChange={(e) => setSpesenSchulmaterialChf(Number(e.target.value))}
                    />
                    <div className="mt-1 text-[11px] text-gray-500">
                      Reise/Verpflegung/Unterkunft sind gemäss Weisung nicht enthalten.
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-medium text-gray-600 mb-1">Bruttojahresgehalt inkl. 13. (CHF)</div>
                    <input
                      type="number"
                      min={0}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={bruttojahreslohnInkl13}
                      onChange={(e) => setBruttojahreslohnInkl13(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-600 mb-1">Arbeitstage pro Jahr (Annahme)</div>
                    <input
                      type="number"
                      min={1}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={arbeitstageProJahr}
                      onChange={(e) => setArbeitstageProJahr(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-gray-600 mb-2">Rückzahlung (Simulation)</div>
                  <select
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    value={rueckzahlungEvent}
                    onChange={(e) => setRueckzahlungEvent(e.target.value as RueckzahlungEvent)}
                  >
                    <option value="keine">Kein Rückzahlungsfall</option>
                    <option value="abbruch">Abbruch der Aus-/Weiterbildung</option>
                    <option value="kuendigung_ma">Kündigung durch Mitarbeitende (nach Abschluss)</option>
                    <option value="kuendigung_ag_verschulden">Kündigung durch Arbeitgeber (Verschulden, nach Abschluss)</option>
                  </select>

                  {rueckzahlungEvent === "kuendigung_ma" || rueckzahlungEvent === "kuendigung_ag_verschulden" ? (
                    <div className="mt-2">
                      <div className="text-xs font-medium text-gray-600 mb-1">Monate seit Abschluss</div>
                      <input
                        type="number"
                        min={0}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                        value={monateSeitAbschluss}
                        onChange={(e) => setMonateSeitAbschluss(Number(e.target.value))}
                      />
                    </div>
                  ) : null}

                  <label className="mt-2 flex items-center gap-2 text-sm text-gray-800">
                    <input
                      type="checkbox"
                      checked={ausnahmeKeinRueckzahlung}
                      onChange={(e) => setAusnahmeKeinRueckzahlung(e.target.checked)}
                    />
                    Spezialfall (Krankheit/Unfall/Mutterschaft etc.) → Rückzahlung kann entfallen
                  </label>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
              <div className="text-sm font-semibold text-gray-900 mb-3">Resultat</div>

              {!results.eligible ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <div className="font-semibold">Nicht erfüllt</div>
                  <div className="mt-1">
                    Voraussetzung gemäss Weisung: unbefristetes und ungekündigtes Arbeitsverhältnis.
                  </div>
                </div>
              ) : null}

              {(results.exceedsYear || results.exceedsQuarter) && results.eligible ? (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <div className="font-semibold">Hinweis Weiterbildungstage</div>
                  <ul className="mt-1 list-disc pl-5">
                    {results.exceedsYear ? (
                      <li>
                        Jahresmaximum überschritten: geplant + bezogen &gt; {results.maxTageJahr} Tage.
                      </li>
                    ) : null}
                    {results.exceedsQuarter ? (
                      <li>
                        Quartalsmaximum überschritten: max. Hälfte/Jahr pro Quartal (≤ {fmt(results.maxTageProQuartal)}).
                      </li>
                    ) : null}
                  </ul>
                </div>
              ) : null}

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs text-gray-500 mb-1">Kostenbeteiligung (Richtwert)</div>
                  <div className="text-2xl font-semibold text-gray-900 tabular-nums">
                    {results.pctAllowedByProbezeit}%
                  </div>
                  {(nutzen === "mittel" || nutzen === "gering") && !probezeitAbgeschlossen ? (
                    <div className="mt-1 text-xs text-gray-600">
                      Probezeit nicht abgeschlossen → 50%/0–25% nicht zulässig (gesetzt auf 0%).
                    </div>
                  ) : null}
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs text-gray-500 mb-1">Max. Weiterbildungstage / Jahr</div>
                  <div className="text-2xl font-semibold text-gray-900 tabular-nums">
                    {results.maxTageJahr}
                  </div>
                  <div className="mt-1 text-xs text-gray-600">
                    Quartal: max. {fmt(results.maxTageProQuartal)} Tage (Hälfte des Jahresmaximums)
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-gray-200 p-4">
                <div className="text-sm font-semibold text-gray-900">Kostenübersicht</div>
                <div className="mt-2 space-y-1 text-sm text-gray-800">
                  <div className="flex items-center justify-between">
                    <span>Total Kurskosten (inkl. Schulmaterial)</span>
                    <span className="font-mono">{fmtChf(results.totalKursKosten)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>AG‑Anteil Kurskosten</span>
                    <span className="font-mono">{fmtChf(results.employerKostenBeteiligungChf)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>MA‑Anteil Kurskosten</span>
                    <span className="font-mono">{fmtChf(results.employeeKostenChf)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-gray-200 p-4">
                <div className="text-sm font-semibold text-gray-900">Bezahlte Weiterbildungstage</div>
                <div className="mt-2 space-y-1 text-sm text-gray-800">
                  <div className="flex items-center justify-between">
                    <span>Bezahlte Tage (Faustregel gemäss Weisung §5)</span>
                    <span className="font-mono">{fmt(results.paidDays)} Tage</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Gegenwert in CHF (über Lohnabrechnung)</span>
                    <span className="font-mono">{fmtChf(results.paidDaysChf)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-gray-200 p-4">
                <div className="text-sm font-semibold text-gray-900">Rückzahlungsverpflichtung</div>
                <div className="mt-2 text-sm text-gray-800">
                  <div className="flex items-center justify-between">
                    <span>AG‑Investition (Kurskosten + bez. Tage)</span>
                    <span className="font-mono">{fmtChf(results.employerTotalInvestment)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span>Dauer gemäss Tabelle</span>
                    <span className="font-mono">
                      {results.repayBand.months === 0 ? "—" : `${results.repayBand.months} Monate`}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span>Rückzahlbarer Betrag (Simulation)</span>
                    <span className="font-mono">{fmtChf(results.repayable)}</span>
                  </div>
                  {results.repayReason ? (
                    <div className="mt-2 text-xs text-gray-600">{results.repayReason}</div>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 text-xs text-gray-500">
                Hinweis: Die Weisung sagt explizit, dass die Beteiligung im Ermessen des Arbeitgebers liegt. Dieses Tool zeigt Richtwerte & Rechenhilfen.
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

