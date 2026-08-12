/**
 * READ-ONLY: Analysiert die Stundensaldo-KETTE eines Mitarbeiters Monat für Monat,
 * um Fehler im kumulierten Saldo zu finden.
 *
 * Ausgabe pro Monat (Nov 2025 – Aug 2026):
 *   - Soll / Ist(gespeichert) / Zuschlag / Vortrag / Saldo(gespeichert)
 *   - Monatsdelta = Saldo - Vortrag
 *   - Konsistenz-Check: Vortrag == Saldo des Vormonats?
 *   - erfasste Stunden aus time_entries: Arbeit / Schlaf-Unterbrechung
 *     (=> vergleichbar mit Ist; Differenz = gutgeschriebene Absenzen K/FE)
 *   - K/FE-Tage aus dem Dienstplan
 *   - Auffälligkeiten: Einträge > 16h, Duplikate
 *   - Anpassungen (Auszahlungen) im Monat + kumuliert
 *   - ANGEZEIGTER kumulierter Saldo per Monatsende = Saldo + Anpassungen bis Monatsende
 *
 * Aufruf:  npx tsx scripts/inspect-almina-saldo.ts [Namensfilter]   (Default: figueiro)
 */
process.env.TZ = 'Europe/Zurich'

import { readFileSync } from 'fs'
import pg from 'pg'

// timestamp without time zone (1114) als rohen String behandeln (kein TZ-Shift).
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

const r2 = (n: number) => Math.round(n * 100) / 100
const f = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2)

// Monats-Sequenz Nov 2025 .. Aug 2026
const SEQ: Array<{ y: number; m: number; key: string; label: string }> = []
for (const [y, m] of [
  [2025, 11], [2025, 12],
  [2026, 1], [2026, 2], [2026, 3], [2026, 4], [2026, 5], [2026, 6], [2026, 7], [2026, 8],
] as Array<[number, number]>) {
  SEQ.push({ y, m, key: `${y}-${String(m).padStart(2, '0')}`, label: `${String(m).padStart(2, '0')}/${y}` })
}

async function main() {
  const filter = (process.argv[2] || 'figueiro').toLowerCase()
  const env = loadEnvLocal()
  const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL
  if (!url || !/^postgres/.test(url)) throw new Error('Keine Postgres DATABASE_URL in .env.local.')

  const client = new pg.Client({ connectionString: url })
  await client.connect()

  const emp = await client.query(
    `SELECT e.id, u."firstName", u."lastName", e."employmentType", e.pensum
     FROM employees e JOIN users u ON u.id = e."userId"
     WHERE lower(u."lastName") LIKE $1 OR lower(u."firstName") LIKE $1`,
    [`%${filter}%`]
  )
  if (emp.rows.length === 0) {
    console.log(`Keine MA gefunden für "${filter}".`)
    await client.end()
    return
  }

  for (const e of emp.rows) {
    console.log('='.repeat(78))
    console.log(`${e.firstName} ${e.lastName}  |  ${e.employmentType}  |  Pensum ${e.pensum}%  |  id=${e.id}`)
    console.log('='.repeat(78))

    // monthly_balances
    const balRows = await client.query(
      `SELECT year, month, "targetHours", "actualHours", "surchargeHours", "previousBalance", balance
       FROM monthly_balances WHERE "employeeId"=$1`,
      [e.id]
    )
    const balByKey = new Map<string, any>()
    for (const b of balRows.rows) balByKey.set(`${b.year}-${String(b.month).padStart(2, '0')}`, b)

    // time_entries: Arbeit (ohne SLEEP/SLEEP_INTERRUPTION) und Schlaf-Unterbrechung
    const teRows = await client.query(
      `SELECT to_char("date",'YYYY-MM') AS key,
              SUM(CASE WHEN "entryType" NOT IN ('SLEEP','SLEEP_INTERRUPTION') AND "endTime" IS NOT NULL
                       THEN EXTRACT(EPOCH FROM ("endTime"-"startTime"))/3600.0 - "breakMinutes"/60.0 ELSE 0 END) AS work_h,
              SUM(CASE WHEN "entryType"='SLEEP_INTERRUPTION' THEN "sleepInterruptionMinutes"/60.0 ELSE 0 END) AS interr_h,
              COUNT(*) AS n
       FROM time_entries WHERE "employeeId"=$1 GROUP BY 1`,
      [e.id]
    )
    const teByKey = new Map<string, any>()
    for (const t of teRows.rows) teByKey.set(t.key, t)

    // Auffällige Einzelbuchungen > 16h (Arbeit)
    const bigRows = await client.query(
      `SELECT to_char("date",'YYYY-MM-DD') AS d, "entryType",
              EXTRACT(EPOCH FROM ("endTime"-"startTime"))/3600.0 - "breakMinutes"/60.0 AS h
       FROM time_entries
       WHERE "employeeId"=$1 AND "entryType" NOT IN ('SLEEP','SLEEP_INTERRUPTION') AND "endTime" IS NOT NULL
         AND EXTRACT(EPOCH FROM ("endTime"-"startTime"))/3600.0 - "breakMinutes"/60.0 > 16
       ORDER BY h DESC`,
      [e.id]
    )

    // Duplikate (gleicher Tag/Start/Ende/Typ mehrfach)
    const dupRows = await client.query(
      `SELECT to_char("date",'YYYY-MM-DD') AS d, "startTime", "endTime", "entryType", COUNT(*) AS c
       FROM time_entries WHERE "employeeId"=$1
       GROUP BY 1,2,3,4 HAVING COUNT(*) > 1 ORDER BY 1`,
      [e.id]
    )

    // K/FE Tage aus Dienstplan
    const absRows = await client.query(
      `SELECT to_char(se."date",'YYYY-MM') AS key, s.name, COUNT(*) AS c
       FROM schedule_entries se JOIN services s ON s.id=se."serviceId"
       WHERE se."employeeId"=$1 AND s.name IN ('K','FE') GROUP BY 1,2`,
      [e.id]
    )
    const absByKey = new Map<string, Record<string, number>>()
    for (const a of absRows.rows) {
      const cur = absByKey.get(a.key) ?? {}
      cur[a.name] = Number(a.c)
      absByKey.set(a.key, cur)
    }

    // Anpassungen (alle Arten)
    const adjRows = await client.query(
      `SELECT to_char("effectiveDate",'YYYY-MM-DD') AS d, minutes, kind, reason
       FROM hour_balance_adjustments WHERE "employeeId"=$1 ORDER BY "effectiveDate"`,
      [e.id]
    )

    // Ausgabe-Tabelle
    console.log(
      ['Monat'.padEnd(8), 'Soll'.padStart(8), 'Ist(DB)'.padStart(9), 'Zuschl'.padStart(7),
       'Vortrag'.padStart(9), 'Saldo(DB)'.padStart(10), 'Delta'.padStart(8),
       'Arb(TE)'.padStart(8), 'Unterbr'.padStart(8), 'K/FE'.padStart(6), 'ChkVortr'.padStart(9)].join(' ')
    )
    console.log('-'.repeat(110))

    let prevBalance = 0
    const anomalies: string[] = []
    const adjMinutesByMonthEnd = (key: string) => {
      // Summe aller SALDO-Anpassungen mit effectiveDate <= Ende des Monats key
      const [yy, mm] = key.split('-').map(Number)
      const end = new Date(yy, mm, 0, 23, 59, 59)
      let s = 0
      for (const a of adjRows.rows) {
        if (a.kind !== 'SALDO') continue
        const d = new Date(String(a.d))
        if (d <= end) s += Number(a.minutes || 0)
      }
      return s
    }

    for (const p of SEQ) {
      const b = balByKey.get(p.key)
      const te = teByKey.get(p.key)
      const abs = absByKey.get(p.key) ?? {}
      if (!b) {
        console.log(`${p.label.padEnd(8)}  (kein monthly_balance-Eintrag)`)
        continue
      }
      const delta = r2(b.balance - b.previousBalance)
      const chk = r2(b.previousBalance - prevBalance) // sollte 0 sein (Vortrag == Vormonatssaldo)
      const workH = te ? Number(te.work_h) : 0
      const interrH = te ? Number(te.interr_h) : 0
      const kfe = `${abs['K'] ?? 0}/${abs['FE'] ?? 0}`

      // Rechnerisch erklärbares Monatsdelta aus gespeicherten Werten:
      const honestDelta = r2(Number(b.actualHours) + Number(b.surchargeHours) - Number(b.targetHours))
      if (Math.abs(honestDelta - delta) > 0.1) {
        anomalies.push(
          `${p.label}: Saldo-Sprung ${f(delta)}h, aber Ist+Zuschlag-Soll erklärt nur ${f(honestDelta)}h ` +
            `=> ${f(r2(delta - honestDelta))}h unerklärt`
        )
      }
      if (Math.abs(chk) >= 0.01) {
        anomalies.push(`${p.label}: Ketten-Bruch – Vortrag ${Number(b.previousBalance).toFixed(2)} ≠ Vormonatssaldo ${prevBalance.toFixed(2)} (${f(chk)}h)`)
      }
      console.log(
        [
          p.label.padEnd(8),
          Number(b.targetHours).toFixed(2).padStart(8),
          Number(b.actualHours).toFixed(2).padStart(9),
          Number(b.surchargeHours).toFixed(2).padStart(7),
          Number(b.previousBalance).toFixed(2).padStart(9),
          Number(b.balance).toFixed(2).padStart(10),
          f(delta).padStart(8),
          r2(workH).toFixed(2).padStart(8),
          r2(interrH).toFixed(2).padStart(8),
          kfe.padStart(6),
          (Math.abs(chk) < 0.01 ? 'ok' : `!!${f(chk)}`).padStart(9),
        ].join(' ')
      )
      prevBalance = b.balance
    }

    console.log('-'.repeat(110))
    if (anomalies.length) {
      console.log('\n!!! GEFUNDENE ANOMALIEN (hier stimmt die Kette nicht):')
      for (const a of anomalies) console.log('   - ' + a)
    } else {
      console.log('\nKeine Ketten-Anomalien gefunden (Kette in sich schlüssig).')
    }
    console.log('')
    console.log('Angezeigter KUMULIERTER Saldo per Monatsende (Saldo(DB) + SALDO-Anpassungen bis Monatsende):')
    for (const p of SEQ) {
      const b = balByKey.get(p.key)
      if (!b) continue
      const adjH = adjMinutesByMonthEnd(p.key) / 60
      console.log(`  Ende ${p.label}:  ${f(r2(b.balance + adjH))} h   (Saldo ${f(r2(b.balance))} + Anpassungen ${f(r2(adjH))})`)
    }

    console.log('\nAnpassungen (hour_balance_adjustments):')
    if (adjRows.rows.length === 0) console.log('  keine')
    for (const a of adjRows.rows) {
      console.log(`  ${a.d}  ${String(a.kind).padEnd(6)} ${f(Number(a.minutes) / 60)} h  "${a.reason}"`)
    }

    if (bigRows.rows.length) {
      console.log('\n!! Auffällige Einzelbuchungen (> 16h Arbeit):')
      for (const x of bigRows.rows) console.log(`  ${x.d}  ${x.entryType}  ${Number(x.h).toFixed(2)} h`)
    }
    if (dupRows.rows.length) {
      console.log('\n!! Mögliche Duplikate (gleicher Tag/Start/Ende/Typ mehrfach):')
      for (const x of dupRows.rows) console.log(`  ${x.d}  ${x.entryType}  ${x.c}x`)
    }
    console.log('')
  }

  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
