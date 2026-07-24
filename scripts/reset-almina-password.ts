/**
 * Setzt das Passwort eines Mitarbeiters (Default: Almina) auf ein temporäres
 * Passwort zurück. Schreibt DIREKT gegen die Produktions-DB (pg), analog zu den
 * bestehenden Wartungsskripten.
 *
 * READ-ONLY im Default (Dry-Run: zeigt nur, wen es treffen würde).
 * Schreibt nur mit --apply.
 *
 * Aufruf:
 *   npx tsx scripts/reset-almina-password.ts                          # Dry-Run (Almina)
 *   npx tsx scripts/reset-almina-password.ts --apply                  # setzt Passwort
 *   npx tsx scripts/reset-almina-password.ts --email x@y.ch --apply
 *   npx tsx scripts/reset-almina-password.ts --password 'NeuesPW!' --apply
 */
process.env.TZ = 'Europe/Zurich'

import { readFileSync } from 'fs'
import pg from 'pg'
import bcrypt from 'bcryptjs'

function loadEnvLocal(): Record<string, string> {
  const raw = readFileSync('.env.local', 'utf8')
  const env: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}

function parseArgs(argv: string[]) {
  let email = 'almina.mustafov@gmail.com'
  let password = 'Spitex2026!'
  let apply = false
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--email' && argv[i + 1]) email = argv[++i]
    else if (a === '--password' && argv[i + 1]) password = argv[++i]
    else if (a === '--apply') apply = true
  }
  return { email, password, apply }
}

async function main() {
  const { email, password, apply } = parseArgs(process.argv)
  const env = loadEnvLocal()
  const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL
  if (!url || !/^postgres/.test(url)) throw new Error('Keine Postgres DATABASE_URL in .env.local.')

  const client = new pg.Client({ connectionString: url })
  await client.connect()

  const found = await client.query(
    `SELECT id, email, "firstName", "lastName", role FROM users WHERE email = $1`,
    [email]
  )

  if (found.rows.length === 0) {
    console.log(`❌ Kein Benutzer mit E-Mail "${email}" gefunden.`)
    await client.end()
    process.exit(1)
  }

  const u = found.rows[0]
  console.log('🔐 Passwort-Reset')
  console.log(`   Benutzer: ${u.firstName} ${u.lastName} (${u.role})`)
  console.log(`   E-Mail:   ${u.email}`)
  console.log(`   Neues temporäres Passwort: ${password}`)

  if (!apply) {
    console.log('\n(DRY-RUN) Es wurde nichts geändert. Mit --apply ausführen, um das Passwort zu setzen.')
    await client.end()
    return
  }

  const hash = await bcrypt.hash(password, 10)
  await client.query(`UPDATE users SET password = $1, "updatedAt" = now() WHERE id = $2`, [hash, u.id])

  console.log('\n✅ Passwort erfolgreich gesetzt.')
  console.log(`   Login-E-Mail: ${u.email}`)
  console.log(`   Passwort:     ${password}`)
  console.log('   Bitte Almina bitten, sich damit einzuloggen und das Passwort danach zu ändern.')

  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
