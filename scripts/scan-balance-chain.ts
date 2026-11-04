/**
 * READ-ONLY: Prüft die Stundensaldo-KETTE ALLER Mitarbeiter auf Anomalien
 * (Nov 2025 – Aug 2026) und zeigt nur die auffälligen Mitarbeiter.
 *
 * Zwei Prüfungen je Monat (ab dem 2. vorhandenen Monat):
 *   1) Ketten-Bruch:  gespeicherter Vortrag ≠ Saldo des Vormonats
 *   2) Delta-Mismatch: (Saldo − Vortrag) ≠ (Ist + Zuschlag − Soll)
 *
 * Der jeweils ERSTE vorhandene Monat (z.B. der November-Startsaldo) gilt als
 * Anker und wird nicht als Delta-Mismatch gewertet (Startsaldi sind gewollt).
 *
 * Aufruf:  npx tsx scripts/scan-balance-chain.ts
 */
process.env.TZ = 'Europe/Zurich'

import { readFileSync } from 'fs'
import pg from 'pg'

pg.types.setTypeParser(1114, (v: string) => v)

const r2 = (n: number) => Math.round(n * 100) / 100
const f = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2)

function loadEnvLocal(): Record<string, string> {
  const raw = readFileSync('.env.local', 'utf8')
  const env: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}

const SEQ: Array<{ y: number; m: number; key: string; label: string }> = []
for (const [y, m] of [
  [2025, 11], [2025, 12],
  [2026, 1], [2026, 2], [2026, 3], [2026, 4], [2026, 5], [2026, 6], [2026, 7], [2026, 8],
] as Array<[number, number]>) {
  SEQ.push({ y, m, key: `${y}-${String(m).padStart(2, '0')}`, label: `${String(m).padStart(2, '0')}/${y}` })
}

async function main() {
  const env = loadEnvLocal()
  const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL
  if (!url || !/^postgres/.test(url)) throw new Error('Keine Postgres DATABASE_URL in .env.local.')
  const client = new pg.Client({ connectionString: url })
  await client.connect()

  const emps = await client.query(
    `SELECT e.id, e."employmentType", u."firstName", u."lastName"
     FROM employees e JOIN users u ON u.id = e."userId" ORDER BY u."lastName"`
  )

  const bals = await client.query(
    `SELECT "employeeId", year, month, "targetHours", "actualHours", "surchargeHours",
            "previousBalance", balance
     FROM monthly_balances
     WHERE (year=2025 AND month>=11) OR (year=2026 AND month<=8)`
  )
  const byEmp = new Map<string, Map<string, any>>()
  for (const b of bals.rows) {
    const key = `${b.year}-${String(b.month).padStart(2, '0')}`
    if (!byEmp.has(b.employeeId)) byEmp.set(b.employeeId, new Map())
    byEmp.get(b.employeeId)!.set(key, b)
  }

  let flagged = 0
  console.log('\n=== Ketten-Check ALLER Mitarbeiter (Nov 2025 – Aug 2026) ===\n')

  for (const e of emps.rows) {
    const rows = byEmp.get(e.id)
    if (!rows) continue
    const issues: string[] = []
    let prevBalance: number | null = null
    let netOffset = 0 // aufsummierte Ketten-Brüche (Auswirkung auf aktuellen Saldo)

    for (const p of SEQ) {
      const b = rows.get(p.key)
      if (!b) continue
      if (prevBalance === null) {
        // Anker (erster vorhandener Monat) – Startsaldo, nicht prüfen
        prevBalance = Number(b.balance)
        continue
      }
      const storedPrev = Number(b.previousBalance)
      const chainBreak = r2(storedPrev - prevBalance)
      if (Math.abs(chainBreak) > 0.01) {
        issues.push(`${p.label}: Ketten-Bruch Vortrag ${storedPrev.toFixed(2)} ≠ Vormonat ${prevBalance.toFixed(2)} (${f(chainBreak)}h)`)
        netOffset += chainBreak
      }
      const chainDelta = r2(Number(b.balance) - storedPrev)
      const honestDelta = r2(Number(b.actualHours) + Number(b.surchargeHours) - Number(b.targetHours))
      if (Math.abs(chainDelta - honestDelta) > 0.1) {
        issues.push(`${p.label}: Delta-Mismatch – Saldo-Sprung ${f(chainDelta)} ≠ Ist+Zuschl−Soll ${f(honestDelta)} (${f(r2(chainDelta - honestDelta))}h)`)
      }
      prevBalance = Number(b.balance)
    }

    if (issues.length) {
      flagged++
      console.log(`■ ${e.firstName} ${e.lastName} (${e.employmentType})`)
      for (const i of issues) console.log(`     - ${i}`)
      if (Math.abs(netOffset) > 0.01) {
        console.log(`     => aktueller Saldo dadurch ca. ${f(r2(netOffset))}h zu ${netOffset > 0 ? 'HOCH' : 'TIEF'}`)
      }
      console.log('')
    }
  }

  if (flagged === 0) console.log('Keine Anomalien gefunden – alle Ketten sind schlüssig.')
  else console.log(`${flagged} Mitarbeiter mit Auffälligkeiten.`)

  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
