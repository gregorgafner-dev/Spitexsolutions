/**
 * READ-ONLY: Tagesgenaue K-Verteilung (Wochentag + Stunden) für Gyler + Adelina.
 * Aufruf: npx tsx scripts/inspect-sick-days.ts [YYYY] [MM]
 */
process.env.TZ = 'Europe/Zurich'
import { readFileSync } from 'fs'
import pg from 'pg'
pg.types.setTypeParser(1114, (v: string) => v)

function loadEnvLocal(): Record<string, string> {
  const raw = readFileSync('.env.local', 'utf8')
  const env: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const NAMES = ['zeka', 'halimi']

async function main() {
  const year = Number(process.argv[2] || 2026)
  const month = Number(process.argv[3] || 7)
  const from = `${year}-${String(month).padStart(2, '0')}-01 00:00:00`
  const toMonth = month === 12 ? 1 : month + 1
  const toYear = month === 12 ? year + 1 : year
  const to = `${toYear}-${String(toMonth).padStart(2, '0')}-01 00:00:00`

  const env = loadEnvLocal()
  const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL
  const client = new pg.Client({ connectionString: url! })
  await client.connect()

  const emps = await client.query(
    `SELECT e.id AS "employeeId", u."firstName", u."lastName", e."employmentType"
     FROM employees e JOIN users u ON u.id = e."userId"
     WHERE ${NAMES.map((_, i) => `lower(u."lastName") LIKE $${i + 1}`).join(' OR ')}`,
    NAMES.map((n) => `%${n}%`)
  )

  for (const e of emps.rows) {
    console.log('\n' + '='.repeat(60))
    console.log(`${e.firstName} ${e.lastName} (${e.employmentType})`)
    const rows = await client.query(
      `SELECT s.name AS service, se.date, se."startTime", se."endTime"
       FROM schedule_entries se JOIN services s ON s.id = se."serviceId"
       WHERE se."employeeId" = $1 AND se.date >= $2 AND se.date < $3 ORDER BY se.date`,
      [e.employeeId, from, to]
    )
    let total = 0
    let weekendHours = 0
    for (const r of rows.rows) {
      const d = new Date(String(r.date).replace(' ', 'T') + 'Z')
      const wd = WD[d.getUTCDay()]
      const s = new Date(String(r.startTime).replace(' ', 'T') + 'Z').getTime()
      const en = new Date(String(r.endTime).replace(' ', 'T') + 'Z').getTime()
      const h = (en - s) / 3.6e6
      total += h
      const isWeekend = d.getUTCDay() === 0 || d.getUTCDay() === 6
      if (isWeekend) weekendHours += h
      const st = String(r.startTime).slice(11, 16)
      const et = String(r.endTime).slice(11, 16)
      console.log(`  ${String(r.date).slice(0, 10)} ${wd}  ${r.service}  ${st}-${et}  ${h.toFixed(2)}h${isWeekend ? '  [WE]' : ''}`)
    }
    console.log(`  ---- total ${total.toFixed(2)}h, davon Wochenende ${weekendHours.toFixed(2)}h`)
  }
  await client.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
