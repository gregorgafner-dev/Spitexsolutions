/**
 * READ-ONLY: Prüft für ausgewählte Mitarbeiter (Default: Gyler + Adelina) im Juli 2026:
 *   - Anstellungstyp/Pensum
 *   - Dienstplan-Absenzen (Service K = Krankheit, FE = Ferien) inkl. Stunden
 *   - Zeiterfassungen (entryType-Verteilung; SICK/WORK-Stunden, die in die Hotelrechnung fliessen)
 *   - Monatssaldo (targetHours/actualHours/balance)
 *
 * Aufruf: npx tsx scripts/inspect-sick-july.ts [YYYY] [MM]
 */
process.env.TZ = 'Europe/Zurich'

import { readFileSync } from 'fs'
import pg from 'pg'

pg.types.setTypeParser(1114, (v: string) => v) // timestamp without tz -> roher String

function loadEnvLocal(): Record<string, string> {
  const raw = readFileSync('.env.local', 'utf8')
  const env: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}

const NAMES = ['zeka', 'halimi'] // Nachnamen-Fragmente: Gyler I_Zeka, Adelina B_Halimi

function hoursBetween(start: string, end: string): number {
  const s = new Date(String(start).replace(' ', 'T') + 'Z').getTime()
  const e = new Date(String(end).replace(' ', 'T') + 'Z').getTime()
  return (e - s) / (1000 * 60 * 60)
}

async function main() {
  const year = Number(process.argv[2] || 2026)
  const month = Number(process.argv[3] || 7)
  const from = `${year}-${String(month).padStart(2, '0')}-01 00:00:00`
  const toMonth = month === 12 ? 1 : month + 1
  const toYear = month === 12 ? year + 1 : year
  const to = `${toYear}-${String(toMonth).padStart(2, '0')}-01 00:00:00`

  const env = loadEnvLocal()
  const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL
  if (!url || !/^postgres/.test(url)) throw new Error('Keine Postgres DATABASE_URL in .env.local.')
  const client = new pg.Client({ connectionString: url })
  await client.connect()

  const empRes = await client.query(
    `SELECT e.id AS "employeeId", u."firstName", u."lastName", e."employmentType", e.pensum, e."exitDate"
     FROM employees e JOIN users u ON u.id = e."userId"
     WHERE ${NAMES.map((_, i) => `lower(u."lastName") LIKE $${i + 1}`).join(' OR ')}
     ORDER BY u."lastName"`,
    NAMES.map((n) => `%${n}%`)
  )

  console.log(`\n=== Prüfzeitraum: ${year}-${String(month).padStart(2, '0')} ===`)

  for (const e of empRes.rows) {
    console.log('\n' + '='.repeat(70))
    console.log(`${e.firstName} ${e.lastName}  |  ${e.employmentType}  |  Pensum ${e.pensum}%`)
    console.log(`employeeId: ${e.employeeId}`)

    // Dienstplan-Absenzen
    const sched = await client.query(
      `SELECT s.name AS service, se.date, se."startTime", se."endTime"
       FROM schedule_entries se JOIN services s ON s.id = se."serviceId"
       WHERE se."employeeId" = $1 AND se.date >= $2 AND se.date < $3
       ORDER BY se.date`,
      [e.employeeId, from, to]
    )
    const byService = new Map<string, { count: number; hours: number; days: Set<string> }>()
    for (const r of sched.rows) {
      const h = hoursBetween(r.startTime, r.endTime)
      const key = r.service
      if (!byService.has(key)) byService.set(key, { count: 0, hours: 0, days: new Set() })
      const acc = byService.get(key)!
      acc.count++
      acc.hours += h
      acc.days.add(String(r.date).slice(0, 10))
    }
    console.log('\n  Dienstplan-Einträge (nach Service):')
    if (byService.size === 0) console.log('    (keine)')
    for (const [name, acc] of byService) {
      console.log(`    ${name.padEnd(6)} ${acc.count} Einträge, ${acc.hours.toFixed(2)}h, ${acc.days.size} Tage`)
    }

    // Zeiterfassungen
    const te = await client.query(
      `SELECT "entryType", "startTime", "endTime", "breakMinutes", "sleepInterruptionMinutes"
       FROM time_entries WHERE "employeeId" = $1 AND date >= $2 AND date < $3
       ORDER BY "startTime"`,
      [e.employeeId, from, to]
    )
    const teByType = new Map<string, { count: number; hours: number }>()
    for (const r of te.rows) {
      const type = r.entryType
      let h = 0
      if (type === 'SLEEP_INTERRUPTION') h = (r.sleepInterruptionMinutes || 0) / 60
      else if (r.endTime) h = hoursBetween(r.startTime, r.endTime) - (r.breakMinutes || 0) / 60
      if (!teByType.has(type)) teByType.set(type, { count: 0, hours: 0 })
      const acc = teByType.get(type)!
      acc.count++
      acc.hours += h
    }
    console.log('\n  Zeiterfassung (nach entryType):')
    if (teByType.size === 0) console.log('    (keine)')
    for (const [type, acc] of teByType) {
      console.log(`    ${type.padEnd(20)} ${acc.count} Einträge, ${acc.hours.toFixed(2)}h`)
    }
    const hotelRelevant = [...teByType.entries()]
      .filter(([t]) => t !== 'SLEEP' && t !== 'SLEEP_INTERRUPTION')
      .reduce((s, [, a]) => s + a.hours, 0)
    console.log(`    -> in Hotelrechnung als "Arbeit" einfliessend: ${hotelRelevant.toFixed(2)}h`)

    // Monatssaldo
    const mb = await client.query(
      `SELECT "targetHours", "actualHours", "surchargeHours", balance, "previousBalance"
       FROM monthly_balances WHERE "employeeId" = $1 AND year = $2 AND month = $3`,
      [e.employeeId, year, month]
    )
    console.log('\n  Monatssaldo:')
    if (mb.rows.length === 0) console.log('    (kein Eintrag)')
    else {
      const b = mb.rows[0]
      console.log(`    Soll:   ${Number(b.targetHours).toFixed(2)}h`)
      console.log(`    Ist:    ${Number(b.actualHours).toFixed(2)}h  (inkl. gutgeschriebene Absenzen bei Monatslohn)`)
      console.log(`    Zuschlag: ${Number(b.surchargeHours).toFixed(2)}h`)
      console.log(`    Vortrag: ${Number(b.previousBalance).toFixed(2)}h`)
      console.log(`    Saldo:  ${Number(b.balance).toFixed(2)}h`)
    }
  }

  console.log('\n' + '='.repeat(70))
  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
