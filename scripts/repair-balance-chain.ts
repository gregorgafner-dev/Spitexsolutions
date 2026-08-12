/**
 * Repariert die Vortrags-KETTE der Monatssalden (previousBalance/balance), ohne
 * das Ist neu zu berechnen und ohne rückwirkend Absenzen einzurechnen.
 *
 * Hintergrund: Einzelne Monate hatten einen "Ketten-Bruch" – der Vortrag stimmte
 * nicht mit dem Saldo des Vormonats überein, wodurch der kumulierte Saldo zu hoch
 * wurde. Dieses Skript setzt je Monat:
 *     previousBalance = Saldo des (reparierten) Vormonats
 *     balance         = previousBalance + (gespeichertes Ist + Zuschlag − Soll)
 * Die gespeicherten Ist-/Soll-/Zuschlag-Werte bleiben unangetastet.
 *
 * Der ANKER (Monat vor --from) wird NICHT verändert (z.B. ein bewusst gesetzter
 * Startsaldo im November 2025 bleibt erhalten).
 *
 * READ-ONLY im Default (Dry-Run). Schreibt nur mit --apply.
 * Aufruf:
 *   npx tsx scripts/repair-balance-chain.ts figueiro                 # Dry-Run (Dez 2025–Aug 2026)
 *   npx tsx scripts/repair-balance-chain.ts figueiro --apply         # schreibt
 *   npx tsx scripts/repair-balance-chain.ts figueiro --from=2026-03 --to=2026-07
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

function arg(name: string, def: string): string {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a ? a.split('=')[1] : def
}

function monthSeq(fromKey: string, toKey: string): Array<{ y: number; m: number }> {
  const [fy, fm] = fromKey.split('-').map(Number)
  const [ty, tm] = toKey.split('-').map(Number)
  const out: Array<{ y: number; m: number }> = []
  let y = fy
  let m = fm
  while (y < ty || (y === ty && m <= tm)) {
    out.push({ y, m })
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}

async function main() {
  const apply = process.argv.includes('--apply')
  const filter = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'figueiro').toLowerCase()
  const fromKey = arg('from', '2025-12')
  const toKey = arg('to', '2026-08')

  const env = loadEnvLocal()
  const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL
  if (!url || !/^postgres/.test(url)) throw new Error('Keine Postgres DATABASE_URL in .env.local.')
  const client = new pg.Client({ connectionString: url })
  await client.connect()

  const emps = await client.query(
    `SELECT e.id, u."firstName", u."lastName" FROM employees e JOIN users u ON u.id = e."userId"
     WHERE lower(u."lastName") LIKE $1 OR lower(u."firstName") LIKE $1 ORDER BY u."lastName"`,
    [`%${filter}%`]
  )
  if (emps.rows.length === 0) {
    console.log(`Keine MA gefunden für "${filter}".`)
    await client.end()
    return
  }

  const seq = monthSeq(fromKey, toKey)
  const anchor = (() => {
    const [fy, fm] = fromKey.split('-').map(Number)
    return fm === 1 ? { y: fy - 1, m: 12 } : { y: fy, m: fm - 1 }
  })()

  console.log(`\n=== Ketten-Reparatur ${fromKey}..${toKey} (${apply ? 'APPLY – SCHREIBT!' : 'DRY-RUN'}) ===`)
  console.log(`Anker (unverändert): ${anchor.y}-${String(anchor.m).padStart(2, '0')}\n`)

  let totalChanges = 0
  for (const e of emps.rows) {
    const anchorRow = await client.query(
      `SELECT balance FROM monthly_balances WHERE "employeeId"=$1 AND year=$2 AND month=$3`,
      [e.id, anchor.y, anchor.m]
    )
    let prevBalance = anchorRow.rows[0] ? Number(anchorRow.rows[0].balance) : 0

    console.log(`— ${e.firstName} ${e.lastName} — Ankersaldo ${prevBalance.toFixed(2)}h`)

    for (const p of seq) {
      const row = await client.query(
        `SELECT id,"actualHours","surchargeHours","targetHours",balance,"previousBalance"
         FROM monthly_balances WHERE "employeeId"=$1 AND year=$2 AND month=$3`,
        [e.id, p.y, p.m]
      )
      if (row.rows.length === 0) {
        // Kein Saldo-Eintrag für diesen Monat -> Kette läuft unverändert weiter.
        continue
      }
      const rec = row.rows[0]
      const monthDelta = r2(Number(rec.actualHours) + Number(rec.surchargeHours) - Number(rec.targetHours))
      const newPrev = r2(prevBalance)
      const newBalance = r2(prevBalance + monthDelta)
      const oldBalance = Number(rec.balance)
      const oldPrev = Number(rec.previousBalance)
      const changed = Math.abs(newBalance - oldBalance) > 0.005 || Math.abs(newPrev - oldPrev) > 0.005

      const label = `${p.y}-${String(p.m).padStart(2, '0')}`
      if (changed) {
        totalChanges++
        console.log(
          `   ${label}: Vortrag ${oldPrev.toFixed(2)}→${newPrev.toFixed(2)}  |  ` +
            `Saldo ${oldBalance.toFixed(2)}→${newBalance.toFixed(2)}  (Delta ${f(monthDelta)})`
        )
        if (apply) {
          await client.query(
            `UPDATE monthly_balances SET balance=$1, "previousBalance"=$2, "updatedAt"=now() WHERE id=$3`,
            [newBalance, newPrev, rec.id]
          )
        }
      }
      prevBalance = newBalance
    }
  }

  console.log(`\n${totalChanges} Monatssaldo-Zeile(n) ${apply ? 'GESCHRIEBEN' : 'würden geändert (Dry-Run)'}.`)
  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
