/**
 * Berufsbezeichnungen / Qualifikationen im Pflege-Pool.
 *
 * Werte werden als String in `PoolUser.qualification` gespeichert (optional,
 * weil bestehende Personen ggf. noch keine Einstufung haben). Reihenfolge in
 * `POOL_QUALIFICATION_IDS` bestimmt die Reihenfolge im Dropdown – grob von
 * der höchsten Qualifikationsstufe absteigend.
 */

export const POOL_QUALIFICATIONS = {
  DIPL: {
    id: 'DIPL',
    label: 'Dipl. Pflegefachperson',
    short: 'Dipl.',
  },
  FAGE: {
    id: 'FAGE',
    label: 'Fachfrau/Fachmann Gesundheit',
    short: 'FAGE',
  },
  BKM: {
    id: 'BKM',
    label: 'BKM',
    short: 'BKM',
  },
  SRK: {
    id: 'SRK',
    label: 'Pflegehelfer:in SRK',
    short: 'SRK',
  },
  HW: {
    id: 'HW',
    label: 'Hauswirtschaft',
    short: 'HW',
  },
} as const

export type PoolQualificationId = keyof typeof POOL_QUALIFICATIONS

export const POOL_QUALIFICATION_IDS = Object.keys(POOL_QUALIFICATIONS) as PoolQualificationId[]

export function isValidQualification(value: unknown): value is PoolQualificationId {
  return typeof value === 'string' && value in POOL_QUALIFICATIONS
}

/** Liefert das Anzeige-Label (Kurzform) zur Qualifikations-ID, mit Fallback. */
export function getQualificationShort(value: string | null | undefined): string | null {
  if (!value) return null
  if (isValidQualification(value)) return POOL_QUALIFICATIONS[value].short
  return value
}

/** Liefert die ausgeschriebene Variante (Label) zur Qualifikations-ID. */
export function getQualificationLabel(value: string | null | undefined): string | null {
  if (!value) return null
  if (isValidQualification(value)) return POOL_QUALIFICATIONS[value].label
  return value
}
