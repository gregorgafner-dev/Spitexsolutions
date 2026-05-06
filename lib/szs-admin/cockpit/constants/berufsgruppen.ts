/**
 * Vordefinierte Berufsgruppen für das Cockpit Reporting Tool
 */
export const BERUFSGRUPPEN = [
  "Pflegefachperson",
  "Fachangestellte Gesundheit",
  "Pflegeassistentin",
  "Pflegehilfe",
  "Pflege ohne Ausbildung",
  "Leitende Person",
] as const;

export type Berufsgruppe = typeof BERUFSGRUPPEN[number];

