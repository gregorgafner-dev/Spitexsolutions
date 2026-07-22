/**
 * Repariert Nachtdienste, bei denen der große Schlafblock (00:00-06:00, 6h) fehlt.
 *
 * Hintergrund:
 *   Ein Nachtdienst besteht aus 4 Blöcken (Buchungsdatum = Startdatum D):
 *     WORK  19:00-23:00
 *     SLEEP 23:01-23:59   (59 min)
 *     SLEEP 00:00-06:00   (6 h)   <-- kann durch einen Bug im Speicherpfad fehlen
 *     WORK  06:01-07:00   (kann abweichen, z.B. 06:01-08:00)
 *   Fehlt der 6h-Block, zeigt die App nur 0:59 Schlaf statt 6:59.
 *
 * Dieses Skript findet Nächte mit vorhandenem 23:01-SLEEP-Block UND 06:01-WORK-Block,
 * aber OHNE 00:00-06:00-SLEEP-Block, und ergänzt den fehlenden Block.
 *
 * Wichtig zur Zeit-Speicherung:
 *   Die Spalten sind `timestamp without time zone` und enthalten naive Werte mit
 *   dem historischen CEST/CET-Offset (Sommer -2h). Wir verankern den neuen Block
 *   deshalb NICHT an hartkodierten Zeiten, sondern am vorhandenen 23:01-Block:
 *     neuer Start = (Ende des 23:01-Blocks) + 1 Sekunde   (= 00:00 Wanduhr)
 *     neues Ende  = neuer Start + 6 Stunden               (= 06:00 Wanduhr)
 *   Das ist DST-sicher und offset-neutral.
 *
 * READ-ONLY im Default (Dry-Run). Schreibt nur mit --apply.
 *
 * Aufruf:
 *   npx tsx scripts/fix-missing-nightshift-sleep.ts                       # Dry-Run, alle MA
 *   npx tsx scripts/fix-missing-nightshift-sleep.ts --employee Silvestro  # nur ein MA
 *   npx tsx scripts/fix-missing-nightshift-sleep.ts --from 2026-01-01 --to 2026-12-31
 *   npx tsx scripts/fix-missing-nightshift-sleep.ts --apply               # schreibt
 */

// Zeitzone fixieren: Wanduhr-Erkennung (getHours) muss in Europe/Zurich erfolgen,
// wie im Browser der App. Muss vor der ersten Date-Nutzung gesetzt werden.
process.env.TZ = 'Europe/Zurich'

import { readFileSync } from 'fs'
import { randomBytes } from 'crypto'
import pg from 'pg'

// timestamp without time zone (OID 1114): naiven String unverändert lassen.
pg.types.setTypeParser(1114, (v: string) => v)

type Args = {
  employee?: string
  from?: string
  to?: string
  apply: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--employee' && argv[i + 1]) args.employee = argv[++i]
    else if (a === '--from' && argv[i + 1]) args.from = argv[++i]
    else if (a === '--to' && argv[i + 1]) args.to = argv[++i]
    else if (a === '--apply') args.apply = true
    else if (a === '--dry-run') args.apply = false
  }
  return args
}

function loadEnvLocal(): Record<string, string> {
  const raw = readFileSync('.env.local', 'utf8')
  const env: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}

// cuid-ähnliche ID (Prisma nutzt @default(cuid()) nur auf App-Ebene).
let idCounter = 0
function makeCuid(): string {
  const ts = Date.now().toString(36)
  const c = (idCounter++).toString(36).padStart(4, '0')
  const rnd = randomBytes(8).toString('hex')
  return `c${ts}${c}${rnd}`.slice(0, 25)
}

// naiven Timestamp-String -> Date (als UTC interpretiert, für reine Arithmetik)
function naiveToDate(s: string): Date {
  return new Date(s.replace(' ', 'T').replace('Z', '') + 'Z')
}

// Date -> naiver Timestamp-String "YYYY-MM-DD HH:MM:SS" (aus UTC-Komponenten)
function dateToNaive(d: Date): string {
  const p = (n: number, l = 2) => String(n).padStart(l, '0')
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
  )
}

// Wanduhr (Europe/Zurich) eines naiven, als UTC gespeicherten Instants
function wall(s: string): Date {
  return new Date(naiveToDate(s).getTime())
}

type Row = {
  id: string
  employeeId: string
  firstName: string
  lastName: string
  date: string
  startTime: string
  endTime: string | null
  entryType: string
  sleepInterruptionMinutes: number | null
}

function isSleep2359(r: Row): boolean {
  if (r.entryType !== 'SLEEP' || !r.endTime) return false
  const w = wall(r.startTime)
  return w.getHours() === 23 && w.getMinutes() === 1
}

function isWork0601(r: Row): boolean {
  if (r.entryType !== 'WORK' || !r.endTime) return false
  const w = wall(r.startTime)
  return w.getHours() === 6 && w.getMinutes() === 1
}

function isSleep0006(r: Row): boolean {
  if (r.entryType !== 'SLEEP' || !r.endTime) return false
  const ws = wall(r.startTime)
  const we = wall(r.endTime)
  return ws.getHours() === 0 && ws.getMinutes() === 0 && we.getHours() === 6 && we.getMinutes() === 0
}

function bookingDay(r: Row): string {
  // date-Feld ist naiv "YYYY-MM-DD 00:00:00" -> Kalender-Buchungsdatum
  return r.date.substring(0, 10)
}

async function main() {
  const args = parseArgs(process.argv)
  const env = loadEnvLocal()
  const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL
  if (!url || !/^postgres/.test(url)) {
    throw new Error('Keine Postgres DATABASE_URL in .env.local gefunden.')
  }

  console.log('🩺 Fix: fehlende Nachtdienst-Schlafblöcke (00:00-06:00)')
  console.log(`   Modus: ${args.apply ? 'APPLY (schreibt!)' : 'DRY RUN (keine Änderungen)'}`)
  if (args.employee) console.log(`   Mitarbeiter-Filter (lastName enthält): "${args.employee}"`)
  if (args.from || args.to) console.log(`   Zeitraum: ${args.from ?? '…'} .. ${args.to ?? '…'} (Buchungsdatum)`)

  const client = new pg.Client({ connectionString: url })
  await client.connect()

  const where: string[] = [`te."entryType" IN ('WORK','SLEEP')`]
  const params: any[] = []
  if (args.employee) {
    params.push(`%${args.employee.toLowerCase()}%`)
    where.push(`lower(u."lastName") LIKE $${params.length}`)
  }
  if (args.from) {
    params.push(`${args.from} 00:00:00`)
    where.push(`te.date >= $${params.length}`)
  }
  if (args.to) {
    params.push(`${args.to} 23:59:59`)
    where.push(`te.date <= $${params.length}`)
  }

  const res = await client.query(
    `SELECT te.id, te."employeeId", u."firstName", u."lastName",
            te.date, te."startTime", te."endTime", te."entryType", te."sleepInterruptionMinutes"
     FROM time_entries te
     JOIN employees e ON e.id = te."employeeId"
     JOIN users u ON u.id = e."userId"
     WHERE ${where.join(' AND ')}
     ORDER BY te."employeeId", te.date, te."startTime"`,
    params
  )
  const rows: Row[] = res.rows

  // Gruppiere pro (employeeId, Buchungsdatum)
  const groups = new Map<string, Row[]>()
  for (const r of rows) {
    const key = `${r.employeeId}|${bookingDay(r)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(r)
  }

  type Missing = {
    employeeId: string
    name: string
    bookingDate: string
    anchor2359: Row
    newStartNaive: string
    newEndNaive: string
    newDateNaive: string
  }
  const missing: Missing[] = []

  for (const [, entries] of groups) {
    const has2359 = entries.find(isSleep2359)
    const has0601 = entries.some(isWork0601)
    const has0006 = entries.some(isSleep0006)
    if (has2359 && has0601 && !has0006) {
      const startDate = new Date(naiveToDate(has2359.endTime!).getTime() + 1000) // 23:59:59 + 1s = 00:00:00
      const endDate = new Date(startDate.getTime() + 6 * 60 * 60 * 1000) // + 6h
      missing.push({
        employeeId: has2359.employeeId,
        name: `${has2359.firstName} ${has2359.lastName}`,
        bookingDate: bookingDay(has2359),
        anchor2359: has2359,
        newStartNaive: dateToNaive(startDate),
        newEndNaive: dateToNaive(endDate),
        newDateNaive: has2359.date, // "YYYY-MM-DD 00:00:00"
      })
    }
  }

  missing.sort((a, b) => (a.name + a.bookingDate).localeCompare(b.name + b.bookingDate))

  console.log(`\n   Geprüfte Nachtdienst-Gruppen: ${groups.size}`)
  console.log(`   Betroffene Nächte (00:00-06:00 fehlt): ${missing.length}\n`)

  for (const m of missing) {
    console.log(
      `   • ${m.name.padEnd(28)} Buchungsdatum ${m.bookingDate}  ->  + SLEEP naive [${m.newStartNaive} .. ${m.newEndNaive}] (Wanduhr 00:00-06:00)`
    )
  }

  if (missing.length === 0) {
    console.log('\n✅ Keine fehlenden Schlafblöcke gefunden.')
    await client.end()
    return
  }

  if (!args.apply) {
    console.log('\n✅ DRY RUN beendet. Nichts geändert. Mit --apply schreiben.')
    await client.end()
    return
  }

  console.log('\n✍️  APPLY: erstelle fehlende Blöcke …')
  let created = 0
  for (const m of missing) {
    const id = makeCuid()
    await client.query(
      `INSERT INTO time_entries
        (id, "employeeId", date, "startTime", "endTime", "breakMinutes", "surchargeHours", "entryType", "sleepInterruptionMinutes", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 0, 0, 'SLEEP', 0, NOW(), NOW())`,
      [id, m.employeeId, m.newDateNaive, m.newStartNaive, m.newEndNaive]
    )
    created++
    console.log(`   ✓ ${m.name} ${m.bookingDate} (id=${id})`)
  }
  console.log(`\n✅ Fertig. ${created} Schlafblöcke ergänzt.`)
  console.log('   Hinweis: Monatssaldo bleibt unverändert (SLEEP zählt nicht in den Saldo).')

  await client.end()
}

main().catch((e) => {
  console.error('❌ Fehler:', e)
  process.exit(1)
})
