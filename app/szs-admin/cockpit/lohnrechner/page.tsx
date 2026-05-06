"use client";

import Navigation from "@/components/admin-szs/cockpit/Navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

// #region Typen
type LohnartType = "stundenlohn" | "monatslohn";
type ZusatzdiplomArtType = "" | "wundexperte" | "vergleichbar";
type JaNeinType = "ja" | "nein";

type FunktionKey =
  | "dipl_hf"
  | "dipl_hf_fallfuehrung"
  | "dipl_hf_psychiatrie"
  | "pflegeexperte"
  | "einsatzplaner"
  | "ags"
  | "fage"
  | "srk"
  | "teamleitung"
  | "administration"
  | "hauswirtschaft"
  | "betreuung";

type AusbildungKey = "" | "dipl_hf" | "fage" | "srk" | "ohne";

type LohnrechnerForm = {
  lohnart: LohnartType;
  funktion: FunktionKey | "";
  erfahrungInPflege: JaNeinType;
  jahreAufFunktion: number;
  jahreTieferAusgelernt: number;
  jahreTieferInAusbildung: number;
  spitexErfahrung: JaNeinType;
  ausserhalbErfahrungJahre: number;
  ausbildung: AusbildungKey;
  pensumProzent: number;
  zusatzdiplom: JaNeinType;
  zusatzdiplomArt: ZusatzdiplomArtType;
};

type Lohntabelle = {
  meta: { year: number; sourceUrl: string; classes: string[]; rowCount: number };
  rows: { stufe: string; values: Array<number | null> }[];
};

type StundenlohnAufteilung = {
  grundlohn: number;
  ferien: number;
  feiertage: number;
  dreizehnter: number;
  total: number;
};
// #endregion

// #region Konstanten
const FUNKTION_KLASSE: Record<Exclude<FunktionKey, "betreuung">, number> = {
  dipl_hf: 14,
  dipl_hf_fallfuehrung: 14,
  dipl_hf_psychiatrie: 14,
  pflegeexperte: 15,
  einsatzplaner: 13,
  ags: 11,
  fage: 12,
  srk: 10,
  teamleitung: 17,
  administration: 14,
  hauswirtschaft: 9,
};

const FUNKTION_LABEL: Record<FunktionKey, string> = {
  dipl_hf: "Dipl. Pflege HF",
  dipl_hf_fallfuehrung: "Dipl. Pflege HF mit Fallführung",
  dipl_hf_psychiatrie: "Dipl. Pflege HF Psychiatrie",
  pflegeexperte: "Pflegeexperte/in",
  einsatzplaner: "Einsatzplaner/in",
  ags: "AGS",
  fage: "FaGe (gilt auch für DNI)",
  srk: "SRK",
  teamleitung: "Teamleitung",
  administration: "Administration",
  hauswirtschaft: "Hauswirtschaft",
  betreuung: "Betreuung",
};

const AUSBILDUNG_LABEL: Record<AusbildungKey, string> = {
  "": "—",
  dipl_hf: "Dipl. Pflege HF",
  fage: "FaGe",
  srk: "SRK",
  ohne: "Ohne Ausbildung",
};

const ZUSATZDIPLOM_LABEL: Record<ZusatzdiplomArtType, string> = {
  "": "—",
  wundexperte: "Wundexperte",
  vergleichbar: "Andere vergleichbare Zusatzausbildung (Niveau CAS)",
};

/** Stufen-Bonus pro Einflussfaktor (siehe Spec). */
const BONUS_JAHR_AUF_FUNKTION = 1;
const MAX_JAHRE_AUF_FUNKTION_VOLLER_BONUS = 10;
const BONUS_JAHR_AUF_FUNKTION_UEBER_MAX = 0.25;
const BONUS_JAHR_TIEFER_AUSGELERNT = 0.5;
const BONUS_JAHR_TIEFER_AUSBILDUNG = 0.25;
const BONUS_SPITEX_ERFAHRUNG = 2;
const BONUS_AUSSERHALBJAHR = 0.25;
const BONUS_WUNDEXPERTE = 2;
const BONUS_CAS_VERGLEICHBAR = 2;

/** Bandbreite: ±2 Stufen. */
const BAND_BREITE_STUFEN = 2;

/** Spezialfall Betreuung: fixer Bruttostundenlohn (CHF). */
const BETREUUNG_STUNDENLOHN_CHF = 34;

/** Lohntabelle Kanton ZH liefert Jahreslöhne inkl. 13. Monatslohn. */
const MONATE_PRO_JAHR = 12;

/** Annahmen für Stundenlohn-Berechnung (transparent im UI ausgewiesen). */
const VOLLZEIT_JAHRESSTUNDEN = 2080;
const FERIEN_ZULAGE_PCT = 10.64;
const FEIERTAGE_ZULAGE_PCT = 3.5;
const DREIZEHNTER_ML_ZULAGE_PCT = 8.33;
// #endregion

// #region Helpers
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatChf(n: number, fractionDigits = 0): string {
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n);
}

function formatStufe(n: number): string {
  return new Intl.NumberFormat("de-CH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

function getKlasseForFunktion(funktion: FunktionKey | ""): number | null {
  if (!funktion || funktion === "betreuung") return null;
  return FUNKTION_KLASSE[funktion as Exclude<FunktionKey, "betreuung">] ?? null;
}

function getJahreslohn(
  table: Lohntabelle,
  klasse: number,
  stufe: number
): number | null {
  if (!table?.rows?.length) return null;
  const klasseStr = String(klasse).padStart(2, "0");
  const colIdx = table.meta.classes.findIndex((c) => c === klasseStr);
  if (colIdx < 0) return null;

  const stufeRange = table.rows
    .map((r) => Number(r.stufe.replace(/[^0-9.]/g, "")))
    .filter((n) => Number.isFinite(n));
  if (!stufeRange.length) return null;
  const minLs = Math.min(...stufeRange);
  const maxLs = Math.max(...stufeRange);
  const clamped = clamp(stufe, minLs, maxLs);
  const lower = Math.floor(clamped);
  const upper = Math.ceil(clamped);
  const frac = clamped - lower;

  const findRow = (ls: number) =>
    table.rows.find((r) => Number(r.stufe.replace(/[^0-9.]/g, "")) === ls);

  const lowerRow = findRow(lower);
  const upperRow = findRow(upper);
  if (!lowerRow || !upperRow) return null;
  const lowerVal = lowerRow.values[colIdx];
  const upperVal = upperRow.values[colIdx];
  if (typeof lowerVal !== "number" || typeof upperVal !== "number") return null;

  return lowerVal * (1 - frac) + upperVal * frac;
}

function getStufenRange(table: Lohntabelle | null): { min: number; max: number } {
  if (!table?.rows?.length) return { min: 1, max: 29 };
  const stufenZahlen = table.rows
    .map((r) => Number(r.stufe.replace(/[^0-9.]/g, "")))
    .filter((n) => Number.isFinite(n));
  if (!stufenZahlen.length) return { min: 1, max: 29 };
  return { min: Math.min(...stufenZahlen), max: Math.max(...stufenZahlen) };
}

/** Berechnet die rohe Mittel-Stufe (vor Clamp und vor Floor). */
function computeMittelStufeRaw(form: LohnrechnerForm): number {
  let stufe = 1;

  if (form.erfahrungInPflege === "ja") {
    const jahreVollerBonus = Math.min(
      form.jahreAufFunktion,
      MAX_JAHRE_AUF_FUNKTION_VOLLER_BONUS
    );
    const jahreUeberMax = Math.max(
      0,
      form.jahreAufFunktion - MAX_JAHRE_AUF_FUNKTION_VOLLER_BONUS
    );
    stufe += jahreVollerBonus * BONUS_JAHR_AUF_FUNKTION;
    stufe += jahreUeberMax * BONUS_JAHR_AUF_FUNKTION_UEBER_MAX;
    stufe += form.jahreTieferAusgelernt * BONUS_JAHR_TIEFER_AUSGELERNT;
    stufe += form.jahreTieferInAusbildung * BONUS_JAHR_TIEFER_AUSBILDUNG;
    if (form.spitexErfahrung === "ja") stufe += BONUS_SPITEX_ERFAHRUNG;
  }

  stufe += form.ausserhalbErfahrungJahre * BONUS_AUSSERHALBJAHR;

  if (form.zusatzdiplom === "ja") {
    if (form.zusatzdiplomArt === "wundexperte") stufe += BONUS_WUNDEXPERTE;
    if (form.zusatzdiplomArt === "vergleichbar") stufe += BONUS_CAS_VERGLEICHBAR;
  }

  return stufe;
}

function getAusbildungWarnung(
  funktion: FunktionKey | "",
  ausbildung: AusbildungKey
): string | null {
  if (!funktion || !ausbildung) return null;
  const istHF = ausbildung === "dipl_hf";
  const istFaGeOderHoeher = ausbildung === "fage" || istHF;
  const istSrkOderHoeher = ausbildung === "srk" || istFaGeOderHoeher;

  if (
    funktion === "dipl_hf" ||
    funktion === "dipl_hf_fallfuehrung" ||
    funktion === "dipl_hf_psychiatrie" ||
    funktion === "pflegeexperte"
  ) {
    if (!istHF) {
      return "Diese Funktion setzt eine HF-Ausbildung voraus. Bitte Ausbildung prüfen.";
    }
  }
  if (funktion === "fage" && !istFaGeOderHoeher) {
    return "Funktion FaGe / DNI setzt mindestens FaGe-Ausbildung voraus.";
  }
  if (funktion === "srk" && !istSrkOderHoeher) {
    return "Funktion SRK setzt mindestens eine SRK-Pflegehilfe-Ausbildung voraus.";
  }
  return null;
}

function aufteilenStundenlohnFromJahreslohn(
  jahreslohnInkl13: number
): StundenlohnAufteilung {
  const jahreslohnOhne13 = (jahreslohnInkl13 * 12) / 13;
  const grundlohn = jahreslohnOhne13 / VOLLZEIT_JAHRESSTUNDEN;
  const ferien = grundlohn * (FERIEN_ZULAGE_PCT / 100);
  const feiertage = grundlohn * (FEIERTAGE_ZULAGE_PCT / 100);
  const dreizehnter = grundlohn * (DREIZEHNTER_ML_ZULAGE_PCT / 100);
  const total = grundlohn + ferien + feiertage + dreizehnter;
  return { grundlohn, ferien, feiertage, dreizehnter, total };
}

function aufteilenStundenlohnFromBruttoTotal(
  brutto: number
): StundenlohnAufteilung {
  const faktor =
    1 +
    (FERIEN_ZULAGE_PCT + FEIERTAGE_ZULAGE_PCT + DREIZEHNTER_ML_ZULAGE_PCT) /
      100;
  const grundlohn = brutto / faktor;
  const ferien = grundlohn * (FERIEN_ZULAGE_PCT / 100);
  const feiertage = grundlohn * (FEIERTAGE_ZULAGE_PCT / 100);
  const dreizehnter = grundlohn * (DREIZEHNTER_ML_ZULAGE_PCT / 100);
  return { grundlohn, ferien, feiertage, dreizehnter, total: brutto };
}
// #endregion

export default function LohnrechnerPage() {
  const [submitted, setSubmitted] = useState<LohnrechnerForm | null>(null);
  const [lohntabelle, setLohntabelle] = useState<Lohntabelle | null>(null);
  const [tableLoading, setTableLoading] = useState<boolean>(true);
  const [tableError, setTableError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<LohnrechnerForm>({
    defaultValues: {
      lohnart: "monatslohn",
      funktion: "",
      erfahrungInPflege: "nein",
      jahreAufFunktion: 0,
      jahreTieferAusgelernt: 0,
      jahreTieferInAusbildung: 0,
      spitexErfahrung: "nein",
      ausserhalbErfahrungJahre: 0,
      ausbildung: "",
      pensumProzent: 100,
      zusatzdiplom: "nein",
      zusatzdiplomArt: "",
    },
  });

  const zusatzdiplomValue = watch("zusatzdiplom");
  const erfahrungInPflegeValue = watch("erfahrungInPflege");

  useEffect(() => {
    if (zusatzdiplomValue !== "ja") {
      setValue("zusatzdiplomArt", "");
    }
  }, [setValue, zusatzdiplomValue]);

  useEffect(() => {
    if (erfahrungInPflegeValue !== "ja") {
      setValue("jahreAufFunktion", 0);
      setValue("jahreTieferAusgelernt", 0);
      setValue("jahreTieferInAusbildung", 0);
      setValue("spitexErfahrung", "nein");
    }
  }, [setValue, erfahrungInPflegeValue]);

  useEffect(() => {
    let alive = true;
    setTableLoading(true);
    fetch("/api/szs-admin/cockpit/lohntabellen/zh/2025", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const t = await r.text();
          throw new Error(`${r.status} ${r.statusText}: ${t}`);
        }
        return (await r.json()) as Lohntabelle;
      })
      .then((json) => {
        if (!alive) return;
        setLohntabelle(json);
        setTableError(null);
      })
      .catch((e) => {
        if (!alive) return;
        setTableError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (alive) setTableLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const onSubmit = (data: LohnrechnerForm) => {
    setSubmitted(data);
  };

  const result = useMemo(() => {
    if (!submitted) return null;
    const funktion = submitted.funktion as FunktionKey | "";

    if (funktion === "betreuung") {
      const aufteilung = aufteilenStundenlohnFromBruttoTotal(
        BETREUUNG_STUNDENLOHN_CHF
      );
      return { kind: "stundenlohn-fix" as const, aufteilung };
    }

    if (!lohntabelle) return null;
    const klasse = getKlasseForFunktion(funktion);
    if (!klasse) return null;

    const { min: stufeMin, max: stufeMax } = getStufenRange(lohntabelle);
    const mittelRaw = computeMittelStufeRaw(submitted);
    // Erst clampen, dann abrunden auf ganze Lohnstufe
    const mittel = Math.floor(clamp(mittelRaw, stufeMin, stufeMax));
    const min = clamp(mittel - BAND_BREITE_STUFEN, stufeMin, stufeMax);
    const max = clamp(mittel + BAND_BREITE_STUFEN, stufeMin, stufeMax);

    const jahresLohnMin = getJahreslohn(lohntabelle, klasse, min);
    const jahresLohnMittel = getJahreslohn(lohntabelle, klasse, mittel);
    const jahresLohnMax = getJahreslohn(lohntabelle, klasse, max);

    if (submitted.lohnart === "stundenlohn") {
      return {
        kind: "stundenlohn-band" as const,
        klasse,
        stufeMittel: mittel,
        stufeMittelRaw: mittelRaw,
        stufeMin: min,
        stufeMax: max,
        aufMin:
          jahresLohnMin != null
            ? aufteilenStundenlohnFromJahreslohn(jahresLohnMin)
            : null,
        aufMittel:
          jahresLohnMittel != null
            ? aufteilenStundenlohnFromJahreslohn(jahresLohnMittel)
            : null,
        aufMax:
          jahresLohnMax != null
            ? aufteilenStundenlohnFromJahreslohn(jahresLohnMax)
            : null,
      };
    }

    return {
      kind: "monatslohn" as const,
      klasse,
      stufeMittel: mittel,
      stufeMittelRaw: mittelRaw,
      stufeMin: min,
      stufeMax: max,
      jahresLohnMin,
      jahresLohnMittel,
      jahresLohnMax,
      pensumProzent: clamp(submitted.pensumProzent, 0, 100),
    };
  }, [submitted, lohntabelle]);

  const ausbildungsWarnung = useMemo(() => {
    if (!submitted) return null;
    return getAusbildungWarnung(
      submitted.funktion as FunktionKey | "",
      submitted.ausbildung as AusbildungKey
    );
  }, [submitted]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-gray-900">Lohnrechner</h1>
          <p className="text-sm text-gray-600 mt-1">
            Berechnet eine Lohn-Bandbreite (±{BAND_BREITE_STUFEN} Stufen) auf Basis der
            Lohntabelle Kanton Zürich {lohntabelle?.meta?.year ?? "2025"}. Lohnstufen werden
            jeweils abgerundet.
          </p>
          {tableError ? (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              Lohntabelle konnte nicht geladen werden: {tableError}
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Eingaben</h2>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Lohnart
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <label className="flex items-center gap-2 text-sm text-gray-900">
                      <input
                        type="radio"
                        value="stundenlohn"
                        {...register("lohnart", { required: true })}
                      />
                      Stundenlohn
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-900">
                      <input
                        type="radio"
                        value="monatslohn"
                        {...register("lohnart", { required: true })}
                      />
                      Monatslohn
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Funktion
                  </label>
                  <select
                    {...register("funktion", { required: "Funktion ist erforderlich" })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  >
                    <option value="">Bitte wählen…</option>
                    <option value="dipl_hf">Dipl. Pflege HF</option>
                    <option value="dipl_hf_fallfuehrung">Dipl. Pflege HF mit Fallführung</option>
                    <option value="dipl_hf_psychiatrie">Dipl. Pflege HF Psychiatrie</option>
                    <option value="pflegeexperte">Pflegeexperte/in</option>
                    <option value="einsatzplaner">Einsatzplaner/in</option>
                    <option value="ags">AGS</option>
                    <option value="fage">FaGe (gilt auch für DNI)</option>
                    <option value="srk">SRK</option>
                    <option value="teamleitung">Teamleitung</option>
                    <option value="administration">Administration</option>
                    <option value="hauswirtschaft">Hauswirtschaft</option>
                    <option value="betreuung">Betreuung</option>
                  </select>
                  {errors.funktion && (
                    <p className="text-red-500 text-sm mt-1">{errors.funktion.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Erfahrung in der Pflege
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3 mb-3">
                    <label className="flex items-center gap-2 text-sm text-gray-900">
                      <input
                        type="radio"
                        value="nein"
                        {...register("erfahrungInPflege", { required: true })}
                      />
                      Keine Erfahrung
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-900">
                      <input
                        type="radio"
                        value="ja"
                        {...register("erfahrungInPflege", { required: true })}
                      />
                      Erfahrung vorhanden
                    </label>
                  </div>

                  {erfahrungInPflegeValue === "ja" && (
                    <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3">
                      <div>
                        <label className="block text-sm text-gray-900 mb-1">
                          Anzahl Jahre auf der Funktion
                        </label>
                        <input
                          type="number"
                          step="1"
                          min={0}
                          max={60}
                          {...register("jahreAufFunktion", {
                            valueAsNumber: true,
                            required: "Bitte Jahre eingeben",
                            min: { value: 0, message: "Jahre müssen ≥ 0 sein" },
                            max: { value: 60, message: "Bitte einen plausiblen Wert eingeben" },
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                          placeholder="z. B. 5"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          + {BONUS_JAHR_AUF_FUNKTION} Stufe pro Jahr bis{" "}
                          {MAX_JAHRE_AUF_FUNKTION_VOLLER_BONUS} Jahre, danach +{" "}
                          {BONUS_JAHR_AUF_FUNKTION_UEBER_MAX} pro Jahr.
                        </p>
                        {errors.jahreAufFunktion?.message ? (
                          <p className="text-red-500 text-sm mt-1">
                            {errors.jahreAufFunktion.message}
                          </p>
                        ) : null}
                      </div>

                      <div>
                        <label className="block text-sm text-gray-900 mb-1">
                          Anzahl Jahre in einer tieferen Funktion oder Ausbildung – ausgelernt
                        </label>
                        <input
                          type="number"
                          step="1"
                          min={0}
                          max={60}
                          {...register("jahreTieferAusgelernt", {
                            valueAsNumber: true,
                            required: "Bitte Jahre eingeben",
                            min: { value: 0, message: "Jahre müssen ≥ 0 sein" },
                            max: { value: 60, message: "Bitte einen plausiblen Wert eingeben" },
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                          placeholder="z. B. 2"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          + {BONUS_JAHR_TIEFER_AUSGELERNT} Stufen pro Jahr.
                        </p>
                        {errors.jahreTieferAusgelernt?.message ? (
                          <p className="text-red-500 text-sm mt-1">
                            {errors.jahreTieferAusgelernt.message}
                          </p>
                        ) : null}
                      </div>

                      <div>
                        <label className="block text-sm text-gray-900 mb-1">
                          Anzahl Jahre in einer tieferen Funktion oder Ausbildung – in Ausbildung
                        </label>
                        <input
                          type="number"
                          step="1"
                          min={0}
                          max={60}
                          {...register("jahreTieferInAusbildung", {
                            valueAsNumber: true,
                            required: "Bitte Jahre eingeben",
                            min: { value: 0, message: "Jahre müssen ≥ 0 sein" },
                            max: { value: 60, message: "Bitte einen plausiblen Wert eingeben" },
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                          placeholder="z. B. 3"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          + {BONUS_JAHR_TIEFER_AUSBILDUNG} Stufen pro Jahr.
                        </p>
                        {errors.jahreTieferInAusbildung?.message ? (
                          <p className="text-red-500 text-sm mt-1">
                            {errors.jahreTieferInAusbildung.message}
                          </p>
                        ) : null}
                      </div>

                      <div>
                        <label className="block text-sm text-gray-900 mb-1">
                          Davon Berufserfahrung in der Spitex
                        </label>
                        <div className="flex gap-3">
                          <label className="flex items-center gap-2 text-sm text-gray-900">
                            <input
                              type="radio"
                              value="ja"
                              {...register("spitexErfahrung")}
                            />
                            Ja
                          </label>
                          <label className="flex items-center gap-2 text-sm text-gray-900">
                            <input
                              type="radio"
                              value="nein"
                              {...register("spitexErfahrung")}
                            />
                            Nein
                          </label>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          Bei „Ja&ldquo; + {BONUS_SPITEX_ERFAHRUNG} Stufen.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Berufserfahrung ausserhalb der Pflege (Jahre)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min={0}
                    max={60}
                    {...register("ausserhalbErfahrungJahre", {
                      valueAsNumber: true,
                      required: "Bitte Berufserfahrung ausserhalb der Pflege eingeben",
                      min: { value: 0, message: "Jahre müssen ≥ 0 sein" },
                      max: { value: 60, message: "Bitte einen plausiblen Wert eingeben" },
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    placeholder="z. B. 3"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    + {BONUS_AUSSERHALBJAHR} Stufen pro Jahr.
                  </p>
                  {errors.ausserhalbErfahrungJahre?.message ? (
                    <p className="text-red-500 text-sm mt-1">
                      {errors.ausserhalbErfahrungJahre.message}
                    </p>
                  ) : null}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ausbildung <span className="text-xs text-gray-500">(Plausibilisierung)</span>
                  </label>
                  <select
                    {...register("ausbildung", { required: "Ausbildung ist erforderlich" })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  >
                    <option value="">Bitte wählen…</option>
                    <option value="dipl_hf">Dipl. Pflege HF</option>
                    <option value="fage">FaGe</option>
                    <option value="srk">SRK</option>
                    <option value="ohne">Ohne Ausbildung</option>
                  </select>
                  {errors.ausbildung && (
                    <p className="text-red-500 text-sm mt-1">{errors.ausbildung.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pensum (%)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min={0}
                    max={100}
                    {...register("pensumProzent", {
                      valueAsNumber: true,
                      required: "Pensum ist erforderlich",
                      min: { value: 0, message: "Pensum muss ≥ 0 sein" },
                      max: { value: 100, message: "Pensum muss ≤ 100 sein" },
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Im Stundenlohn-Modus ohne Einfluss auf den Stundensatz.
                  </p>
                  {errors.pensumProzent && (
                    <p className="text-red-500 text-sm mt-1">{errors.pensumProzent.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Funktionsrelevantes Zusatzdiplom
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <label className="flex items-center gap-2 text-sm text-gray-900">
                      <input
                        type="radio"
                        value="ja"
                        {...register("zusatzdiplom", { required: true })}
                      />
                      Ja
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-900">
                      <input
                        type="radio"
                        value="nein"
                        {...register("zusatzdiplom", { required: true })}
                      />
                      Nein
                    </label>
                  </div>
                </div>

                {zusatzdiplomValue === "ja" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Zusatzdiplom (Art)
                    </label>
                    <select
                      {...register("zusatzdiplomArt", {
                        validate: (v) =>
                          zusatzdiplomValue === "ja"
                            ? Boolean(v) || "Bitte Zusatzdiplom auswählen"
                            : true,
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                    >
                      <option value="">Bitte wählen…</option>
                      <option value="wundexperte">Wundexperte</option>
                      <option value="vergleichbar">
                        Andere vergleichbare Zusatzausbildung (Niveau CAS)
                      </option>
                    </select>
                    {errors.zusatzdiplomArt && (
                      <p className="text-red-500 text-sm mt-1">
                        {errors.zusatzdiplomArt.message}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={tableLoading}
                    className="flex-1 bg-teal-600 text-white py-2 px-4 rounded-md hover:bg-teal-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {tableLoading ? "Lohntabelle lädt…" : "Berechnen"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      reset();
                      setSubmitted(null);
                    }}
                    className="flex-1 bg-gray-100 text-gray-900 py-2 px-4 rounded-md hover:bg-gray-200 transition border border-gray-200"
                  >
                    Zurücksetzen
                  </button>
                </div>
              </form>
            </div>

            <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Resultat</h2>
              {!submitted ? (
                <p className="text-sm text-gray-600">
                  Bitte Eingaben erfassen und auf <span className="font-medium">Berechnen</span>{" "}
                  klicken.
                </p>
              ) : result?.kind === "stundenlohn-fix" ? (
                <StundenlohnFixResultat
                  aufteilung={result.aufteilung}
                  warnung={ausbildungsWarnung}
                  submitted={submitted}
                />
              ) : result?.kind === "stundenlohn-band" ? (
                <StundenlohnBandResultat
                  klasse={result.klasse}
                  stufeMittel={result.stufeMittel}
                  stufeMittelRaw={result.stufeMittelRaw}
                  stufeMin={result.stufeMin}
                  stufeMax={result.stufeMax}
                  aufMin={result.aufMin}
                  aufMittel={result.aufMittel}
                  aufMax={result.aufMax}
                  warnung={ausbildungsWarnung}
                  submitted={submitted}
                />
              ) : result?.kind === "monatslohn" ? (
                <BandbreitenResultat
                  klasse={result.klasse}
                  stufeMittel={result.stufeMittel}
                  stufeMittelRaw={result.stufeMittelRaw}
                  stufeMin={result.stufeMin}
                  stufeMax={result.stufeMax}
                  jahresLohnMin={result.jahresLohnMin}
                  jahresLohnMittel={result.jahresLohnMittel}
                  jahresLohnMax={result.jahresLohnMax}
                  pensumProzent={result.pensumProzent}
                  submitted={submitted}
                  warnung={ausbildungsWarnung}
                />
              ) : (
                <p className="text-sm text-gray-600">
                  Lohntabelle wird geladen oder Funktion ist nicht zugeordnet.
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// #region Result-Komponenten
function ZeileLabelWert({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-medium text-gray-900">{value}</div>
    </div>
  );
}

function EingabenZusammenfassung({ submitted }: { submitted: LohnrechnerForm }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
      <ZeileLabelWert
        label="Funktion"
        value={FUNKTION_LABEL[submitted.funktion as FunktionKey] || submitted.funktion || "—"}
      />
      <ZeileLabelWert
        label="Lohnart"
        value={submitted.lohnart === "stundenlohn" ? "Stundenlohn" : "Monatslohn"}
      />
      <ZeileLabelWert
        label="Ausbildung"
        value={AUSBILDUNG_LABEL[submitted.ausbildung as AusbildungKey] ?? submitted.ausbildung}
      />
      <ZeileLabelWert
        label="Erfahrung in der Pflege"
        value={submitted.erfahrungInPflege === "ja" ? "Vorhanden" : "Keine Erfahrung"}
      />
      {submitted.erfahrungInPflege === "ja" ? (
        <>
          <ZeileLabelWert
            label="Jahre auf Funktion"
            value={`${submitted.jahreAufFunktion} Jahre`}
          />
          <ZeileLabelWert
            label="Tiefere Funktion (ausgelernt)"
            value={`${submitted.jahreTieferAusgelernt} Jahre`}
          />
          <ZeileLabelWert
            label="Tiefere Funktion (in Ausbildung)"
            value={`${submitted.jahreTieferInAusbildung} Jahre`}
          />
          <ZeileLabelWert
            label="Davon Spitex-Erfahrung"
            value={submitted.spitexErfahrung === "ja" ? "Ja" : "Nein"}
          />
        </>
      ) : null}
      <ZeileLabelWert
        label="Berufserfahrung ausserhalb der Pflege"
        value={`${submitted.ausserhalbErfahrungJahre} Jahre`}
      />
      <ZeileLabelWert
        label="Funktionsrelevantes Zusatzdiplom"
        value={
          submitted.zusatzdiplom === "ja"
            ? ZUSATZDIPLOM_LABEL[submitted.zusatzdiplomArt]
            : "Nein"
        }
      />
      <ZeileLabelWert label="Pensum" value={`${submitted.pensumProzent}%`} />
    </div>
  );
}

function EinstufungsBadge({
  klasse,
  stufeMittel,
  stufeMittelRaw,
  stufeMin,
  stufeMax,
}: {
  klasse: number;
  stufeMittel: number;
  stufeMittelRaw: number;
  stufeMin: number;
  stufeMax: number;
}) {
  const wasFloored = Math.abs(stufeMittelRaw - stufeMittel) > 0.001;
  return (
    <div className="rounded-md border border-indigo-200 bg-indigo-50 p-4">
      <div className="text-xs uppercase tracking-wide text-indigo-800 font-semibold">
        Einstufung
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <div className="text-lg font-bold text-indigo-950">
          Klasse {String(klasse).padStart(2, "0")}
        </div>
        <div className="text-sm font-medium text-indigo-900">
          Mittel: LS {formatStufe(stufeMittel)}
          {wasFloored ? (
            <span className="ml-1 text-xs text-indigo-700">
              (rechnerisch LS {formatStufe(stufeMittelRaw)}, abgerundet)
            </span>
          ) : null}
        </div>
        <div className="text-sm font-medium text-indigo-900">
          Bandbreite: LS {formatStufe(stufeMin)} – LS {formatStufe(stufeMax)}
        </div>
      </div>
    </div>
  );
}

function BandbreitenResultat({
  klasse,
  stufeMittel,
  stufeMittelRaw,
  stufeMin,
  stufeMax,
  jahresLohnMin,
  jahresLohnMittel,
  jahresLohnMax,
  pensumProzent,
  submitted,
  warnung,
}: {
  klasse: number;
  stufeMittel: number;
  stufeMittelRaw: number;
  stufeMin: number;
  stufeMax: number;
  jahresLohnMin: number | null;
  jahresLohnMittel: number | null;
  jahresLohnMax: number | null;
  pensumProzent: number;
  submitted: LohnrechnerForm;
  warnung: string | null;
}) {
  const pensumFaktor = clamp(pensumProzent, 0, 100) / 100;

  const monatMin = jahresLohnMin != null ? jahresLohnMin / MONATE_PRO_JAHR : null;
  const monatMittel = jahresLohnMittel != null ? jahresLohnMittel / MONATE_PRO_JAHR : null;
  const monatMax = jahresLohnMax != null ? jahresLohnMax / MONATE_PRO_JAHR : null;

  const monatMinPensum = monatMin != null ? monatMin * pensumFaktor : null;
  const monatMittelPensum = monatMittel != null ? monatMittel * pensumFaktor : null;
  const monatMaxPensum = monatMax != null ? monatMax * pensumFaktor : null;

  const jahrMinPensum = jahresLohnMin != null ? jahresLohnMin * pensumFaktor : null;
  const jahrMittelPensum = jahresLohnMittel != null ? jahresLohnMittel * pensumFaktor : null;
  const jahrMaxPensum = jahresLohnMax != null ? jahresLohnMax * pensumFaktor : null;

  return (
    <div className="space-y-4">
      {warnung ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {warnung}
        </div>
      ) : null}

      <EinstufungsBadge
        klasse={klasse}
        stufeMittel={stufeMittel}
        stufeMittelRaw={stufeMittelRaw}
        stufeMin={stufeMin}
        stufeMax={stufeMax}
      />

      <BandTabelle
        title="Bei 100 % Pensum"
        subtitle="Direkt aus der Lohntabelle (inkl. 13. Monatslohn)"
        monatMin={monatMin}
        monatMittel={monatMittel}
        monatMax={monatMax}
        jahresMin={jahresLohnMin}
        jahresMittel={jahresLohnMittel}
        jahresMax={jahresLohnMax}
      />
      <BandTabelle
        title={`Bei ${pensumProzent} % Pensum`}
        subtitle="Linear skaliert"
        monatMin={monatMinPensum}
        monatMittel={monatMittelPensum}
        monatMax={monatMaxPensum}
        jahresMin={jahrMinPensum}
        jahresMittel={jahrMittelPensum}
        jahresMax={jahrMaxPensum}
      />

      <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
        <div className="text-xs uppercase tracking-wide text-gray-700 font-semibold mb-2">
          Eingaben
        </div>
        <EingabenZusammenfassung submitted={submitted} />
      </div>

      <p className="text-xs text-gray-500">
        Quelle: Lohntabelle Kanton Zürich (Kreuztabelle). Jahreslohn inkl. 13. Monatslohn.
        Monatslohn = Jahreslohn / 12 (anteiliger 13. ML integriert).
      </p>
    </div>
  );
}

function BandTabelle({
  title,
  subtitle,
  monatMin,
  monatMittel,
  monatMax,
  jahresMin,
  jahresMittel,
  jahresMax,
}: {
  title: string;
  subtitle: string;
  monatMin: number | null;
  monatMittel: number | null;
  monatMax: number | null;
  jahresMin: number | null;
  jahresMittel: number | null;
  jahresMax: number | null;
}) {
  return (
    <div className="rounded-md border border-gray-200 overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
        <div className="text-sm font-semibold text-gray-900">{title}</div>
        <div className="text-xs text-gray-500">{subtitle}</div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-white text-gray-600">
          <tr>
            <th className="px-4 py-2 text-left font-medium">Lohnart</th>
            <th className="px-3 py-2 text-right font-medium">Min</th>
            <th className="px-3 py-2 text-right font-medium">Mittel</th>
            <th className="px-3 py-2 text-right font-medium">Max</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          <tr>
            <td className="px-4 py-2 font-medium text-gray-900">
              Monatslohn
              <span className="block text-xs font-normal text-gray-500">
                inkl. anteiligem 13. ML
              </span>
            </td>
            <td className="px-3 py-2 text-right tabular-nums text-gray-900">
              {monatMin != null ? formatChf(monatMin) : "—"}
            </td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">
              {monatMittel != null ? formatChf(monatMittel) : "—"}
            </td>
            <td className="px-3 py-2 text-right tabular-nums text-gray-900">
              {monatMax != null ? formatChf(monatMax) : "—"}
            </td>
          </tr>
          <tr>
            <td className="px-4 py-2 font-medium text-gray-900">
              Jahreslohn
              <span className="block text-xs font-normal text-gray-500">
                inkl. 13. ML
              </span>
            </td>
            <td className="px-3 py-2 text-right tabular-nums text-gray-900">
              {jahresMin != null ? formatChf(jahresMin) : "—"}
            </td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">
              {jahresMittel != null ? formatChf(jahresMittel) : "—"}
            </td>
            <td className="px-3 py-2 text-right tabular-nums text-gray-900">
              {jahresMax != null ? formatChf(jahresMax) : "—"}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function StundenlohnTabelle({
  title,
  subtitle,
  aufMin,
  aufMittel,
  aufMax,
}: {
  title: string;
  subtitle: string;
  aufMin: StundenlohnAufteilung | null;
  aufMittel: StundenlohnAufteilung | null;
  aufMax: StundenlohnAufteilung | null;
}) {
  const zellen = (val: number | null | undefined, bold = false) => (
    <td
      className={`px-3 py-2 text-right tabular-nums text-gray-900 ${
        bold ? "font-semibold" : ""
      }`}
    >
      {val != null ? formatChf(val, 2) : "—"}
    </td>
  );

  return (
    <div className="rounded-md border border-gray-200 overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
        <div className="text-sm font-semibold text-gray-900">{title}</div>
        <div className="text-xs text-gray-500">{subtitle}</div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-white text-gray-600">
          <tr>
            <th className="px-4 py-2 text-left font-medium">Bestandteil</th>
            <th className="px-3 py-2 text-right font-medium">Min CHF/h</th>
            <th className="px-3 py-2 text-right font-medium">Mittel CHF/h</th>
            <th className="px-3 py-2 text-right font-medium">Max CHF/h</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          <tr>
            <td className="px-4 py-2 font-medium text-gray-900">Grundlohn</td>
            {zellen(aufMin?.grundlohn)}
            {zellen(aufMittel?.grundlohn, true)}
            {zellen(aufMax?.grundlohn)}
          </tr>
          <tr>
            <td className="px-4 py-2 text-gray-900">
              Ferienzulage
              <span className="block text-xs text-gray-500">
                {FERIEN_ZULAGE_PCT}% (5 Wochen Ferien)
              </span>
            </td>
            {zellen(aufMin?.ferien)}
            {zellen(aufMittel?.ferien)}
            {zellen(aufMax?.ferien)}
          </tr>
          <tr>
            <td className="px-4 py-2 text-gray-900">
              Feiertagszulage
              <span className="block text-xs text-gray-500">
                {FEIERTAGE_ZULAGE_PCT}%
              </span>
            </td>
            {zellen(aufMin?.feiertage)}
            {zellen(aufMittel?.feiertage)}
            {zellen(aufMax?.feiertage)}
          </tr>
          <tr>
            <td className="px-4 py-2 text-gray-900">
              13. Monatslohn
              <span className="block text-xs text-gray-500">
                {DREIZEHNTER_ML_ZULAGE_PCT}%
              </span>
            </td>
            {zellen(aufMin?.dreizehnter)}
            {zellen(aufMittel?.dreizehnter)}
            {zellen(aufMax?.dreizehnter)}
          </tr>
          <tr className="bg-gray-50">
            <td className="px-4 py-2 font-bold text-gray-900">Brutto Total</td>
            {zellen(aufMin?.total, true)}
            {zellen(aufMittel?.total, true)}
            {zellen(aufMax?.total, true)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function StundenlohnBandResultat({
  klasse,
  stufeMittel,
  stufeMittelRaw,
  stufeMin,
  stufeMax,
  aufMin,
  aufMittel,
  aufMax,
  warnung,
  submitted,
}: {
  klasse: number;
  stufeMittel: number;
  stufeMittelRaw: number;
  stufeMin: number;
  stufeMax: number;
  aufMin: StundenlohnAufteilung | null;
  aufMittel: StundenlohnAufteilung | null;
  aufMax: StundenlohnAufteilung | null;
  warnung: string | null;
  submitted: LohnrechnerForm;
}) {
  return (
    <div className="space-y-4">
      {warnung ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {warnung}
        </div>
      ) : null}

      <EinstufungsBadge
        klasse={klasse}
        stufeMittel={stufeMittel}
        stufeMittelRaw={stufeMittelRaw}
        stufeMin={stufeMin}
        stufeMax={stufeMax}
      />

      <StundenlohnTabelle
        title="Stundenlohn-Bandbreite"
        subtitle={`Vollzeit-Basis ${VOLLZEIT_JAHRESSTUNDEN} h/Jahr · Grundlohn ohne Zulagen, Zulagen separat ausgewiesen`}
        aufMin={aufMin}
        aufMittel={aufMittel}
        aufMax={aufMax}
      />

      <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
        <div className="text-xs uppercase tracking-wide text-gray-700 font-semibold mb-2">
          Eingaben
        </div>
        <EingabenZusammenfassung submitted={submitted} />
      </div>

      <p className="text-xs text-gray-500">
        Berechnung: Grundlohn = Jahreslohn (ohne 13. ML) / {VOLLZEIT_JAHRESSTUNDEN} h. Zulagen
        prozentual auf Grundlohn. Ferien {FERIEN_ZULAGE_PCT}%, Feiertage {FEIERTAGE_ZULAGE_PCT}%,
        13. ML {DREIZEHNTER_ML_ZULAGE_PCT}%. Quelle Jahreslohn: Lohntabelle Kanton Zürich.
      </p>
    </div>
  );
}

function StundenlohnFixResultat({
  aufteilung,
  warnung,
  submitted,
}: {
  aufteilung: StundenlohnAufteilung;
  warnung: string | null;
  submitted: LohnrechnerForm;
}) {
  return (
    <div className="space-y-4">
      {warnung ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {warnung}
        </div>
      ) : null}

      <div className="rounded-md border border-indigo-200 bg-indigo-50 p-4">
        <div className="text-xs uppercase tracking-wide text-indigo-800 font-semibold">
          Funktion „Betreuung&ldquo; – fixer Bruttostundenlohn
        </div>
        <div className="mt-1 text-lg font-bold text-indigo-950">
          {formatChf(aufteilung.total, 2)} brutto / Stunde
        </div>
        <p className="mt-1 text-xs text-indigo-900">
          Keine Klassen-/Stufeneinstufung – Brutto-Stundenlohn ist fest.
        </p>
      </div>

      <StundenlohnTabelle
        title="Aufteilung des Bruttostundenlohns"
        subtitle="Grundlohn rückgerechnet, damit Grundlohn + Zulagen = Brutto Total"
        aufMin={aufteilung}
        aufMittel={aufteilung}
        aufMax={aufteilung}
      />

      <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
        <div className="text-xs uppercase tracking-wide text-gray-700 font-semibold mb-2">
          Eingaben
        </div>
        <EingabenZusammenfassung submitted={submitted} />
      </div>

      <p className="text-xs text-gray-500">
        Berechnung Grundlohn = Brutto Total / (1 + Ferien {FERIEN_ZULAGE_PCT}% + Feiertage{" "}
        {FEIERTAGE_ZULAGE_PCT}% + 13. ML {DREIZEHNTER_ML_ZULAGE_PCT}%).
      </p>
    </div>
  );
}
// #endregion
