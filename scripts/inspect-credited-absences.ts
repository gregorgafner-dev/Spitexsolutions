/**
 * READ-ONLY: Zeigt die einem Mitarbeiter in einem Monat GUTGESCHRIEBENEN
 * bezahlten Absenzstunden (Krankheit K / Ferien FE) "gem. Soll".
 *
 * Nutzt exakt dieselbe Logik wie der Stundensaldo (lib/absence-credit.ts):
 *   - pro Werktag max. (Tages-Soll − bereits gearbeitet)
 *   - Wochenende/Feiertag = 0
 *   - Monatslohn: K+FE, Stundenlohn: nur K
 *
 * Aufruf (Default Juli 2026, alle MA):
 *   npx tsx scripts/inspect-credited-absences.ts
 *   npx tsx scripts/inspect-credited-absences.ts 2026 7 adelina barbara gyler
 */
process.env.TZ = 'Europe/Zurich'

import { readFileSync } from 'fs'
import pg from 'pg'
import { format } from 'date-fns'
import { computeCreditedAbsenceHours, qualifyingAbsenceServices } from '../lib/absence-credit'
import { calculateMonthlyTargetHours, calculateWorkHours, DEFAULT_WEEKLY_HOURS } from '../lib/calculations'

pg.types.setTypeParser(1114, (v: string) => v)

const numArgs = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number)
const nameFilters = process.argv.slice(2).filter((a) => !/^\d+$/.test(a)).map((s) => s.toLowerCase())
const YEAR = numArgs[0] || 2026
const MONTH = numArgs[1] || 7

function loadEnvLocal(): Record<string, string> {
  const raw = readFileSync('.env.local', 'utf8')
  const env: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}

function parseNaiveLocal(s: string): Date {
  const [datePart, timePart = '00:00:00'] = String(s).split(' ')
  const [y, m, d] = datePart.split('-').map(Number)
  const [hh, mm, ss] = timePart.split(':').map((x) => Number(x))
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, Math.floor(ss || 0))
}

const r2 = (n: number) => Math.round(n * 100) / 100

async function main() {
  const env = loadEnvLocal()
  const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL
  if (!url || !/^postgres/.test(url)) throw new Error('Keine Postgres DATABASE_URL in .env.local.')
  const client = new pg.Client({ connectionString: url })
  await client.connect()

  const cfg = await client.query(`SELECT "weeklyHours" FROM work_time_configs WHERE year = $1`, [YEAR])
  const weeklyHours: number = cfg.rows[0]?.weeklyHours ?? DEFAULT_WEEKLY_HOURS

  const from = `${YEAR}-${String(MONTH).padStart(2, '0')}-01 00:00:00`
  const to = MONTH === 12 ? `${YEAR + 1}-01-01 00:00:00` : `${YEAR}-${String(MONTH + 1).padStart(2, '0')}-01 00:00:00`

  const emps = await client.query(
    `SELECT e.id, e."employmentType", e.pensum, u."firstName", u."lastName"
     FROM employees e JOIN users u ON u.id = e."userId" ORDER BY u."lastName"`
  )

  const match = (e: any) =>
    nameFilters.length === 0 ||
    nameFilters.some((f) => e.firstName.toLowerCase().includes(f) || e.lastName.toLowerCase().includes(f))

  const matched: Array<{ id: string; name: string }> = []

  console.log(`\n=== Gutgeschriebene bezahlte Absenzen (K/FE) — ${YEAR}-${String(MONTH).padStart(2, '0')} ===`)
  console.log(`Wochenstunden-Basis: ${weeklyHours}\n`)
  console.log(
    ['Mitarbeiter'.padEnd(28), 'Typ'.padEnd(14), 'K'.padStart(3), 'FE'.padStart(4),
     'gearbeitet'.padStart(11), 'gutgeschr.'.padStart(11), 'Soll'.padStart(9)].join(' ')
  )
  console.log('-'.repeat(90))

  for (const e of emps.rows) {
    if (!match(e)) continue
    matched.push({ id: e.id, name: `${e.firstName} ${e.lastName}` })

    // Zeiterfassung des Monats
    const te = await client.query(
      `SELECT "entryType","startTime","endTime","breakMinutes","sleepInterruptionMinutes",date
       FROM time_entries WHERE "employeeId" = $1 AND date >= $2 AND date < $3`,
      [e.id, from, to]
    )
    let worked = 0
    const workedByDay = new Map<string, number>()
    for (const r of te.rows) {
      let h = 0
      if (r.entryType === 'SLEEP') continue
      else if (r.entryType === 'SLEEP_INTERRUPTION') h = (r.sleepInterruptionMinutes || 0) / 60
      else if (r.endTime) h = calculateWorkHours(parseNaiveLocal(r.startTime), parseNaiveLocal(r.endTime), r.breakMinutes || 0)
      if (h !== 0) {
        worked += h
        const key = format(parseNaiveLocal(r.date), 'yyyy-MM-dd')
        workedByDay.set(key, (workedByDay.get(key) || 0) + h)
      }
    }

    // Absenztage im Dienstplan
    const allowed = qualifyingAbsenceServices(e.employmentType)
    const absAll = await client.query(
      `SELECT se.date, s.name FROM schedule_entries se JOIN services s ON s.id = se."serviceId"
       WHERE se."employeeId" = $1 AND se.date >= $2 AND se.date < $3 AND s.name IN ('K','FE')`,
      [e.id, from, to]
    )
    let kDays = 0
    let feDays = 0
    const qualifyingDays: Date[] = []
    for (const r of absAll.rows) {
      if (r.name === 'K') kDays++
      else if (r.name === 'FE') feDays++
      if (allowed.includes(r.name)) qualifyingDays.push(parseNaiveLocal(r.date))
    }

    const credited = computeCreditedAbsenceHours({
      weeklyHours,
      pensum: e.pensum,
      year: YEAR,
      absenceDays: qualifyingDays,
      workedHoursByDay: workedByDay,
    })
    const target = calculateMonthlyTargetHours(weeklyHours, e.pensum, YEAR, MONTH)

    console.log(
      [
        `${e.firstName} ${e.lastName}`.padEnd(28),
        `${e.employmentType === 'MONTHLY_SALARY' ? 'Monatslohn' : 'Stundenlohn'}`.padEnd(14),
        String(kDays).padStart(3),
        String(feDays).padStart(4),
        r2(worked).toFixed(2).padStart(11),
        r2(credited).toFixed(2).padStart(11),
        r2(target).toFixed(2).padStart(9),
      ].join(' ')
    )
  }

  console.log('-'.repeat(90))
  console.log('Hinweis: "gutgeschr." = bezahlte Absenzstunden, die dem Stundensaldo als Ist gutgeschrieben werden.')
  console.log('(Bei Stundenlohn zählt nur K; Ferien FE werden dort über den Lohn abgegolten.)')

  // Vorhandene MANUELLE Anpassungen (hour_balance_adjustments) je Mitarbeiter –
  // um Doppelbuchungen (manuelle 80%-Gutschrift zusätzlich zur automatischen
  // "gem. Soll"-Gutschrift) zu erkennen.
  console.log('\n=== Manuelle Anpassungen (hour_balance_adjustments) der ausgewählten MA ===')
  for (const m of matched) {
    const adj = await client.query(
      `SELECT id, to_char("effectiveDate",'YYYY-MM-DD') AS d, minutes, kind, reason
       FROM hour_balance_adjustments WHERE "employeeId" = $1 ORDER BY "effectiveDate"`,
      [m.id]
    )
    console.log(`\n- ${m.name}:`)
    if (adj.rows.length === 0) {
      console.log('    keine manuellen Anpassungen')
      continue
    }
    for (const a of adj.rows) {
      console.log(
        `    ${a.d}  ${String(a.kind).padEnd(6)} ${(Number(a.minutes) / 60).toFixed(2).padStart(9)} h  ` +
          `[id ${a.id}]  "${a.reason}"`
      )
    }
  }

  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
