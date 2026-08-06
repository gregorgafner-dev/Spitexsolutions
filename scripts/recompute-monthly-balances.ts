/**
 * Berechnet die Monatssalden eines Monats neu, gemäss der Absenz-Regel
 * (Krankheit/Ferien gem. Soll, gedeckelt). Spiegelt lib/update-monthly-balance.ts
 * und nutzt DIESELBEN Helper (keine Logik-Duplikation).
 *
 * READ-ONLY im Default (Dry-Run). Schreibt nur mit --apply.
 * Aufruf (Default Juli 2026):
 *   npx tsx scripts/recompute-monthly-balances.ts                 # Dry-Run Juli 2026
 *   npx tsx scripts/recompute-monthly-balances.ts 2026 8          # Dry-Run August 2026
 *   npx tsx scripts/recompute-monthly-balances.ts 2026 8 --apply  # schreibt August 2026
 *
 * Hinweis: Salden bauen aufeinander auf (Vortrag). Bei rückwirkender Korrektur
 * eines Monats die Folgemonate ebenfalls neu berechnen.
 */
process.env.TZ = 'Europe/Zurich'

import { readFileSync } from 'fs'
import { randomBytes } from 'crypto'
import pg from 'pg'
import { format } from 'date-fns'
import { computeCreditedAbsenceHours, qualifyingAbsenceServices } from '../lib/absence-credit'
import { calculateMonthlyTargetHours, calculateWorkHours, DEFAULT_WEEKLY_HOURS } from '../lib/calculations'

pg.types.setTypeParser(1114, (v: string) => v)

// Monat via Argumenten wählbar (Default Juli 2026): npx tsx ... [YYYY] [MM]
const numArgs = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number)
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

function makeCuid(): string {
  const ts = Date.now().toString(36)
  const rnd = randomBytes(10).toString('hex')
  return `c${ts}${rnd}`.slice(0, 25)
}
const round2 = (n: number) => Math.round(n * 100) / 100

async function main() {
  const apply = process.argv.includes('--apply')
  const env = loadEnvLocal()
  const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL
  if (!url || !/^postgres/.test(url)) throw new Error('Keine Postgres DATABASE_URL in .env.local.')
  const client = new pg.Client({ connectionString: url })
  await client.connect()

  const cfg = await client.query(`SELECT "weeklyHours" FROM work_time_configs WHERE year = $1`, [YEAR])
  const weeklyHours: number = cfg.rows[0]?.weeklyHours ?? DEFAULT_WEEKLY_HOURS

  const from = `${YEAR}-${String(MONTH).padStart(2, '0')}-01 00:00:00`
  const to =
    MONTH === 12
      ? `${YEAR + 1}-01-01 00:00:00`
      : `${YEAR}-${String(MONTH + 1).padStart(2, '0')}-01 00:00:00`
  const prevMonth = MONTH === 1 ? 12 : MONTH - 1
  const prevYear = MONTH === 1 ? YEAR - 1 : YEAR

  const emps = await client.query(
    `SELECT e.id, e."employmentType", e.pensum, u."firstName", u."lastName"
     FROM employees e JOIN users u ON u.id = e."userId"
     ORDER BY u."lastName"`
  )

  console.log(`\n=== Neuberechnung Monatssaldo ${YEAR}-${String(MONTH).padStart(2, '0')} (${apply ? 'APPLY' : 'DRY-RUN'}) ===`)
  console.log(`Wochenstunden-Basis: ${weeklyHours}\n`)

  let changed = 0
  for (const e of emps.rows) {
    // Zeiterfassung Juli
    const te = await client.query(
      `SELECT "entryType","startTime","endTime","breakMinutes","sleepInterruptionMinutes","surchargeHours",date
       FROM time_entries WHERE "employeeId" = $1 AND date >= $2 AND date < $3`,
      [e.id, from, to]
    )
    let actualFromTime = 0
    let surcharge = 0
    const workedByDay = new Map<string, number>()
    for (const r of te.rows) {
      let h = 0
      if (r.entryType === 'SLEEP') {
        // zählt nicht als Arbeit
      } else if (r.entryType === 'SLEEP_INTERRUPTION') {
        h = (r.sleepInterruptionMinutes || 0) / 60
      } else if (r.endTime) {
        h = calculateWorkHours(parseNaiveLocal(r.startTime), parseNaiveLocal(r.endTime), r.breakMinutes || 0)
      }
      surcharge += r.surchargeHours || 0
      if (h !== 0) {
        actualFromTime += h
        const key = format(parseNaiveLocal(r.date), 'yyyy-MM-dd')
        workedByDay.set(key, (workedByDay.get(key) || 0) + h)
      }
    }

    // Absenzen Juli (je Anstellungstyp)
    const allowed = qualifyingAbsenceServices(e.employmentType)
    const abs = await client.query(
      `SELECT se.date FROM schedule_entries se JOIN services s ON s.id = se."serviceId"
       WHERE se."employeeId" = $1 AND se.date >= $2 AND se.date < $3 AND s.name = ANY($4)`,
      [e.id, from, to, allowed]
    )
    const absenceDays = abs.rows.map((r: any) => parseNaiveLocal(r.date))

    const credited = computeCreditedAbsenceHours({
      weeklyHours,
      pensum: e.pensum,
      year: YEAR,
      absenceDays,
      workedHoursByDay: workedByDay,
    })

    const newActual = round2(actualFromTime + credited)
    const target = calculateMonthlyTargetHours(weeklyHours, e.pensum, YEAR, MONTH)

    const prev = await client.query(
      `SELECT balance FROM monthly_balances WHERE "employeeId" = $1 AND year = $2 AND month = $3`,
      [e.id, prevYear, prevMonth]
    )
    const previousBalance = prev.rows[0]?.balance ?? 0
    const newBalance = round2(newActual + surcharge - target + previousBalance)

    const cur = await client.query(
      `SELECT "actualHours",balance FROM monthly_balances WHERE "employeeId" = $1 AND year = $2 AND month = $3`,
      [e.id, YEAR, MONTH]
    )
    const hasRow = cur.rows.length > 0
    const oldActual = hasRow ? Number(cur.rows[0].actualHours) : null
    const oldBalance = hasRow ? Number(cur.rows[0].balance) : null

    const actualChanged = oldActual === null || Math.abs(oldActual - newActual) > 0.005
    const balanceChanged = oldBalance === null || Math.abs(oldBalance - newBalance) > 0.005
    const hasActivity = te.rows.length > 0 || absenceDays.length > 0
    if (!hasRow && !hasActivity) continue

    if (actualChanged || balanceChanged) {
      changed++
      console.log(`${e.firstName} ${e.lastName} (${e.employmentType}, ${e.pensum}%)`)
      console.log(
        `   Ist:   ${oldActual === null ? '—' : oldActual.toFixed(2)} -> ${newActual.toFixed(2)}   ` +
          `(Soll ${target.toFixed(2)}, Absenz gutgeschrieben ${credited.toFixed(2)})`
      )
      console.log(`   Saldo: ${oldBalance === null ? '—' : oldBalance.toFixed(2)} -> ${newBalance.toFixed(2)}   (Vortrag ${Number(previousBalance).toFixed(2)})`)
    }

    if (apply && (actualChanged || balanceChanged)) {
      await client.query(
        `INSERT INTO monthly_balances
           (id,"employeeId",year,month,"targetHours","actualHours","surchargeHours","plannedHours",balance,"previousBalance","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,$9,now(),now())
         ON CONFLICT ("employeeId",year,month) DO UPDATE SET
           "targetHours"=EXCLUDED."targetHours",
           "actualHours"=EXCLUDED."actualHours",
           "surchargeHours"=EXCLUDED."surchargeHours",
           balance=EXCLUDED.balance,
           "previousBalance"=EXCLUDED."previousBalance",
           "updatedAt"=now()`,
        [makeCuid(), e.id, YEAR, MONTH, target, newActual, round2(surcharge), newBalance, previousBalance]
      )
    }
  }

  console.log(`\n${changed} Mitarbeiter mit Änderung${apply ? ' (geschrieben)' : ' (Dry-Run, nichts geschrieben)'}.`)
  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
