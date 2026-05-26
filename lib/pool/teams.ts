/**
 * Fest definierte Teams im Spitex Zürichsee Pool.
 *
 * Jede Dienstanfrage und jede daraus entstehende Buchung ist team-bezogen,
 * damit am gleichen Tag/in derselben Schicht mehrere Teams parallel Bedarf
 * decken können.
 *
 * Werte werden direkt als String in der Datenbank gespeichert (kein Enum,
 * damit Erweiterungen ohne Migration möglich sind). `POOL_TEAMS`/`isValidTeam`
 * sind hier als Single Source of Truth definiert.
 */

export const POOL_TEAMS = {
  MAENNEDORF_UETIKON: {
    id: 'MAENNEDORF_UETIKON',
    label: 'Männedorf Uetikon',
    short: 'MAU',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    dotColor: 'bg-emerald-500',
  },
  MEILEN: {
    id: 'MEILEN',
    label: 'Meilen',
    short: 'MEI',
    color: 'bg-sky-100 text-sky-800 border-sky-200',
    dotColor: 'bg-sky-500',
  },
  HERRLIBERG_ERLENBACH: {
    id: 'HERRLIBERG_ERLENBACH',
    label: 'Herrliberg Erlenbach',
    short: 'HER',
    color: 'bg-violet-100 text-violet-800 border-violet-200',
    dotColor: 'bg-violet-500',
  },
} as const

export type PoolTeamId = keyof typeof POOL_TEAMS

export const POOL_TEAM_IDS = Object.keys(POOL_TEAMS) as PoolTeamId[]

export function isValidTeam(value: unknown): value is PoolTeamId {
  return typeof value === 'string' && value in POOL_TEAMS
}

/** Bequemer Lookup: Label zu Team-ID, mit Fallback auf die rohe ID. */
export function getTeamLabel(team: string): string {
  if (isValidTeam(team)) return POOL_TEAMS[team].label
  return team
}
