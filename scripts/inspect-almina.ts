/**
 * READ-ONLY: Prüft den Login-relevanten Status von Mitarbeitern (z.B. "Almina").
 * Zeigt exitDate, ob archiviert, und die E-Mail exakt (mit Anomalie-Check).
 *
 * Aufruf: npx tsx scripts/inspect-almina.ts [Namensfilter]
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

async function main() {
  const filter = (process.argv[2] || 'almina').toLowerCase()
  const env = loadEnvLocal()
  const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL
  if (!url || !/^postgres/.test(url)) throw new Error('Keine Postgres DATABASE_URL in .env.local.')

  const client = new pg.Client({ connectionString: url })
  await client.connect()

  const res = await client.query(
    `SELECT e.id AS "employeeId", u.id AS "userId", u."firstName", u."lastName",
            u.email, u.role, u."createdAt", u."updatedAt",
            length(u.email) AS email_len, length(u.password) AS pw_len, e."exitDate"
     FROM employees e
     JOIN users u ON u.id = e."userId"
     WHERE lower(u."firstName") LIKE $1 OR lower(u."lastName") LIKE $1
     ORDER BY u."firstName"`,
    [`%${filter}%`]
  )

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  if (res.rows.length === 0) console.log(`Keine Mitarbeiter gefunden für Filter "${filter}".`)

  for (const r of res.rows) {
    const exit = r.exitDate ? new Date(String(r.exitDate).replace(' ', 'T')) : null
    const archived = exit && !Number.isNaN(exit.getTime())
      ? exit.getTime() <= startOfToday.getTime()
      : false
    const emailAnomaly =
      r.email !== r.email.trim()
        ? 'FÜHRENDE/FOLGENDE LEERZEICHEN!'
        : r.email !== r.email.toLowerCase()
        ? 'ENTHÄLT GROSSBUCHSTABEN!'
        : 'ok'
    console.log('—'.repeat(60))
    console.log(`Name:        ${r.firstName} ${r.lastName}`)
    console.log(`E-Mail:      [${r.email}]`)
    console.log(`E-Mail-Check: ${emailAnomaly} (len=${r.email_len})`)
    console.log(`Rolle:       ${r.role}`)
    console.log(`Passwort-Hash-Länge: ${r.pw_len} (bcrypt erwartet 60)`)
    console.log(`userId:      ${r.userId}`)
    console.log(`employeeId:  ${r.employeeId}`)
    console.log(`erstellt:    ${r.createdAt}`)
    console.log(`geändert:    ${r.updatedAt}`)
    console.log(`exitDate:    ${r.exitDate ?? '(null)'}`)
    console.log(`Login gesperrt (archiviert)? ${archived ? 'JA' : 'nein'}`)
  }
  console.log('—'.repeat(60))

  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
