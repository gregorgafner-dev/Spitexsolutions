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

/**
 * Erlaubt-Qualifikationen werden in `PoolShiftRequest.allowedQualifications`
 * als JSON-Array von IDs gespeichert (kompatibel mit SQLite und Postgres).
 *
 * - `null` oder leerer Array → keine Restriktion, alle aktiven Mitarbeitenden
 *   sehen die Anfrage.
 * - sonst: nur Mitarbeitende, deren `qualification` in der Liste enthalten
 *   ist (oder die selbst keine Qualifikation hinterlegt haben), sehen die
 *   Anfrage NICHT – Personen ohne Qualifikation werden bei einer Restriktion
 *   bewusst ausgeschlossen, weil ihre Eignung unklar ist.
 */

export function parseAllowedQualifications(value: string | null | undefined): PoolQualificationId[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    const out: PoolQualificationId[] = []
    for (const v of parsed) {
      if (isValidQualification(v) && !out.includes(v)) out.push(v)
    }
    return out
  } catch {
    return []
  }
}

export function serializeAllowedQualifications(
  ids: ReadonlyArray<unknown>
): string | null {
  const clean: PoolQualificationId[] = []
  for (const v of ids) {
    if (isValidQualification(v) && !clean.includes(v)) clean.push(v)
  }
  if (clean.length === 0) return null
  return JSON.stringify(clean)
}

/**
 * Prüft, ob ein Pool-Member mit gegebener Qualifikation die Anfrage sehen /
 * übernehmen darf.
 *
 * Regel:
 *   - keine Restriktion (leeres Array) → ja
 *   - Restriktion vorhanden, Member hat keine Qualifikation → nein
 *   - Restriktion vorhanden, Member-Qualifikation in Liste → ja
 *   - Restriktion vorhanden, Member-Qualifikation nicht in Liste → nein
 */
export function isMemberQualifiedForRequest(
  memberQualification: string | null | undefined,
  allowed: ReadonlyArray<string>
): boolean {
  if (!allowed || allowed.length === 0) return true
  if (!memberQualification) return false
  return allowed.includes(memberQualification)
}
